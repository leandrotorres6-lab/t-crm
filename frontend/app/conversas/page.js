'use client'
import { useMobileSearch } from '../../lib/useMobileSearch'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { persistentCache } from '../../lib/persistentCache'
const INBOX_CACHE_KEY = 'inbox'
import MainLayout from '../../components/layout/MainLayout'
import ChatPanel from '../../components/crm/ChatPanel'
import ScheduleModal from '../../components/crm/ScheduleModal'
import PaymentModal from '../../components/crm/PaymentModal'
import NotificationAlarm from '../../components/crm/NotificationAlarm'
import { useApp } from '../../contexts/AppContext'
import { useSocket } from '../../lib/socket'
import { api } from '../../lib/api'
import { Search, RefreshCw, Loader2, MessageCircle } from 'lucide-react'

const COL_COLORS = {
  leads: '#3b82f6', negociacao: '#8b5cf6', aguardando_cotacao: '#f59e0b',
  agendado: '#06b6d4', lancar_venda: '#10b981', aguardando_pagamento: '#f97316',
  pago: '#22c55e', sem_retorno: '#6b7280',
}
const COL_LABELS = {
  leads: 'Lead', negociacao: 'Negociação', aguardando_cotacao: 'Ag. Cotação',
  agendado: 'Agendado', lancar_venda: 'Lançar Venda', aguardando_pagamento: 'Ag. Pgto',
  pago: 'Pago', sem_retorno: 'Sem Retorno',
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now - 86400000).toDateString()
  const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today) return `Hoje ${hhmm}`
  if (d.toDateString() === yesterday) return `Ontem ${hhmm}`
  const dd = String(d.getDate()).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  return `${dd}/${mm} ${hhmm}`
}

function ConvItem({ lead, isSelected, onClick, unread }) {
  const color = COL_COLORS[lead.column] || '#6b7280'
  const label = COL_LABELS[lead.column] || lead.column
  const hasUnread = (unread || lead.unreadCount || 0) > 0
  const count = unread || lead.unreadCount || 0

  return (
    <button onClick={onClick}
      className="w-full flex items-start gap-3 px-3 py-3 transition-all text-left relative md:px-4"
      style={{
        backgroundColor: isSelected
          ? 'rgba(59,130,246,0.08)'
          : hasUnread ? 'rgba(59,130,246,0.03)' : 'transparent',
        borderBottom: '1px solid var(--border)',
      }}>
      {/* Avatar */}
      <div className="relative flex-shrink-0 mt-0.5">
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: color + '30', color, border: `2px solid ${color}40` }}>
          {lead.avatar}
        </div>
        {hasUnread && (
          <div className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: '#ef4444', fontSize: '10px', padding: '0 3px' }}>
            {count > 99 ? '99+' : count}
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={`text-sm truncate ${hasUnread ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]'}`}>
            {lead.name}
          </p>
          <span className="text-xs text-[var(--text-muted)] flex-shrink-0" style={{ fontSize: '11px' }}>
            {formatTime(lead.lastMessageAt || lead.createdAt)}
          </span>
        </div>

        <p className={`text-xs truncate mb-1.5 ${hasUnread ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
          {lead.lastMessage || 'Sem mensagens'}
        </p>

        <div className="flex items-center gap-1.5">
          {/* Badge de etapa */}
          <span className="text-xs px-1.5 py-0.5 rounded-md font-medium flex-shrink-0"
            style={{ backgroundColor: color + '15', color, fontSize: '10px' }}>
            {label}
          </span>
          {/* Vendedor */}
          {lead.assigneeName && (
            <span className="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: '10px' }}>
              {lead.assigneeName.split(' ')[0]}
            </span>
          )}
          {/* Telefone */}
          <span className="text-xs text-[var(--text-muted)] truncate" style={{ fontSize: '10px' }}>
            {lead.phone}
          </span>
        </div>
      </div>

      {/* Linha azul esquerda quando selecionado */}
      {isSelected && (
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-blue-500" />
      )}
    </button>
  )
}

function ConversasList() {
  const [tab, setTab] = useState('nao_lidas')
  const [allLeads, setAllLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearchVal] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = sem busca ativa
  const searchRef = useRef('')
  const searchDebounce = useRef(null)
  const { inputProps: searchInputProps } = useMobileSearch(
    useCallback((v) => {
      searchRef.current = v
      setSearchVal(v)
      // Busca global via API (encontra contatos do Chatwoot também)
      clearTimeout(searchDebounce.current)
      if (!v.trim()) {
        setSearchResults(null)
        return
      }
      searchDebounce.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q: v.trim() })
          const data = await api.search(params.toString())
          setSearchResults(data.results || [])
        } catch { setSearchResults([]) }
      }, 380)
    }, [])
  )
  const { selectedLead, setSelectedLead, unreadCounts, currentAgent, unreadUpdatedAt } = useApp()

  const load = useCallback(async (force = false) => {
    // Mostra cache imediatamente (pode ser de sessão anterior)
    const cached = persistentCache.get(INBOX_CACHE_KEY)
    if (cached?.data) {
      setAllLeads(cached.data)
      setLoading(false)
      // Se cache ainda fresco e não é força, não busca de novo
      if (!force && !persistentCache.isStale(INBOX_CACHE_KEY, 60000)) return
    } else {
      setLoading(true)
    }

    // Busca em background (silencioso se já tem cache)
    try {
      const data = await api.getInbox(currentAgent?.id, currentAgent?.role)
      const convs = data.conversations || []
      persistentCache.set(INBOX_CACHE_KEY, convs)
      // Preserva unreadCount=0 do estado local (abertas recentemente)
      setAllLeads(prev => {
        const prevMap = {}
        prev.forEach(l => { prevMap[l.id] = l })
        return convs.map(c => {
          const localTs = unreadUpdatedAt?.current?.[c.id] || '2000-01-01'
          const remoteTs = c.updatedAt || '2000-01-01'
          if (localTs > remoteTs && prevMap[c.id] !== undefined) {
            return { ...c, unreadCount: prevMap[c.id].unreadCount }
          }
          return c
        })
      })
    } catch (e) {
      console.error('inbox load error:', e)
    } finally {
      setLoading(false)
    }
  }, [currentAgent?.id])

  useEffect(() => { load() }, [currentAgent?.id])

  // Nova mensagem — sobe conversa para o topo em tempo real
  useEffect(() => {
    const handler = (e) => {
      const { conversationId, content, lastMessageAt, isInbound } = e.detail || {}
      if (!conversationId) return
      setAllLeads(prev => {
        const idx = prev.findIndex(l => String(l.id) === String(conversationId))
        if (idx === -1) return prev  // lead não está na lista — não precisa mover
        const updated = {
          ...prev[idx],
          lastMessage: content || prev[idx].lastMessage,
          lastMessageAt: lastMessageAt || prev[idx].lastMessageAt,
        }
        const rest = prev.filter((_, i) => i !== idx)
        return [updated, ...rest]  // move para o topo
      })
    }
    window.addEventListener('tcrm:new-message', handler)
    return () => window.removeEventListener('tcrm:new-message', handler)
  }, [])

  // Sobe lead para o topo quando chega mensagem nova
  useSocket('new_message', ({ conversationId, message, content, lastMessageAt, isInbound }) => {
    const id = String(conversationId)
    const text = content || message?.content || ''
    const ts = lastMessageAt || new Date().toISOString()

    setAllLeads(prev => {
      const idx = prev.findIndex(l => l.id === id)
      if (idx === -1) return prev
      const card = {
        ...prev[idx],
        lastMessage: text || prev[idx].lastMessage,
        lastMessageAt: ts,
        unreadCount: isInbound !== false ? (prev[idx].unreadCount || 0) + 1 : prev[idx].unreadCount || 0,
        _tick: Date.now(),
      }
      const updated = [card, ...prev.filter((_, i) => i !== idx)]
      persistentCache.set(INBOX_CACHE_KEY, updated)
      return updated
    })
  })

  // Zera badge quando usuário abre a conversa
  useSocket('unread_update', ({ conversationId, count, updatedAt }) => {
    const id = String(conversationId)
    const incoming = updatedAt || new Date().toISOString()
    const current = unreadUpdatedAt?.current?.[id] || '2000-01-01'
    if (incoming < current) return
    setAllLeads(prev => prev.map(l =>
      l.id === id ? { ...l, unreadCount: count, updatedAt: incoming } : l
    ))
  })

  // Nova conversa → adiciona no topo
  useSocket('new_conversation', (lead) => {
    setAllLeads(prev => [lead, ...prev])
  })

  const filtered = useMemo(() => {
    // Busca ativa → usa resultados da API global (Supabase + Chatwoot)
    if (searchResults !== null) return searchResults

    // Sem busca → filtra lista local por tab
    if (tab === 'nao_lidas') {
      return allLeads.filter(l => (unreadCounts[l.id] || l.unreadCount || 0) > 0)
    }
    return allLeads
  }, [allLeads, searchResults, tab, unreadCounts])

  const unreadTotal = useMemo(
    () => allLeads.filter(l => (unreadCounts[l.id] || l.unreadCount || 0) > 0).length,
    [allLeads, unreadCounts]
  )

  return (
    <div className="flex flex-col h-full w-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0 md:px-4 md:pt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Conversas</h2>
          <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} onClick={() => load(true)} />
          </button>
        </div>

        {/* Busca */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            {...searchInputProps}
            placeholder="Buscar conversa..."
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm"
            style={{
              ...searchInputProps.style,
              backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', outline: 'none', fontSize: '14px'
            }} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-hover)' }}>
          {[
            { id: 'nao_lidas', label: 'Não lidas', count: unreadTotal },
            { id: 'todas', label: 'Todas', count: allLeads.length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={tab === t.id
                ? { backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }
                : { color: 'var(--text-muted)' }}>
              {t.label}
              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                style={tab === t.id
                  ? { backgroundColor: '#2563eb', color: 'white' }
                  : { backgroundColor: 'var(--border)', color: 'var(--text-muted)' }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageCircle size={32} className="text-[var(--text-muted)]" style={{ opacity: 0.3 }} />
            <p className="text-sm text-[var(--text-muted)]">
              {tab === 'nao_lidas' ? 'Nenhuma mensagem não lida' : 'Nenhuma conversa encontrada'}
            </p>
          </div>
        ) : (
          filtered.map(lead => (
            <ConvItem
              key={lead.id}
              lead={lead}
              isSelected={selectedLead?.id === lead.id}
              unread={unreadCounts[lead.id] || lead.unreadCount || 0}
              onClick={() => setSelectedLead(lead)}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default function ConversasPage() {
  return (
    <MainLayout chat={<ChatPanel />} inbox={<ConversasList />}>
      <ScheduleModal onConfirm={() => {}} />
      <PaymentModal onConfirm={() => {}} />
      <NotificationAlarm />
    </MainLayout>
  )
}
