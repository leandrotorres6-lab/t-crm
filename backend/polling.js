// ─── Chatwoot Polling Service v4 ──────────────────────────────────────────────
// Detecta TODAS as mensagens novas por conversa, sem perda em burst

const POLL_INTERVAL = 3000

// convId → maior messageId processado (número para comparação correta)
const lastProcessedId = new Map()
const processedSet    = new Set()  // dedup global, últimos 500
const knownConvIds    = new Set()  // conversas já vistas (para detectar novas)
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

  // Atualiza Supabase (só para inbound — outbound do bot não incrementa unread)
  if (deps.db.DB_READY?.()) {
    deps.db.updateLastMessage(convId, content, now).catch(() => {})
    if (isInbound) deps.db.incrementUnread(convId).catch(() => {})
  }

  // Emite new_message para TODAS as mensagens (inbound e outbound)
  deps.io.emit('new_message', {
    conversationId: convId,
    message: { ...mappedMsg, senderName },
    lastMessageAt: now,
    content,
    isInbound,
    senderName,
  })

  // unread_update apenas para inbound — independente do unread_count do Chatwoot
  // (bot pode ter zerado, mas o CRM mantém estado próprio)
  if (isInbound) {
    const count = deps.store.incrementUnread(convId)
    console.log(`[Poll] INBOUND notificado conv=${convId} unread=${count}`)
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

    // ── Detecta conversas NOVAS (nunca vistas antes) ─────────────────────────
    for (const conv of convs) {
      const convId = String(conv.id)
      if (!knownConvIds.has(convId)) {
        knownConvIds.add(convId)
        // Apenas emite se já terminou o warmup (evita flood na inicialização)
        if (warmDone) {
          const mapped = deps.mapConversation(conv, 'leads')
          console.log(`[Poll] Nova conversa detectada: conv=${convId} name="${mapped.name}"`)

          // Upsert no Supabase
          if (deps.db.DB_READY?.()) {
            deps.db.upsertLead({ ...mapped, unreadCount: 1 }).catch(() => {})
          }

          // Emite para o frontend
          deps.io.emit('new_conversation', { ...mapped, unreadCount: 1 })
        }
      }
    }

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

      if (!newMsgs.length) {
        // Sem mensagens novas — atualiza cursor para evitar re-fetch
        const lastMsg = conv.last_non_activity_message
        if (lastMsg?.id) lastProcessedId.set(convId, Number(lastMsg.id))
        continue
      }

      // Processa TODAS as mensagens novas em ordem cronológica
      // (inclui mensagem do cliente E resposta do bot)
      for (const msg of newMsgs) {
        processMessage(convId, msg, conv)
      }

      // Cursor avança para o maior ID — garante que próximo ciclo não repete
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
      knownConvIds.add(convId)  // marca como conhecida no warmup
    }
    console.log(`[Poll] ✅ Cache aquecido: ${lastProcessedId.size} conversas, ${knownConvIds.size} IDs conhecidos`)
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
  // mapConversation pode não estar no injected — fallback para identidade
  if (!deps.mapConversation) {
    deps.mapConversation = (conv, col) => ({
      id: String(conv.id),
      name: conv.meta?.sender?.name || `Contato #${conv.id}`,
      phone: conv.meta?.sender?.phone_number || '',
      column: col || 'leads',
      lastMessage: conv.last_non_activity_message?.content || '',
      unreadCount: conv.unread_count || 1,
      assignedTo: conv.meta?.assignee?.id ? String(conv.meta.assignee.id) : null,
      assigneeName: conv.meta?.assignee?.name || '',
    })
  }
  console.log(`[Poll] ✅ Iniciado — detecção por messageId, intervalo ${POLL_INTERVAL / 1000}s`)
  warmUp().then(() => { pollTimer = setInterval(poll, POLL_INTERVAL) })
}

function stop() {
  clearInterval(pollTimer)
  pollTimer = null
}

module.exports = { start, stop }
