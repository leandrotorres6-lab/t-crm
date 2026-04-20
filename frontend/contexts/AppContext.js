'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
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

  useSocket('lead_moved', ({ id, column, fromColumn }) => {
    clearPendingMove(String(id))
    setSelectedLeadRaw(prev => {
      if (prev && String(prev.id) === String(id)) return { ...prev, column }
      return prev
    })
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

  return (
    <AppContext.Provider value={{
      currentAgent, login, logout,
      selectedLead, setSelectedLead,
      sidebarOpen, setSidebarOpen,
      scheduleModal, setScheduleModal,
      paymentModal, setPaymentModal,
      unreadCounts,
      pendingMoves, applyPendingMove, clearPendingMove,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
