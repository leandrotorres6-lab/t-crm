// ─── Chatwoot Polling Service v5 ──────────────────────────────────────────────
// Detecção robusta: último messageId por conversa, sem depender de unread_count
// Tolerante a bot rápido, múltiplas mensagens e delay de API

// Intervalo dinâmico:
// - Webhook funcionou nos últimos 2min → poll a cada 30s (só verificação de segurança)
// - Webhook sem atividade → poll a cada 10s (fallback real)
const POLL_INTERVAL_WEBHOOK_OK  = 30000  // 30s quando webhook está ativo
const POLL_INTERVAL_FALLBACK    = 10000  // 10s quando webhook parece morto

let webhookActive    = false
let lastWebhookTime  = 0   // timestamp do último webhook recebido
let webhookTimer     = null
let pollCycleCount   = 0

// Chamado pelo webhook a cada mensagem — reduz drasticamente o polling
function webhookPing() {
  webhookActive   = true
  lastWebhookTime = Date.now()
  clearTimeout(webhookTimer)
  // Pausa polling por 60s após cada webhook (antes era 10s)
  webhookTimer = setTimeout(() => { webhookActive = false }, 60000)
}

// Retorna o intervalo correto baseado na saúde do webhook
function currentInterval() {
  const webhookAge = Date.now() - lastWebhookTime
  // Se webhook recebeu algo nos últimos 2 minutos → modo económico (30s)
  if (webhookAge < 2 * 60 * 1000) return POLL_INTERVAL_WEBHOOK_OK
  // Webhook parado → modo fallback (10s)
  return POLL_INTERVAL_FALLBACK
}

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

  // Socket — emite SEMPRE (inbound e outbound)
  deps.io.emit('new_message', {
    conversationId: convId,
    message: { ...mappedMsg, senderName },
    lastMessageAt: now,
    content,
    isInbound,
    senderName,
    lastMsgType: msg.attachments?.length
      ? (msg.attachments[0].file_type || '').includes('audio') ? 'audio'
        : (msg.attachments[0].file_type || '').includes('image') ? 'image' : 'document'
      : 'text',
    lastMsgIsOutbound: !isInbound,
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
  if (isPolling) return
  pollCycleCount++

  // Quando webhook está ativo, polling só verifica se passou o intervalo completo
  // Isso serve como verificação de segurança, não como fonte primária
  if (webhookActive) {
    if (pollCycleCount % 10 === 0) console.log(`[Poll] #${pollCycleCount} — webhook ativo, verificação de segurança`)
    return
  }

  isPolling = true
  console.log(`[Poll] #${pollCycleCount} — webhook inativo, modo fallback (${Math.round((Date.now()-lastWebhookTime)/1000)}s sem webhook)`)

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
  console.log(`[Poll] ✅ Iniciado — intervalo dinâmico: ${POLL_INTERVAL_WEBHOOK_OK/1000}s (webhook ok) / ${POLL_INTERVAL_FALLBACK/1000}s (fallback)`)
  warmUp().then(() => {
    // Usa setTimeout recursivo com intervalo dinâmico ao invés de setInterval fixo
    const schedulePoll = () => {
      const interval = currentInterval()
      pollTimer = setTimeout(async () => {
        await poll()
        schedulePoll()  // reagenda com intervalo atualizado
      }, interval)
    }
    schedulePoll()
  })
}

function stop() {
  clearInterval(pollTimer); pollTimer = null
}

module.exports = { start, stop, webhookPing }
