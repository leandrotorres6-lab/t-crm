// ─── Chatwoot Polling Service v2 ──────────────────────────────────────────────
// Polling com paginação completa, deduplicação persistente e busca de mensagem real

const POLL_INTERVAL = 3000

// Estado em memória
const activityCache = new Map()     // convId → last_activity_at
const processedMsgs = new Set()     // msgIds processados (últimos 500)
let lastGlobalCheck = 0             // timestamp epoch da última verificação global
let pollTimer = null
let isPolling = false
let deps = null                     // dependências injetadas

// ── Paginação: busca até 4 páginas (100 conversas) ───────────────────────────
async function fetchUpdatedConversations() {
  const { cw, targetInboxId } = deps
  const results = []
  const maxPages = 4

  for (let page = 1; page <= maxPages; page++) {
    try {
      const convs = await cw.getConversations({
        page, status: 'open',
        inboxId: targetInboxId || undefined,
      })
      if (!convs || !convs.length) break
      results.push(...convs)
      if (convs.length < 25) break // última página
    } catch (e) {
      if (!e.message?.includes('abort')) console.warn(`[Poll] Página ${page} falhou:`, e.message)
      break
    }
  }

  // Filtra: só conversas com atividade após lastGlobalCheck
  if (lastGlobalCheck > 0) {
    return results.filter(c => (c.last_activity_at || 0) > lastGlobalCheck)
  }
  return results
}

// ── Busca última mensagem real de uma conversa ───────────────────────────────
async function fetchLatestMessage(convId) {
  try {
    const messages = await deps.cw.getMessages(convId)
    if (!messages || !messages.length) return null
    // Última mensagem não-atividade (tipo 0 ou 1, ignora tipo 2=activity)
    const real = messages.filter(m => m.message_type !== 2)
    return real.length ? real[real.length - 1] : null
  } catch {
    return null
  }
}

// ── Deduplicação: verifica e registra msgId ──────────────────────────────────
function isDuplicate(msgId) {
  if (processedMsgs.has(msgId)) return true
  processedMsgs.add(msgId)
  // Limpa se ficar grande demais
  if (processedMsgs.size > 500) {
    const first = processedMsgs.values().next().value
    processedMsgs.delete(first)
  }
  return false
}

// ── Ciclo principal de polling ───────────────────────────────────────────────
async function poll() {
  if (isPolling) return
  isPolling = true

  try {
    const updated = await fetchUpdatedConversations()

    for (const conv of updated) {
      const convId = String(conv.id)
      const lastActivity = conv.last_activity_at || 0
      const cachedActivity = activityCache.get(convId) || 0

      // Sem atividade nova para esta conversa
      if (lastActivity <= cachedActivity) continue
      activityCache.set(convId, lastActivity)

      // Busca mensagem real da API (não confia só em last_non_activity_message)
      let msg = null
      const quickMsg = conv.last_non_activity_message
      if (quickMsg?.id && !isDuplicate(String(quickMsg.id))) {
        msg = quickMsg
      } else if (quickMsg?.id && isDuplicate(String(quickMsg.id))) {
        // Já processou essa mensagem, pode ser outra mudança (label, assign)
        continue
      } else {
        // Sem mensagem rápida — busca via API
        const fetched = await fetchLatestMessage(convId)
        if (!fetched || isDuplicate(String(fetched.id))) continue
        msg = fetched
      }

      if (!msg) continue

      // Processa a mensagem
      const mappedMsg = deps.mapMessage(msg)
      const content = msg.content || (msg.attachments?.length ? '[Arquivo]' : '')
      const mt = msg.message_type
      const isInbound = mt === 0 || mt === '0' || mt === 'incoming'
      const senderName = msg.sender?.name || conv.meta?.sender?.name || ''
      const now = new Date().toISOString()

      console.log(`[Poll] Nova msg conv=${convId} msgId=${msg.id} type=${isInbound ? 'IN' : 'OUT'} sender="${senderName}" content="${content.slice(0, 40)}"`)

      // Atualiza store em memória
      deps.store.updateLastMessage(convId, content)
      if (deps.store.updateLastMessageAt) {
        deps.store.updateLastMessageAt(convId, content, now)
      }

      // Atualiza Supabase
      if (deps.db.DB_READY && deps.db.DB_READY()) {
        deps.db.updateLastMessage(convId, content, now).catch(() => {})
        if (isInbound) deps.db.incrementUnread(convId).catch(() => {})
      }

      // Emite via Socket.IO
      deps.io.emit('new_message', {
        conversationId: convId,
        message: { ...mappedMsg, senderName },
        lastMessageAt: now,
        content,
        isInbound,
        senderName,
      })

      if (isInbound) {
        const count = deps.store.incrementUnread(convId)
        deps.io.emit('unread_update', {
          conversationId: convId,
          count,
          updatedAt: now,
        })
      }
    }

    // Atualiza checkpoint global
    if (updated.length > 0) {
      const maxActivity = Math.max(...updated.map(c => c.last_activity_at || 0))
      if (maxActivity > lastGlobalCheck) lastGlobalCheck = maxActivity
    }

  } catch (e) {
    if (!e.message?.includes('abort')) {
      console.warn('[Poll] Erro no ciclo:', e.message)
    }
  }

  isPolling = false
}

// ── Warmup: preenche cache sem emitir eventos ────────────────────────────────
async function warmUp() {
  try {
    const { cw, targetInboxId } = deps
    let maxActivity = 0

    for (let page = 1; page <= 4; page++) {
      const convs = await cw.getConversations({
        page, status: 'open',
        inboxId: targetInboxId || undefined,
      })
      if (!convs || !convs.length) break

      for (const conv of convs) {
        const convId = String(conv.id)
        const activity = conv.last_activity_at || 0
        activityCache.set(convId, activity)
        if (activity > maxActivity) maxActivity = activity
        if (conv.last_non_activity_message?.id) {
          processedMsgs.add(String(conv.last_non_activity_message.id))
        }
      }

      if (convs.length < 25) break
    }

    lastGlobalCheck = maxActivity
    console.log(`[Poll] Cache aquecido: ${activityCache.size} conversas, checkpoint: ${new Date(maxActivity * 1000).toISOString().slice(0,19)}`)
  } catch (e) {
    console.warn('[Poll] Warmup falhou:', e.message)
  }
}

// ── Start / Stop ─────────────────────────────────────────────────────────────
function start(injected) {
  if (pollTimer) return
  deps = injected
  console.log(`[Poll] ✅ Polling iniciado (intervalo: ${POLL_INTERVAL / 1000}s, até 100 conversas)`)

  warmUp().then(() => {
    pollTimer = setInterval(poll, POLL_INTERVAL)
  })
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  console.log('[Poll] ⏹ Parado')
}

module.exports = { start, stop }
