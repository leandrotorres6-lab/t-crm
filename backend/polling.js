// ─── Chatwoot Polling Service v3 ──────────────────────────────────────────────
// Detecção por last_non_activity_message.id — sem depender de last_activity_at
// 1 chamada à API por ciclo (página 1 = 25 conversas mais recentes)

const POLL_INTERVAL = 3000

const lastMsgIdCache = new Map()   // convId → último messageId processado
const processedSet  = new Set()    // deduplica por msgId global (últimos 500)
let pollTimer   = null
let isPolling   = false
let warmDone    = false
let deps        = null

// ─── Deduplicação global ──────────────────────────────────────────────────────
function seen(msgId) {
  const id = String(msgId)
  if (processedSet.has(id)) return true
  processedSet.add(id)
  if (processedSet.size > 500) {
    processedSet.delete(processedSet.values().next().value)
  }
  return false
}

// ─── Ciclo principal ──────────────────────────────────────────────────────────
async function poll() {
  if (isPolling || !warmDone) return
  isPolling = true

  try {
    const convs = await deps.cw.getConversations({
      page: 1,
      status: 'open',
      inboxId: deps.targetInboxId || undefined,
    })
    if (!convs?.length) { isPolling = false; return }

    for (const conv of convs) {
      const convId   = String(conv.id)
      const lastMsg  = conv.last_non_activity_message
      if (!lastMsg?.id) continue

      const msgId    = String(lastMsg.id)
      const cached   = lastMsgIdCache.get(convId)

      // Sem mudança nesta conversa
      if (cached === msgId) continue

      // Atualiza cache
      lastMsgIdCache.set(convId, msgId)

      // Primeira vez que vemos esta conversa (warmup perdido) → ignora
      if (!cached) continue

      // Duplicata global → ignora
      if (seen(msgId)) continue

      // ── Nova mensagem detectada ──────────────────────────────────────────────
      const content  = lastMsg.content || (lastMsg.attachments?.length ? '[Arquivo]' : '')
      const mt       = lastMsg.message_type
      const isInbound = mt === 0 || mt === '0' || mt === 'incoming'
      const senderName = lastMsg.sender?.name || conv.meta?.sender?.name || ''
      const now = new Date().toISOString()

      console.log(`[Poll] Nova msg conv=${convId} msgId=${msgId} type=${isInbound ? 'IN' : 'OUT'} sender="${senderName}" content="${content.slice(0, 40)}"`)

      const mappedMsg = deps.mapMessage(lastMsg)

      // Atualiza store em memória
      deps.store.updateLastMessage(convId, content)
      if (deps.store.updateLastMessageAt) {
        deps.store.updateLastMessageAt(convId, content, now)
      }

      // Atualiza Supabase
      if (deps.db.DB_READY?.()) {
        deps.db.updateLastMessage(convId, content, now).catch(() => {})
        if (isInbound) deps.db.incrementUnread(convId).catch(() => {})
      }

      // Emite new_message via Socket.IO
      deps.io.emit('new_message', {
        conversationId: convId,
        message: { ...mappedMsg, senderName },
        lastMessageAt: now,
        content,
        isInbound,
        senderName,
      })

      // Emite unread_update
      if (isInbound) {
        const count = deps.store.incrementUnread(convId)
        deps.io.emit('unread_update', {
          conversationId: convId,
          count,
          updatedAt: now,
        })
      }
    }
  } catch (e) {
    if (!e.message?.includes('abort')) {
      console.warn('[Poll] Erro:', e.message)
    }
  }

  isPolling = false
}

// ─── Warmup: preenche cache sem emitir ───────────────────────────────────────
async function warmUp() {
  try {
    const convs = await deps.cw.getConversations({
      page: 1,
      status: 'open',
      inboxId: deps.targetInboxId || undefined,
    })
    for (const conv of convs || []) {
      const convId = String(conv.id)
      const lastMsg = conv.last_non_activity_message
      if (lastMsg?.id) {
        const msgId = String(lastMsg.id)
        lastMsgIdCache.set(convId, msgId)
        processedSet.add(msgId)
      }
    }
    console.log(`[Poll] Cache aquecido: ${lastMsgIdCache.size} conversas`)
    warmDone = true
  } catch (e) {
    console.warn('[Poll] Warmup falhou:', e.message)
    warmDone = true  // continua mesmo se warmup falhar
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────
function start(injected) {
  if (pollTimer) return
  deps = injected
  console.log(`[Poll] ✅ Polling iniciado — detecção por messageId (${POLL_INTERVAL / 1000}s)`)
  warmUp().then(() => {
    pollTimer = setInterval(poll, POLL_INTERVAL)
  })
}

function stop() {
  clearInterval(pollTimer)
  pollTimer = null
  console.log('[Poll] ⏹ Parado')
}

module.exports = { start, stop }
