// ─── Chatwoot Polling Service v4 ──────────────────────────────────────────────
// Detecta TODAS as mensagens novas por conversa, sem perda em burst

const POLL_INTERVAL = 3000

// convId → maior messageId processado (número para comparação correta)
const lastProcessedId = new Map()
const processedSet    = new Set()  // dedup global, últimos 500
let pollTimer  = null
let isPolling  = false
let warmDone   = false
let deps       = null

// ─── Dedup global ─────────────────────────────────────────────────────────────
function alreadySeen(msgId) {
  const id = String(msgId)
  if (processedSet.has(id)) return true
  processedSet.add(id)
  if (processedSet.size > 500) processedSet.delete(processedSet.values().next().value)
  return false
}

// ─── Busca mensagens novas de uma conversa ────────────────────────────────────
async function fetchNewMessages(convId) {
  try {
    const messages = await deps.cw.getMessages(convId)
    if (!messages?.length) return []

    const sinceId = lastProcessedId.get(convId) || 0

    // Filtra: só mensagens com ID maior que o último processado
    // Ignora mensagens de atividade (tipo 2)
    const newMsgs = messages
      .filter(m => m.message_type !== 2 && Number(m.id) > sinceId)
      .sort((a, b) => Number(a.id) - Number(b.id))  // ordem cronológica

    return newMsgs
  } catch {
    return []
  }
}

// ─── Processa uma mensagem ────────────────────────────────────────────────────
function processMessage(convId, msg, conv) {
  if (alreadySeen(msg.id)) return

  const content    = msg.content || (msg.attachments?.length ? '[Arquivo]' : '')
  const mt         = msg.message_type
  const isInbound  = mt === 0 || mt === '0' || mt === 'incoming'
  const senderName = msg.sender?.name || conv?.meta?.sender?.name || ''
  const now        = new Date().toISOString()

  console.log(`[Poll] msg conv=${convId} id=${msg.id} type=${isInbound ? 'IN' : 'OUT'} sender="${senderName}" content="${content.slice(0, 40)}"`)

  const mappedMsg = deps.mapMessage(msg)

  // Atualiza store em memória
  deps.store.updateLastMessage(convId, content)
  if (deps.store.updateLastMessageAt) deps.store.updateLastMessageAt(convId, content, now)

  // Atualiza Supabase
  if (deps.db.DB_READY?.()) {
    deps.db.updateLastMessage(convId, content, now).catch(() => {})
    if (isInbound) deps.db.incrementUnread(convId).catch(() => {})
  }

  // Socket.IO — new_message
  deps.io.emit('new_message', {
    conversationId: convId,
    message: { ...mappedMsg, senderName },
    lastMessageAt: now,
    content,
    isInbound,
    senderName,
  })

  // Socket.IO — unread_update (só inbound)
  if (isInbound) {
    const count = deps.store.incrementUnread(convId)
    deps.io.emit('unread_update', { conversationId: convId, count, updatedAt: now })
  }
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

    // Processa em paralelo limitado (máx 5 simultâneos) para não explodir a API
    const changed = convs.filter(conv => {
      const lastMsg = conv.last_non_activity_message
      if (!lastMsg?.id) return false
      const cached = lastProcessedId.get(String(conv.id))
      return cached !== undefined && Number(lastMsg.id) > (cached || 0)
    })

    if (!changed.length) { isPolling = false; return }

    // Processa cada conversa com mudança
    for (const conv of changed) {
      const convId   = String(conv.id)
      const newMsgs  = await fetchNewMessages(convId)

      if (!newMsgs.length) continue

      // Processa todas as mensagens novas em ordem
      for (const msg of newMsgs) {
        processMessage(convId, msg, conv)
      }

      // Atualiza cursor para o maior ID processado
      const maxId = Math.max(...newMsgs.map(m => Number(m.id)))
      lastProcessedId.set(convId, maxId)
    }

    // Atualiza cache de referência para conversas não alteradas
    for (const conv of convs) {
      const convId  = String(conv.id)
      const lastMsg = conv.last_non_activity_message
      if (lastMsg?.id && lastProcessedId.get(convId) === undefined) {
        lastProcessedId.set(convId, Number(lastMsg.id))
      }
    }

  } catch (e) {
    if (!e.message?.includes('abort')) console.warn('[Poll] Erro:', e.message)
  }

  isPolling = false
}

// ─── Warmup ───────────────────────────────────────────────────────────────────
async function warmUp() {
  try {
    const convs = await deps.cw.getConversations({
      page: 1,
      status: 'open',
      inboxId: deps.targetInboxId || undefined,
    })
    for (const conv of convs || []) {
      const convId  = String(conv.id)
      const lastMsg = conv.last_non_activity_message
      if (lastMsg?.id) {
        lastProcessedId.set(convId, Number(lastMsg.id))
        alreadySeen(lastMsg.id)
      }
    }
    console.log(`[Poll] ✅ Cache aquecido: ${lastProcessedId.size} conversas`)
    warmDone = true
  } catch (e) {
    console.warn('[Poll] Warmup falhou:', e.message)
    warmDone = true
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────
function start(injected) {
  if (pollTimer) return
  deps = injected
  console.log(`[Poll] ✅ Iniciado — detecção por messageId, intervalo ${POLL_INTERVAL / 1000}s`)
  warmUp().then(() => { pollTimer = setInterval(poll, POLL_INTERVAL) })
}

function stop() {
  clearInterval(pollTimer)
  pollTimer = null
}

module.exports = { start, stop }
