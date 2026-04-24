'use client'
import { useMobileSearch } from '../../lib/useMobileSearch'
import { useCallback, useEffect, useRef, useState } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'
import {
  Search, MessageCircle, Phone, Mail, Loader2, User,
  Clock, ChevronRight, ExternalLink, Inbox, CheckCircle,
  AlertCircle, RefreshCw, MapPin, Calendar
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const COL_COLORS = {
  leads: '#3b82f6', negociacao: '#8b5cf6', aguardando_cotacao: '#f59e0b',
  agendado: '#06b6d4', lancar_venda: '#10b981', aguardando_pagamento: '#f97316',
  pago: '#22c55e', sem_retorno: '#6b7280'
}
const COL_LABELS = {
  leads: 'Lead', negociacao: 'Negociação', aguardando_cotacao: 'Ag. Cotação',
  agendado: 'Agendado', lancar_venda: 'Lançar Venda', aguardando_pagamento: 'Ag. Pagamento',
  pago: 'Pago', sem_retorno: 'Sem Retorno'
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function StatusBadge({ status }) {
  const map = {
    open:     { label: 'Aberta',    color: '#10b981', icon: MessageCircle },
    resolved: { label: 'Resolvida', color: '#6b7280', icon: CheckCircle },
    pending:  { label: 'Pendente',  color: '#f59e0b', icon: AlertCircle },
  }
  const s = map[status] || map.open
  const Icon = s.icon
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: s.color + '18', color: s.color }}>
      <Icon size={10} />
      {s.label}
    </span>
  )
}

// ── Painel de detalhe do contato ──────────────────────────────────────────────
function ContactDetail({ contact, onClose }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const { setSelectedLead } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!contact) return
    setLoading(true)
    setConversations([])
    api.getContactConversations(contact.id)
      .then(data => setConversations(data.conversations || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [contact?.id])

  const openConversation = (conv) => {
    // IMPORTANTE: usa asCrmLead que tem o ID da CONVERSA (não do contato)
    // O ID da conversa é o que a API de mensagens espera
    const lead = conv.asCrmLead
      ? { ...conv.asCrmLead }
      : {
          id: conv.id,          // ID da conversa
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          avatar: contact.avatar,
          column: conv.status === 'resolved' ? 'sem_retorno' : 'leads',
          lastMessage: conv.lastMessage,
          labels: conv.labels || [],
          assigneeName: conv.assigneeName || '',
        }
    setSelectedLead(lead)
    router.push('/crm')
  }

  const filtered = filter === 'all' ? conversations
    : conversations.filter(c => c.status === filter)

  if (!contact) {
    return (
      <div className="h-full page-enter flex flex-col items-center justify-center gap-3"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-hover)' }}>
          <User size={24} className="text-[var(--text-muted)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Selecione um contato</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">para ver o histórico de conversas</p>
        </div>
      </div>
    )
  }

  const openCount = conversations.filter(c => c.status === 'open').length
  const resolvedCount = conversations.filter(c => c.status === 'resolved').length

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Cabeçalho do contato */}
      <div className="px-5 py-5 border-b border-[var(--border)] flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700
            flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {contact.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)] truncate">{contact.name}</h2>

            <div className="mt-2 space-y-1">
              {contact.phone && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Phone size={11} className="flex-shrink-0" />
                  <span className="font-mono">{contact.phone}</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Mail size={11} className="flex-shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
              )}
              {contact.location && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <MapPin size={11} className="flex-shrink-0" />
                  <span>{contact.location}</span>
                </div>
              )}
              {contact.lastActivityAt && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Clock size={11} className="flex-shrink-0" />
                  <span>Último contato: {timeAgo(contact.lastActivityAt)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats rápidas */}
        <div className="flex gap-2 mt-4">
          {[
            { label: 'Total', value: conversations.length, color: '#3b82f6' },
            { label: 'Abertas', value: openCount, color: '#10b981' },
            { label: 'Resolvidas', value: resolvedCount, color: '#6b7280' },
          ].map(s => (
            <div key={s.label} className="flex-1 rounded-xl px-3 py-2 text-center"
              style={{ backgroundColor: s.color + '10' }}>
              <p className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros de conversa */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-[var(--border)] flex-shrink-0">
        <span className="text-xs font-medium text-[var(--text-muted)] mr-1">Conversas:</span>
        {[
          { id: 'all', label: 'Todas' },
          { id: 'open', label: 'Abertas' },
          { id: 'resolved', label: 'Resolvidas' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
            style={filter === f.id
              ? { backgroundColor: '#2563eb', color: 'white' }
              : { color: 'var(--text-muted)' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de conversas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <MessageCircle size={24} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">Nenhuma conversa {filter !== 'all' ? filter === 'open' ? 'aberta' : 'resolvida' : ''}</p>
          </div>
        ) : (
          filtered.map((conv, i) => (
            <div key={conv.id}
              className="rounded-xl p-3 transition-all duration-200 animate-fade-in group"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {/* Header da conversa */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={conv.status} />
                  {conv.inboxName && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                      <span className="flex items-center gap-1">
                        <Inbox size={9} />
                        {conv.inboxName}
                      </span>
                    </span>
                  )}
                  {conv.unreadCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold text-white"
                      style={{ backgroundColor: '#ef4444', fontSize: '10px' }}>
                      {conv.unreadCount} nova{conv.unreadCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {conv.lastActivityAt && (
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0 flex items-center gap-1">
                    <Calendar size={9} />
                    {timeAgo(conv.lastActivityAt)}
                  </span>
                )}
              </div>

              {/* Última mensagem */}
              {conv.lastMessage && (
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-2"
                  style={{ fontStyle: 'italic' }}>
                  "{conv.lastMessage}"
                </p>
              )}

              {/* Rodapé: assignee + labels + botão abrir */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  {conv.assigneeName && (
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center"
                        style={{ fontSize: '7px', color: 'white', fontWeight: 'bold' }}>
                        {conv.assigneeAvatar}
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">{conv.assigneeName.split(' ')[0]}</span>
                    </div>
                  )}
                  {conv.labels?.slice(0, 2).map(l => (
                    <span key={l} className="text-xs px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: 'rgba(139,92,246,0.12)', color: '#a78bfa', fontSize: '10px' }}>
                      {l}
                    </span>
                  ))}
                </div>

                {/* Botão abrir conversa no CRM */}
                <button
                  onClick={() => openConversation(conv)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    transition-all flex-shrink-0 hover:scale-105 active:scale-95"
                  style={{ backgroundColor: '#2563eb', color: 'white' }}>
                  <MessageCircle size={12} />
                  Abrir no CRM
                  <ChevronRight size={11} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQueryInternal] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const bottomRef = useRef(null)
  const loadingRef = useRef(false)
  // latestLoad ref evita que a callback do hook seja recriada a cada render
  const loadRef = useRef(null)
  const { inputProps: searchInputProps } = useMobileSearch((v) => {
    setQueryInternal(v)
    setSelected(null)
    loadRef.current?.(v, 1, true)
  })

  const load = useCallback(async (q, p, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const data = await api.getContacts(q, p)
      setContacts(prev => reset ? data.contacts : [...prev, ...data.contacts])
      setHasMore(data.hasMore)
      setTotal(data.total)
      setPage(p)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    loadRef.current = load
    load('', 1, true)
  }, [load])

  // Lazy load ao rolar
  useEffect(() => {
    const el = bottomRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
        load(query, page + 1)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, page, query])



  return (
    <MainLayout>
      <div className="h-full flex overflow-hidden">

        {/* ── Coluna esquerda: lista de contatos ── */}
        <div className="flex flex-col border-r border-[var(--border)] flex-shrink-0"
          style={{ width: '340px', backgroundColor: 'var(--bg-primary)' }}>

          {/* Header */}
          <div className="px-4 py-4 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-base font-bold text-[var(--text-primary)]">Contatos</h1>
                <p className="text-xs text-[var(--text-muted)]">{total} no Chatwoot</p>
              </div>
              <button onClick={() => load(query, 1, true)}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                title="Atualizar">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                {...searchInputProps}
                value={query}
                placeholder="Nome, telefone ou email..."
                className="input-theme pl-9 text-sm"
                style={{ ...searchInputProps.style }}
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {contacts.map(c => {
              const isSelected = selected?.id === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left border-b border-[var(--border)]"
                  style={{
                    backgroundColor: isSelected ? 'rgba(59,130,246,0.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700
                    flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {c.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                      {c.conversationsCount > 0 && (
                        <span className="text-xs font-bold flex-shrink-0 font-mono px-1.5 py-0.5 rounded-md"
                          style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontSize: '10px' }}>
                          {c.conversationsCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-mono truncate">{c.phone || c.email}</p>
                    {c.lastActivityAt && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5" style={{ fontSize: '10px' }}>
                        {timeAgo(c.lastActivityAt)}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={13} className="text-[var(--text-muted)] flex-shrink-0"
                    style={{ opacity: isSelected ? 1 : 0.3 }} />
                </button>
              )
            })}

            <div ref={bottomRef} className="h-4" />
            {loading && (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-[var(--text-muted)]" />
              </div>
            )}
            {!loading && contacts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <User size={20} className="text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-muted)]">Nenhum contato encontrado</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Coluna direita: detalhe do contato ── */}
        <div className="flex-1 overflow-hidden">
          <ContactDetail contact={selected} />
        </div>

      </div>
    </MainLayout>
  )
}
