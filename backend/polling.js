// ─── Chatwoot Polling Service v5 ──────────────────────────────────────────────
// Detecção robusta: último messageId por conversa, sem depender de unread_count
// Tolerante a bot rápido, múltiplas mensagens e delay de API

const POLL_INTERVAL = 3000   // 3s — fallback quando webhook não dispara
let webhookActive = false    // true = webhook recebeu msg recentemente → polling reduz frequência
let webhookTimer  = null

// Chamado pelo webhook quando recebe mensagem — pausa polling por 10s
function webhookPing() {
  webhookActive = true
  clearTimeout(webhookTimer)
  webhookTimer = setTimeout(() => { webhookActive = false }, 10000)
}

const lastProcessedId = new Map()  // convId → último msgId processado
const processedSet    = new Set()  // dedup global (últimos 1000)
const knownConvIds    = new Set()  // conversas vistas no warmup ou depois
let pollTimer  = null
let isPolling  = false
let warmDone   = false
let deps       = null
let pollCycleCount = 0

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

    // Push via polling (fallback quando webhook não dispara)
    if (deps.notifyInbound) {
      deps.notifyInbound(msg.id, convId, senderName, content)
    }
  }
}

// ─── Ciclo principal ──────────────────────────────────────────────────────────
async function poll() {
  if (isPolling || !warmDone) return
  // Webhook ativo recentemente → pula este ciclo
  if (webhookActive) { return }
  if (isPolling) return
  isPolling = true
  pollCycleCount++
  // Log a cada 20 ciclos (~60s) para confirmar que polling está vivo
  if (pollCycleCount % 20 === 1) console.log(`[Poll] Ciclo #${pollCycleCount} — ativo, verificando...`)

  try {
    // Busca 2 páginas (~50 conversas) — cobre mais leads ativos
    let convs = []
    for (let p = 1; p <= 2; p++) {
      const page = await deps.cw.getConversations({
        page: p, status: 'open',
        inboxId: deps.targetInboxId || undefined,
      })
      if (!page?.length) break
      convs = convs.concat(page)
    }
    if (!convs.length) { isPolling = false; return }

    // Também busca 1 página SEM filtro de status — pega conversas resolvidas com mensagem nova
    try {
      const allStatus = await deps.cw.getConversations({
        page: 1,
        inboxId: deps.targetInboxId || undefined,
      })
      if (allStatus?.length) {
        for (const conv of allStatus) {
          if (conv.status !== 'resolved') continue  // já coberto acima
          const exists = convs.some(c => c.id === conv.id)
          if (!exists) convs.push(conv)  // adiciona resolvidas com atividade recente
        }
      }
    } catch {}

    // Verifica se alguma conversa tem mensagem nova
    let newCount = 0
    for (const conv of convs) {
      const cId = String(conv.id)
      const lm = conv.last_non_activity_message
      const lId = lm?.id ? Number(lm.id) : 0
      const cached = lastProcessedId.get(cId) || 0
      if (lId > cached) newCount++
    }
    if (newCount > 0) console.log(`[Poll] 🔍 Ciclo: ${convs.length} conversas, ${newCount} com mensagem nova`)

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
        const mapped = deps.mapConversation(conv, currentCol || 'leads')
        if (!currentCol) {
          // Dedup compartilhado com webhook — evita duplo card quando ambos detectam a mesma conversa
          const dedupMap = deps.recentNewConversations
          if (dedupMap?.has(convId)) {
            console.log(`[Poll] new_conversation DEDUP conv=${convId} — webhook já emitiu`)
          } else {
            dedupMap?.set(convId, Date.now())
            console.log(`[Poll] 🆕 Nova conv=${convId} name="${mapped.name}" → leads`)
            if (deps.db.DB_READY?.()) deps.db.upsertLead({ ...mapped, unreadCount: 1 }).catch(() => {})
            deps.io.emit('new_conversation', { ...mapped, unreadCount: 1 })
          }
        }
        continue
      }

      // ── Verifica se há mensagem nova ──────────────────────────────────────
      const cachedId = lastProcessedId.get(convId) || 0
      if (!lastId || lastId <= cachedId) continue  // sem mudança

      // Mudança detectada — busca mensagens novas via API
      const newMsgs = await fetchNewMessages(convId, cachedId)

      if (!newMsgs.length) {
        lastProcessedId.set(convId, lastId)
        continue
      }

      // Se conversa está resolvida e recebeu mensagem nova → reabre automaticamente
      if (conv.status === 'resolved') {
        console.log(`[Poll] 🔄 Conversa resolvida ${convId} recebeu mensagem — reabrindo!`)
        deps.store.setColumn(convId, 'leads')
        if (deps.cw.reopenConversation) deps.cw.reopenConversation(convId).catch(() => {})
        if (deps.db.DB_READY?.()) deps.db.updateMeta(convId, { status: 'open', column: 'leads' }).catch(() => {})
        // Emite new_conversation para aparecer no kanban
        const mapped = deps.mapConversation(conv, 'leads')
        deps.io.emit('new_conversation', { ...mapped, unreadCount: newMsgs.length })
        if (deps.db.DB_READY?.()) deps.db.upsertLead({ ...mapped, unreadCount: newMsgs.length }).catch(() => {})
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
    // Warmup com 3 páginas — cobre ~75 conversas recentes (não apenas 25)
    let convs = []
    for (let p = 1; p <= 3; p++) {
      const page = await deps.cw.getConversations({
        page: p, status: 'open',
        inboxId: deps.targetInboxId || undefined,
      })
      if (!page?.length) break
      convs = convs.concat(page)
    }
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

module.exports = { start, stop, webhookPing }
