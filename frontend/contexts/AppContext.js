'use client'
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSocket } from '../lib/socket'

const AppContext = createContext({})

export function AppProvider({ children }) {
  const [currentAgent, setCurrentAgent] = useState(null)
  const [selectedLead, setSelectedLeadRaw] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [scheduleModal, setScheduleModal] = useState(null)
  const [paymentModal, setPaymentModal] = useState(null)
  const [unreadCounts, setUnreadCounts] = useState({})
  const [pendingMoves, setPendingMoves] = useState({})

  // Persiste agente logado
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tcrm_agent')
      if (saved) setCurrentAgent(JSON.parse(saved))
    } catch {}
  }, [])

  const login = useCallback((agent) => {
    setCurrentAgent(agent)
    try { localStorage.setItem('tcrm_agent', JSON.stringify(agent)) } catch {}
  }, [])

  const logout = useCallback(() => {
    setCurrentAgent(null)
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

  useSocket('unread_update', ({ conversationId, count }) => {
    setUnreadCounts(prev => ({ ...prev, [String(conversationId)]: count }))
  })

  useSocket('new_conversation', (lead) => {
    setUnreadCounts(prev => ({ ...prev, [String(lead.id)]: 1 }))
  })

  // Nova mensagem recebida → sobe card, incrementa badge, atualiza horário
  useSocket('new_message', ({ conversationId, message, lastMessageAt, content, isInbound }) => {
    const id = String(conversationId)
    const ts = lastMessageAt || new Date().toISOString()
    const text = content || message?.content || ''

    console.log(`[Socket] new_message conv=${id} inbound=${isInbound} content="${text.slice(0,40)}"`)

    // Incrementa não lidas apenas para inbound
    if (isInbound !== false) {
      setUnreadCounts(prev => ({
        ...prev,
        [id]: (prev[id] || 0) + 1
      }))
    }

    // Dispara evento global para todas as colunas e listas
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcrm:new-message', {
        detail: { conversationId: id, content: text, lastMessageAt: ts, isInbound }
      }))
    }
  })

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

  useSocket('lead_moved', ({ id, column, fromColumn }) => {
    clearPendingMove(String(id))
    // Atualiza selectedLead se for o mesmo
    setSelectedLeadRaw(prev => {
      if (prev && String(prev.id) === String(id)) return { ...prev, column }
      return prev
    })
    // Notifica as colunas para mover o card instantaneamente
    // (acontece quando alguém muda a label no Chatwoot)
    if (typeof window !== 'undefined' && fromColumn && fromColumn !== column) {
      window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
        detail: { leadId: String(id), fromCol: fromColumn, toCol: column }
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
    if (!lead) return
    const id = String(lead.id)
    setUnreadCounts(prev => ({ ...prev, [id]: 0 }))
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {})
  }, [])

  const value = useMemo(() => ({
    currentAgent, login, logout,
    selectedLead, setSelectedLead,
    sidebarOpen, setSidebarOpen,
    scheduleModal, setScheduleModal,
    paymentModal, setPaymentModal,
    unreadCounts,
    pendingMoves, applyPendingMove, clearPendingMove,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentAgent, selectedLead, sidebarOpen, scheduleModal, paymentModal, unreadCounts, pendingMoves])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
