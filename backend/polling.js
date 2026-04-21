// ─── Chatwoot Polling Service ─────────────────────────────────────────────────
// Detecta novas mensagens via polling da API do Chatwoot (sem webhook)
// Emite eventos via Socket.IO quando detecta atividade nova

const POLL_INTERVAL = 3000  // 3 segundos
const MAX_PAGES = 2         // só primeiras 50 conversas (mais recentes)

// Cache de last_activity_at por conversa
const activityCache = new Map()
// Cache de último message_id processado por conversa (evita duplicação)
const lastMessageIds = new Map()

let pollTimer = null
let isPolling = false

function start({ cw, io, store, db, targetInboxId, mapMessage }) {
  if (pollTimer) return
  console.log('[Poll] ✅ Polling iniciado (intervalo: 3s)')

  async function poll() {
    if (isPolling) return
    isPolling = true

    try {
      // Busca as conversas mais recentes (ordenadas por last_activity_at)
      const convs = await cw.getConversations({
        page: 1, status: 'open',
        inboxId: targetInboxId || undefined
      })
      if (!convs || !convs.length) { isPolling = false; return }

      for (const conv of convs) {
        const convId = String(conv.id)
        const lastActivity = conv.last_activity_at || 0
        const cachedActivity = activityCache.get(convId) || 0

        // Sem atividade nova → pula
        if (lastActivity <= cachedActivity) continue

        // Atividade nova detectada
        activityCache.set(convId, lastActivity)

        // Pega a última mensagem da conversa
        const lastMsg = conv.last_non_activity_message
        if (!lastMsg) continue

        // Deduplica: não processa a mesma mensagem 2x
        const msgId = String(lastMsg.id)
        if (lastMessageIds.get(convId) === msgId) continue
        lastMessageIds.set(convId, msgId)

        // Mapeia a mensagem
        const msg = mapMessage(lastMsg)
        const content = lastMsg.content || (lastMsg.attachments?.length ? '[Arquivo]' : '')
        const mt = lastMsg.message_type
        const isInbound = mt === 0 || mt === '0' || mt === 'incoming'
        const senderName = lastMsg.sender?.name || conv.meta?.sender?.name || ''
        const now = new Date().toISOString()

        console.log(`[Poll] Nova msg conv=${convId} type=${isInbound ? 'IN' : 'OUT'} sender="${senderName}" content="${content.slice(0, 30)}"`)

        // Atualiza cache em memória
        store.updateLastMessage(convId, content)
        if (store.updateLastMessageAt) store.updateLastMessageAt(convId, content, now)

        // Atualiza Supabase
        if (db.DB_READY && db.DB_READY()) {
          db.updateLastMessage(convId, content, now).catch(() => {})
          if (isInbound) db.incrementUnread(convId).catch(() => {})
        }

        // Emite new_message via Socket.IO
        io.emit('new_message', {
          conversationId: convId,
          message: { ...msg, senderName },
          lastMessageAt: now,
          content,
          isInbound,
          senderName,
        })

        // Emite unread_update para inbound
        if (isInbound) {
          const count = store.incrementUnread(convId)
          io.emit('unread_update', { conversationId: convId, count, updatedAt: now })
        }
      }
    } catch (e) {
      // Falha silenciosa — próximo ciclo tenta de novo
      if (!e.message?.includes('abort')) {
        console.warn('[Poll] Erro:', e.message)
      }
    }

    isPolling = false
  }

  // Primeira execução — preenche cache sem emitir
  async function warmUp() {
    try {
      const convs = await cw.getConversations({
        page: 1, status: 'open',
        inboxId: targetInboxId || undefined
      })
      for (const conv of convs) {
        const convId = String(conv.id)
        activityCache.set(convId, conv.last_activity_at || 0)
        if (conv.last_non_activity_message) {
          lastMessageIds.set(convId, String(conv.last_non_activity_message.id))
        }
      }
      console.log(`[Poll] Cache aquecido: ${activityCache.size} conversas`)
    } catch (e) {
      console.warn('[Poll] Warmup falhou:', e.message)
    }
  }

  warmUp().then(() => {
    pollTimer = setInterval(poll, POLL_INTERVAL)
  })
}

function stop() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  console.log('[Poll] ⏹ Polling parado')
}

module.exports = { start, stop }
