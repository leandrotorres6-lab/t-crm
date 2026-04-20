'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
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

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function ConvItem({ lead, isSelected, onClick, unread }) {
  const color = COL_COLORS[lead.column] || '#6b7280'
  const label = COL_LABELS[lead.column] || lead.column
  const hasUnread = (unread || lead.unreadCount || 0) > 0
  const count = unread || lead.unreadCount || 0

  return (
    <button onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 transition-all text-left relative"
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
            {timeAgo(lead.createdAt)}
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
  const [search, setSearch] = useState('')
  const { selectedLead, setSelectedLead, unreadCounts, currentAgent } = useApp()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Carrega todas as colunas
      const ALL_COLUMNS = ['leads','negociacao','aguardando_cotacao','agendado','lancar_venda','aguardando_pagamento','pago','sem_retorno']
      const results = await Promise.all(
        ALL_COLUMNS.map(col => api.getColumnLeads(col, 1, currentAgent?.id, currentAgent?.role)
          .then(d => d.items || []).catch(() => []))
      )
      const merged = results.flat()
      // Ordena por não lidas primeiro, depois por data
      merged.sort((a, b) => {
        const ua = unreadCounts[a.id] || a.unreadCount || 0
        const ub = unreadCounts[b.id] || b.unreadCount || 0
        if (ua !== ub) return ub - ua
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      setAllLeads(merged)
    } finally {
      setLoading(false)
    }
  }, [currentAgent, unreadCounts])

  useEffect(() => { load() }, [currentAgent?.id])

  // Sobe lead para o topo quando chega mensagem nova
  useSocket('new_message', ({ conversationId, message }) => {
    if (message?.sender !== 'lead') return
    setAllLeads(prev => {
      const idx = prev.findIndex(l => l.id === String(conversationId))
      if (idx === -1) return prev
      const card = { ...prev[idx], lastMessage: message.content || prev[idx].lastMessage }
      return [card, ...prev.filter((_, i) => i !== idx)]
    })
  })

  // Nova conversa → adiciona no topo
  useSocket('new_conversation', (lead) => {
    setAllLeads(prev => [lead, ...prev])
  })

  const filtered = allLeads.filter(lead => {
    const q = search.toLowerCase()
    const matchSearch = !q || lead.name.toLowerCase().includes(q) ||
      lead.phone.includes(q) || (lead.lastMessage || '').toLowerCase().includes(q)
    if (!matchSearch) return false
    if (tab === 'nao_lidas') {
      return (unreadCounts[lead.id] || lead.unreadCount || 0) > 0
    }
    return true
  })

  const unreadTotal = allLeads.filter(l => (unreadCounts[l.id] || l.unreadCount || 0) > 0).length

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[var(--text-primary)]">Conversas</h2>
          <button onClick={load} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Busca */}
        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm"
            style={{
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
