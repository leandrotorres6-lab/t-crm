// ─── Chatwoot Polling Service v5 ──────────────────────────────────────────────
// Detecção robusta: último messageId por conversa, sem depender de unread_count
// Tolerante a bot rápido, múltiplas mensagens e delay de API

const POLL_INTERVAL = 3000

const lastProcessedId = new Map()  // convId → último msgId processado
const processedSet    = new Set()  // dedup global (últimos 1000)
const knownConvIds    = new Set()  // conversas vistas no warmup ou depois
let pollTimer  = null
let isPolling  = false
let warmDone   = false
let deps       = null

// ─── Dedup ────────────────────────────────────────────────────────────────────
function alreadySeen(msgId) {
  const id = String(msgId)
  if (processedSet.has(id)) return true
  processedSet.add(id)
  if (processedSet.size > 1000) processedSet.delete(processedSet.values().next().value)
  return false
}

// ─── Busca mensagens novas (mais recentes que sinceId) ────────────────────────
async function fetchNewMessages(convId, sinceId) {
  try {
    const messages = await deps.cw.getMessages(convId)
    if (!messages?.length) return []
    return messages
      .filter(m => m.message_type !== 2 && Number(m.id) > sinceId)
      .sort((a, b) => Number(a.id) - Number(b.id))
  } catch {
    return []
  }
}

// ─── Processa uma mensagem ────────────────────────────────────────────────────
function processMessage(convId, msg, senderFallback) {
  const msgId = String(msg.id)
  if (alreadySeen(msgId)) return

  const content    = msg.content || (msg.attachments?.length ? '[Arquivo]' : '')
  const mt         = msg.message_type
  const isInbound  = mt === 0 || mt === '0' || mt === 'incoming'
  const senderName = msg.sender?.name || senderFallback || ''
  const now        = new Date().toISOString()

  console.log(`[Poll] ${isInbound ? '📩 IN' : '📤 OUT'} conv=${convId} id=${msg.id} sender="${senderName}" "${content.slice(0,40)}"`)

  const mappedMsg = deps.mapMessage(msg)

  // Store + Supabase
  deps.store.updateLastMessage(convId, content)
  if (deps.store.updateLastMessageAt) deps.store.updateLastMessageAt(convId, content, now)
  if (deps.db.DB_READY?.()) {
    deps.db.updateLastMessage(convId, content, now).catch(() => {})
    if (isInbound) deps.db.incrementUnread(convId).catch(() => {})
  }

  // Reabre conversa resolvida ao receber inbound (comportamento do Chatwoot)
  // A conversa vem com status='open' automaticamente do Chatwoot quando cliente responde
  // Aqui só emitimos evento para o frontend atualizar
  // (O Chatwoot já reabre automaticamente ao receber mensagem inbound)

  // Socket — emite SEMPRE (inbound e outbound)
  deps.io.emit('new_message', {
    conversationId: convId,
    message: { ...mappedMsg, senderName },
    lastMessageAt: now,
    content,
    isInbound,
    senderName,
  })

  // unread_update só para inbound — independente do Chatwoot/bot
  if (isInbound) {
    const count = deps.store.incrementUnread(convId)
    console.log(`[Poll] 🔔 unread conv=${convId} count=${count}`)
    deps.io.emit('unread_update', { conversationId: convId, count, updatedAt: now })
  }
}

// ─── Ciclo principal ──────────────────────────────────────────────────────────
async function poll() {
  if (isPolling || !warmDone) return
  isPolling = true

  try {
    const convs = await deps.cw.getConversations({
      page: 1, status: 'open',
      inboxId: deps.targetInboxId || undefined,
    })
    if (!convs?.length) { isPolling = false; return }

    for (const conv of convs) {
      const convId  = String(conv.id)
      const lastMsg = conv.last_non_activity_message
      const lastId  = lastMsg?.id ? Number(lastMsg.id) : 0

      // ── Conversa nova ou reaberta (não vista no cache atual) ─────────────
      if (!knownConvIds.has(convId)) {
        knownConvIds.add(convId)
        lastProcessedId.set(convId, lastId)
        alreadySeen(lastMsg?.id)
        const currentCol = deps.store.getColumn?.(convId)
        // Se não tem coluna definida, trata como nova → leads
        const mapped = deps.mapConversation(conv, currentCol || 'leads')
        if (!currentCol) {
          console.log(`[Poll] 🆕 Nova/reaberta conv=${convId} name="${mapped.name}" → leads`)
          if (deps.db.DB_READY?.()) deps.db.upsertLead({ ...mapped, unreadCount: 1 }).catch(() => {})
          deps.io.emit('new_conversation', { ...mapped, unreadCount: 1 })
        }
        continue
      }

      // ── Verifica se há mensagem nova ──────────────────────────────────────
      const cachedId = lastProcessedId.get(convId) || 0
      if (!lastId || lastId <= cachedId) continue  // sem mudança

      // Mudança detectada — busca mensagens novas via API
      const newMsgs = await fetchNewMessages(convId, cachedId)

      if (!newMsgs.length) {
        // API não retornou nada novo — avança cursor para evitar loop
        lastProcessedId.set(convId, lastId)
        continue
      }

      const senderFallback = conv.meta?.sender?.name || ''
      for (const msg of newMsgs) {
        processMessage(convId, msg, senderFallback)
      }

      // Avança cursor para o maior ID processado
      const maxId = Math.max(...newMsgs.map(m => Number(m.id)), lastId)
      lastProcessedId.set(convId, maxId)
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
      page: 1, status: 'open',
      inboxId: deps.targetInboxId || undefined,
    })
    for (const conv of convs || []) {
      const convId  = String(conv.id)
      const lastMsg = conv.last_non_activity_message
      const lastId  = lastMsg?.id ? Number(lastMsg.id) : 0
      knownConvIds.add(convId)
      lastProcessedId.set(convId, lastId)
      if (lastMsg?.id) alreadySeen(lastMsg.id)
    }
    console.log(`[Poll] ✅ Warmup: ${lastProcessedId.size} conversas indexadas`)
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
  if (!deps.mapConversation) {
    deps.mapConversation = (conv, col) => ({
      id: String(conv.id),
      name: conv.meta?.sender?.name || `Contato #${conv.id}`,
      phone: conv.meta?.sender?.phone_number || '',
      column: col || 'leads',
      lastMessage: conv.last_non_activity_message?.content || '',
      unreadCount: 1,
      assignedTo: conv.meta?.assignee?.id ? String(conv.meta.assignee.id) : null,
      assigneeName: conv.meta?.assignee?.name || '',
    })
  }
  console.log(`[Poll] ✅ Iniciado — intervalo ${POLL_INTERVAL/1000}s, detecção por messageId`)
  warmUp().then(() => { pollTimer = setInterval(poll, POLL_INTERVAL) })
}

function stop() {
  clearInterval(pollTimer); pollTimer = null
}

module.exports = { start, stop }
