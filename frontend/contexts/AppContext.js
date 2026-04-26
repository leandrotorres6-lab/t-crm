'use client'
import { showNotification, playSound, requestNotificationPermission } from '../lib/notifications'
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { setAuthToken, clearAuthToken } from '../lib/api'
import { useSocket } from '../lib/socket'

const AppContext = createContext({})

export function AppProvider({ children }) {
  const [currentAgent, setCurrentAgent] = useState(null)
  const [selectedLead, setSelectedLeadRaw] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Mobile: sidebar fechada por padrão
    if (typeof window !== 'undefined') return window.innerWidth >= 768
    return true
  })
  const [scheduleModal, setScheduleModal] = useState(null)
  const [paymentModal, setPaymentModal] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  // Deduplicação: guarda IDs de mensagens já processadas (últimos 200)
  const processedMessages = React.useRef(new Set())
  const processedConversations = React.useRef(new Set())  // dedup de new_conversation
  // Ref da conversa aberta — não precisa de state (evita re-render)
  const activeConvId = React.useRef(null)
  // Mapa de updatedAt por conversa — árbitro de conflitos de unread
  // leadId → ISO timestamp do último update de unread aceito
  const unreadUpdatedAt = React.useRef({})
  const [pendingMoves, setPendingMoves] = useState({})

  // Persiste agente logado
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tcrm_agent')
      if (saved) setCurrentAgent(JSON.parse(saved))
    } catch {}
  }, [])

  const login = useCallback((agent, token) => {
    setCurrentAgent(agent)
    try {
      localStorage.setItem('tcrm_agent', JSON.stringify(agent))
      if (token) setAuthToken(token)
    } catch {}
  }, [])

  const logout = useCallback(() => {
    setCurrentAgent(null)
    clearAuthToken()
    try { localStorage.removeItem('tcrm_agent') } catch {}
  }, [])

  // Movimento otimista
  const applyPendingMove = useCallback((lead, toCol) => {
    setPendingMoves(prev => ({ ...prev, [lead.id]: { fromCol: lead.column, toCol, lead: { ...lead, column: toCol } } }))
    // Invalida cache das duas colunas para forçar reload limpo depois
    try {
      const { kanbanCache } = require('../lib/kanbanCache')
      kanbanCache.invalidate(lead.column)
      kanbanCache.invalidate(toCol)
    } catch {}
  }, [])

  const clearPendingMove = useCallback((leadId) => {
    setPendingMoves(prev => { const n = { ...prev }; delete n[leadId]; return n })
  }, [])

  // ── Socket handlers ─────────────────────────────────────────────────────────

  useSocket('unread_update', ({ conversationId, count, updatedAt }) => {
    const id = String(conversationId)
    console.log(`[Socket] unread_update conv=${id} count=${count}`)
    const incoming = updatedAt || new Date().toISOString()
    const current = unreadUpdatedAt.current[id] || '2000-01-01'

    if (count === 0 || activeConvId.current === id) {
      // Zerar: timestamp guard + conversa aberta sempre = 0
      if (count !== 0 && incoming < current) return
      unreadUpdatedAt.current[id] = incoming
      setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
      if (count === 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tcrm:read', { detail: { conversationId: id } }))
      }
    } else {
      unreadUpdatedAt.current[id] = incoming
      setUnreadCounts(prev => ({ ...prev, [id]: Math.max(prev[id] || 0, count) }))
    }
  })

  // Snapshot de estado ao reconectar — sincroniza unread sem janela cega
  useSocket('sync_state', ({ unreadCounts: snapshot }) => {
    if (!snapshot || !Object.keys(snapshot).length) return
    setUnreadCounts(prev => {
      const merged = { ...prev }
      Object.entries(snapshot).forEach(([id, count]) => {
        // Usa o maior valor: se local já incrementou mais que o servidor, mantém
        merged[id] = Math.max(prev[id] || 0, count)
      })
      return merged
    })
    console.log(`[Socket] sync_state: ${Object.keys(snapshot).length} conversas com unread`)
  })

  // Sincroniza badge com total de não lidas — direto + via SW
  useEffect(() => {
    if (typeof window === 'undefined') return
    const total = Object.values(unreadCounts || {}).reduce((s, v) => s + (v || 0), 0)

    // API direta — Chrome desktop e Android PWA instalado
    try {
      if (total > 0) navigator.setAppBadge?.(total)
      else           navigator.clearAppBadge?.()
    } catch {}

    // Via SW — iOS PWA instalado (iOS 16.4+) e como fallback
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/').then(reg => {
        if (reg?.active) {
          reg.active.postMessage({ type: total > 0 ? 'SET_BADGE' : 'CLEAR_BADGE', count: total })
        }
      }).catch(() => {})
    }
  }, [unreadCounts])

  // Agendamento criado/atualizado — atualiza aba de agendamentos em tempo real
  useSocket('schedule_created', ({ id, scheduledAt, observacao, lead }) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:schedule-created', {
        detail: { id: String(id), scheduledAt, observacao, lead }
      }))
    }
  })

  // Alarme do cron do backend — app estava fechado/background, agora abriu
  useSocket('schedule_alarm', ({ lead, title, body }) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:schedule-alarm', {
        detail: { lead, title, body }
      }))
    }
  })

  // Conversa finalizada/resolvida — remove do kanban e fecha o chat se aberta
  useSocket('conversation_resolved', ({ id }) => {
    const convId = String(id)
    setUnreadCounts(prev => ({ ...prev, [convId]: 0 }))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:conversation-resolved', { detail: { id: convId } }))
    }
    // Se o lead finalizado for o selecionado, fecha o chat
    setSelectedLeadRaw(prev => {
      if (prev && String(prev.id) === convId) {
        activeConvId.current = null
        return null
      }
      return prev
    })
  })

  useSocket('new_conversation', (lead) => {
    const id = String(lead.id)
    // Dedup frontend — múltiplos eventos para a mesma conversation_id (ex: cliente envia 3 fotos)
    if (processedConversations.current.has(id)) {
      console.log(`[Socket] new_conversation DEDUP id=${id} — ignorado no frontend`)
      return
    }
    processedConversations.current.add(id)
    // Limpa após 30s para conversas que podem reabrir depois
    setTimeout(() => processedConversations.current.delete(id), 30000)

    setUnreadCounts(prev => ({ ...prev, [id]: lead.unreadCount || 1 }))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:toast', {
        detail: { text: `🆕 Novo lead: ${lead.name || 'Contato'}`, conversationId: id }
      }))
      window.dispatchEvent(new CustomEvent('tcrm:reload-column', { detail: { column: 'leads' } }))
      playSound('lead')
      try { navigator.vibrate?.([100, 50, 100]) } catch {}
      showNotification('🆕 Novo lead', lead.name || 'Novo contato', { tag: `lead-${lead.id}` })
    }
  })

  // Nova mensagem recebida → sobe card, incrementa badge, atualiza horário
  useSocket('new_message', (payload) => {
    const { conversationId, message, lastMessageAt, content, isInbound, senderName: sn } = payload
    console.log('[Socket] new_message RECEBIDO:', { conversationId, isInbound, content: (content||'').slice(0,30) })
    
    // Deduplicação por message_id — evita duplo processamento em reconexão
    const msgId = message?.id || `${conversationId}-${lastMessageAt}`
    if (processedMessages.current.has(msgId)) {
      console.log(`[Socket] DUPLICADO ignorado msgId=${msgId}`)
      return
    }
    processedMessages.current.add(msgId)
    // Mantém só os últimos 200 para evitar memory leak
    if (processedMessages.current.size > 200) {
      const first = processedMessages.current.values().next().value
      processedMessages.current.delete(first)
    }
    const id = String(conversationId)
    const ts = lastMessageAt || new Date().toISOString()
    const text = content || message?.content || ''

    // Incrementa não lidas apenas para inbound
    if (isInbound !== false) {
      // Se conversa está aberta agora, mantém 0 (usuário está vendo)
      if (activeConvId.current === id) {
        setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
      } else {
        setUnreadCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
      }

      const senderName = sn || message?.senderName || 'Cliente'

      // Som + vibração + popup nativo + toast
      playSound('message')
      try { navigator.vibrate?.([80]) } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tcrm:toast', {
          detail: { text: `💬 ${senderName}: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`, conversationId: id }
        }))
      }

      // Notificação nativa só quando o app está em foreground (background = push handle)
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        showNotification(`💬 ${senderName}`, text.slice(0, 100), {
          tag: `msg-${id}`,
          renotify: true,
        })
      }
    }

    // Evento global para colunas e listas
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:new-message', {
        detail: { conversationId: id, content: text, lastMessageAt: ts, isInbound }
      }))
    }
  })

  // Set global de dedup para notificações do replay — evita duplicar com new_message
  const notifiedReplay = React.useRef(new Set())

  // Replay: lead atualizado durante desconexão — atualiza estado + notifica se recente
  useEffect(() => {
    const handler = (e) => {
      const lead = e.detail
      if (!lead?.id) return
      const id = String(lead.id)

      // 1. Atualiza unread
      if (lead.unreadCount !== undefined) {
        setUnreadCounts(prev => {
          if (prev[id] === lead.unreadCount) return prev
          return { ...prev, [id]: lead.unreadCount || 0 }
        })
      }

      // 2. Move card no Kanban se coluna mudou
      if (lead.column) {
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
          detail: { leadId: id, fromCol: null, toCol: lead.column, leadData: lead }
        }))
      }

      // 3. Notifica apenas se: evento recente (<15s) + tem unread + não foi notificado ainda
      const eventAge = lead.updatedAt ? Date.now() - new Date(lead.updatedAt).getTime() : 99999
      const deduKey = `${id}_${lead.updatedAt || lead.lastMessageAt || ''}`
      const hasUnread = (lead.unreadCount || 0) > 0

      if (hasUnread && eventAge < 15000 && !notifiedReplay.current.has(deduKey)) {
        notifiedReplay.current.add(deduKey)
        setTimeout(() => notifiedReplay.current.delete(deduKey), 60000)

        const name = lead.name || 'Cliente'
        const text = lead.lastMessage || 'Nova mensagem'
        console.log(`[Replay Notify] ${name}: ${text.slice(0,40)} (${Math.round(eventAge/1000)}s atrás)`)

        playSound('message')
        try { navigator.vibrate?.([80]) } catch {}
        showNotification(`💬 ${name}`, text.slice(0, 100), {
          tag: `msg-${id}`,
          renotify: true,
        })
      }
    }
    window.addEventListener('tcrm:lead-updated', handler)
    return () => window.removeEventListener('tcrm:lead-updated', handler)
  }, [])

  // Registra SW e verifica atualizações periodicamente
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    let iv = null
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      iv = setInterval(() => reg.update().catch(() => {}), 60000)
    }).catch(() => {})
    return () => { if (iv) clearInterval(iv) }
  }, [])

  // Escuta evento de sessão expirada (token 401)
  useEffect(() => {
    const handler = () => {
      setCurrentAgent(null)
    }
    window.addEventListener('tcrm:session-expired', handler)
    return () => window.removeEventListener('tcrm:session-expired', handler)
  }, [])

  // Escuta mensagens do service worker (deep link de notificação)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
    const handler = (event) => {
      if (event.data?.type === 'open-conversation') {
        const { conversationId } = event.data
        if (conversationId) {
          console.log('[SW] Abrindo conversa via push:', conversationId)
          // Redireciona para /conversas e seleciona o lead
          window.location.href = '/conversas'
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  useSocket('lead_moved', ({ id, column, fromColumn, lead }) => {
    const leadId = String(id)
    console.log('📥 lead_moved recebido:', { id: leadId, column, fromColumn, hasLead: !!lead })

    // Recupera fromCol do pendingMoves se o socket não trouxer
    const pendingFrom = pendingMoves[leadId]?.fromCol
    const resolvedFrom = fromColumn || pendingFrom

    clearPendingMove(leadId)

    // Atualiza selectedLead se for o mesmo
    setSelectedLeadRaw(prev => {
      if (prev && String(prev.id) === leadId) return { ...prev, column }
      return prev
    })

    // Despacha tcrm:lead-moved com o lead completo para atualização atômica nas colunas
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
        detail: {
          leadId,
          fromCol: resolvedFrom,
          toCol: column,
          leadData: lead || null,  // lead completo para inserção sem fetch
        }
      }))
    }
  })

  // conversation_updated: atualiza labels e coluna do lead selecionado em tempo real
  useSocket('conversation_updated', ({ id, labels, column }) => {
    setSelectedLeadRaw(prev => {
      if (!prev || String(prev.id) !== String(id)) return prev
      const updated = { ...prev }
      // Atualiza labels se veio no payload
      if (Array.isArray(labels)) updated.labels = labels
      // Atualiza coluna se mudou no Chatwoot
      if (column && column !== prev.column) updated.column = column
      return updated
    })
  })

  // labels_updated: atualiza labels do lead selecionado imediatamente
  useSocket('labels_updated', ({ id, labels }) => {
    setSelectedLeadRaw(prev => {
      if (!prev || String(prev.id) !== String(id)) return prev
      const KANBAN = new Set(['lead','leads','negociacao','negociação','aguardando_cotacao',
        'agendado','lancar_venda','aguardando_pagamento','pago','fechado','sem_retorno','perdido'])
      const freeLabels = labels.filter(l => !l.startsWith('crm_') && !KANBAN.has(l.toLowerCase()))
      return { ...prev, labels: freeLabels }
    })
  })

  const setSelectedLead = useCallback((lead) => {
    setSelectedLeadRaw(lead)
    activeConvId.current = lead ? String(lead.id) : null
    if (!lead) return
    const id = String(lead.id)
    const ts = new Date().toISOString()
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
    if (unreadUpdatedAt?.current) unreadUpdatedAt.current[id] = ts
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:read', { detail: { conversationId: id } }))
    }
    import('../lib/api').then(({ api }) => api.markAsRead(id)).catch(() => {})
  }, [])

  const value = useMemo(() => ({
    currentAgent, login, logout,
    selectedLead, setSelectedLead,
    sidebarOpen, setSidebarOpen,
    scheduleModal, setScheduleModal,
    paymentModal, setPaymentModal,
    unreadCounts, setUnreadCounts, unreadUpdatedAt, activeConvId,
    pendingMoves, applyPendingMove, clearPendingMove,
  // Only primitive/state values in deps — functions are stable via useCallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // unreadCounts and pendingMoves are new objects on every setState call,
  // so they're safe to use directly as deps (reference equality works)
  }), [currentAgent, selectedLead, sidebarOpen, scheduleModal, paymentModal,
       unreadCounts, pendingMoves])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
