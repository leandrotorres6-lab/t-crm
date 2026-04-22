'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import KanbanColumn from './KanbanColumn'
import SearchBar from './SearchBar'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'
import { kanbanCache } from '../../lib/kanbanCache'
import { useSocket } from '../../lib/socket'
import { ChevronLeft, ChevronRight, RefreshCw, Bell } from 'lucide-react'

const ALL_COLUMNS = [
  'leads','negociacao','aguardando_cotacao','agendado',
  'lancar_venda','aguardando_pagamento','pago','sem_retorno'
]
const COL_LABELS = {
  leads:'Leads', negociacao:'Negociação', aguardando_cotacao:'Ag. Cotação',
  agendado:'Agendado', lancar_venda:'Lançar Venda', aguardando_pagamento:'Ag. Pgto',
  pago:'Pago ✓', sem_retorno:'Sem Retorno'
}
const COL_COLORS = {
  leads:'#3b82f6', negociacao:'#8b5cf6', aguardando_cotacao:'#f59e0b',
  agendado:'#06b6d4', lancar_venda:'#10b981', aguardando_pagamento:'#f97316',
  pago:'#22c55e', sem_retorno:'#6b7280'
}

function UnreadBadge({ unreadCounts }) {
  const total = Object.values(unreadCounts || {}).reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold animate-pulse"
      style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
      <div className="w-2 h-2 rounded-full bg-red-500" />
      {total} não lida{total !== 1 ? 's' : ''}
    </div>
  )
}

export default function KanbanBoard() {
  const { unreadCounts, setSelectedLead, setSidebarOpen, currentAgent } = useApp()
  // Supervisor: filtro de agente (null = todos, id = vendedor específico)
  const [filterAgent, setFilterAgent] = useState(null)   // { id, name }
  const [agents, setAgents] = useState([])
  const [columnCounts, setColumnCounts] = useState({})
  // Mapa coluna → tem não lida (boolean) — para mostrar ponto nas bolhas
  const [colHasUnread, setColHasUnread] = useState({})
  const [colUnreadCount, setColUnreadCount] = useState({})
  const [searchResults, setSearchResults] = useState(null)
  const [colRefresh, setColRefresh] = useState({})
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])

  // Carrega lista de agentes para o filtro do supervisor
  useEffect(() => {
    if (currentAgent?.role !== 'supervisor') return
    api.getAgents().then(list => {
      // Só vendedores (não supervisores/admins)
      const vendedores = (list || []).filter(a =>
        a.role !== 'supervisor' && a.role !== 'administrator' && a.name
      )
      setAgents(vendedores)
    }).catch(() => {})
  }, [currentAgent?.role])

  // Escuta toasts de nova mensagem
  useEffect(() => {
    const handler = (e) => {
      const { text, conversationId } = e.detail
      const id = Date.now()
      setToasts(prev => [...prev.slice(-2), { id, text, conversationId }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
    }
    window.addEventListener('tcrm:toast', handler)
    return () => window.removeEventListener('tcrm:toast', handler)
  }, [])
  // Mobile: índice da coluna visível atualmente
  const [mobileCol, setMobileCol] = useState(0)
  const scrollRef = useRef(null)
  const autoScrollRef = useRef(null)
  const touchStartX = useRef(null)

  const refreshCounts = useCallback(() => {
    api.getColumns().then(cols => {
      const map = {}
      cols.forEach(c => { map[c.id] = c.count })
      setColumnCounts(map)
    }).catch(() => {})
  }, [])

  const refreshCol = useCallback((colId) => {
    kanbanCache.invalidate(colId)
    setColRefresh(prev => ({ ...prev, [colId]: (prev[colId] || 0) + 1 }))
  }, [])

  const refreshAll = useCallback(() => {
    kanbanCache.invalidateAll()
    ALL_COLUMNS.forEach(col => setColRefresh(prev => ({ ...prev, [col]: (prev[col] || 0) + 1 })))
    refreshCounts()
  }, [refreshCounts])

  // Carrega todas as colunas simultaneamente — backend tem mutex, não hammers o Chatwoot
  useEffect(() => {
    refreshCounts()
    // Dispara load de todas as colunas de uma vez
    // O backend responde do cache (30s TTL) após a primeira chamada
    setColRefresh(prev => {
      const next = { ...prev }
      ALL_COLUMNS.forEach(col => { next[col] = (prev[col] || 0) + 1 })
      return next
    })
  }, [])

  // Escuta eventos de não lidas por coluna (emitidos pelo KanbanColumn)
  useEffect(() => {
    const handler = ({ detail: { columnId, hasUnread, unreadCount } }) => {
      setColHasUnread(prev => prev[columnId] === hasUnread ? prev : { ...prev, [columnId]: hasUnread })
      setColUnreadCount(prev => prev[columnId] === unreadCount ? prev : { ...prev, [columnId]: unreadCount || 0 })
    }
    window.addEventListener('tcrm:col-unread', handler)
    return () => window.removeEventListener('tcrm:col-unread', handler)
  }, [])

  useSocket('new_conversation', (lead) => {
    setColumnCounts(prev => ({ ...prev, leads: (prev.leads || 0) + 1 }))
    refreshCol('leads')
    const id = Date.now()
    setNotifications(prev => [...prev, { id, text: `Nova conversa: ${lead.name}` }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000)
  })

  useSocket('lead_moved', ({ id, column, fromColumn }) => {
    setColumnCounts(prev => ({
      ...prev,
      ...(fromColumn ? { [fromColumn]: Math.max(0, (prev[fromColumn] || 1) - 1) } : {}),
      [column]: (prev[column] || 0) + 1,
    }))
    if (fromColumn) refreshCol(fromColumn)
    refreshCol(column)
  })

  // Auto-scroll desktop ao arrastar
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) { clearInterval(autoScrollRef.current); autoScrollRef.current = null }
  }, [])

  const handleDragOver = useCallback((e) => {
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const EDGE = 140, SPEED = 20
    if (e.clientX < rect.left + EDGE) {
      if (!autoScrollRef.current) autoScrollRef.current = setInterval(() => el.scrollBy({ left: -SPEED }), 28)
    } else if (e.clientX > rect.right - EDGE) {
      if (!autoScrollRef.current) autoScrollRef.current = setInterval(() => el.scrollBy({ left: SPEED }), 28)
    } else stopAutoScroll()
  }, [stopAutoScroll])

  const scrollBy = (dir) => scrollRef.current?.scrollBy({ left: dir * 310, behavior: 'smooth' })

  const handleDrop = (leadId, fromCol, toCol) => {
    stopAutoScroll()
    setColumnCounts(prev => ({
      ...prev,
      [fromCol]: Math.max(0, (prev[fromCol] || 1) - 1),
      [toCol]: (prev[toCol] || 0) + 1,
    }))
  }

  // Mobile swipe — só ativa em gestos horizontais (não interfere com scroll vertical)
  const touchStartYRef = useRef(null)
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartYRef.current || 0))
    // Só muda coluna se o gesto for mais horizontal do que vertical
    if (Math.abs(dx) > 60 && dy < 40) {
      if (dx < 0 && mobileCol < ALL_COLUMNS.length - 1) setMobileCol(i => i + 1)
      if (dx > 0 && mobileCol > 0) setMobileCol(i => i - 1)
    }
    touchStartX.current = null
    touchStartYRef.current = null
  }

  const totalLeads = Object.values(columnCounts).reduce((a, b) => a + b, 0)
  const currentColId = ALL_COLUMNS[mobileCol]
  const currentColor = COL_COLORS[currentColId]

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar desktop ── */}
      <div className="hidden md:flex flex-col gap-2 px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold text-[var(--text-primary)]">Pipeline CRM</h1>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{searchResults ? `${searchResults.length} resultados` : `${totalLeads} leads ativos`}</p>
            </div>
            <UnreadBadge unreadCounts={unreadCounts} />
          </div>
          <div className="flex items-center gap-2">
            {searchResults && (
              <span className="text-xs px-2 py-1 rounded-lg text-blue-400"
                style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                Buscando...
              </span>
            )}
            <button onClick={refreshAll} className="btn-ghost" title="Atualizar">
              <RefreshCw size={14} />
            </button>
            {/* Abas de vendedor — só para supervisor */}
            {currentAgent?.role === 'supervisor' && agents.length > 0 && (
              <div className="flex items-center gap-1 ml-1 bg-[var(--bg-secondary)] rounded-lg p-0.5">
                <button
                  onClick={() => setFilterAgent(null)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: !filterAgent ? 'var(--bg-card)' : 'transparent',
                    color: !filterAgent ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: !filterAgent ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                  }}>
                  Todos
                </button>
                {agents.map(a => (
                  <button key={a.id}
                    onClick={() => setFilterAgent(filterAgent?.id === a.id ? null : { id: a.id, name: a.name })}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold transition-all whitespace-nowrap"
                    style={{
                      backgroundColor: filterAgent?.id === a.id ? 'var(--bg-card)' : 'transparent',
                      color: filterAgent?.id === a.id ? '#60a5fa' : 'var(--text-muted)',
                      boxShadow: filterAgent?.id === a.id ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                    }}>
                    {a.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => scrollBy(-1)} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => scrollBy(1)} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {/* Barra de busca e filtros */}
        <SearchBar
          onResults={results => setSearchResults(results)}
          onClear={() => setSearchResults(null)}
        />
      </div>

      {/* ── Mobile: header compacto ── */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <button onClick={() => setSidebarOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentColor }} />
          <span className="text-sm font-bold text-[var(--text-primary)] truncate">{COL_LABELS[currentColId]}</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: currentColor + '20', color: currentColor }}>
            {columnCounts[currentColId] || 0}
          </span>
        </div>
        <button onClick={refreshAll} className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] flex-shrink-0">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Toast de nova mensagem */}
      <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '320px' }}>
        {toasts.map(t => (
          <div key={t.id}
            onClick={() => { setToasts(prev => prev.filter(x => x.id !== t.id)) }}
            className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl shadow-2xl cursor-pointer animate-slide-up"
            style={{ backgroundColor: '#0f1a2e', border: '1px solid rgba(59,130,246,0.3)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
            <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 mt-1.5 animate-pulse" />
            <p className="text-xs text-slate-200 leading-relaxed">{t.text}</p>
          </div>
        ))}
      </div>

      {/* Toasts 
      <div className="fixed top-16 right-3 z-50 flex flex-col gap-2 pointer-events-none md:top-4 md:right-[39%]">
        {notifications.map(n => (
          <div key={n.id} className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg text-sm animate-slide-up"
            style={{ backgroundColor: '#0f1a2e', border: '1px solid #1e293b', color: '#60a5fa' }}>
            <Bell size={13} />{n.text}
          </div>
        ))}
      </div>

      {/* ── Resultados de busca ── */}
      {searchResults && (
        <div className="hidden md:block flex-1 overflow-y-auto p-4">
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                <span style={{ fontSize: 24 }}>🔍</span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">Nenhum lead encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {searchResults.map(lead => {
                const color = {'leads':'#3b82f6','negociacao':'#8b5cf6','aguardando_cotacao':'#f59e0b','agendado':'#06b6d4','lancar_venda':'#10b981','aguardando_pagamento':'#f97316','pago':'#22c55e','sem_retorno':'#6b7280'}[lead.column] || '#6b7280'
                const colLabel = {'leads':'Leads','negociacao':'Negociação','aguardando_cotacao':'Ag. Cotação','agendado':'Agendado','lancar_venda':'Lançar Venda','aguardando_pagamento':'Ag. Pgto','pago':'Pago ✓','sem_retorno':'Sem Retorno'}[lead.column] || lead.column
                return (
                  <div key={lead.id} onClick={() => setSelectedLead(lead)} className="p-3 rounded-xl cursor-pointer hover:scale-[1.02] transition-all"
                    style={{ backgroundColor: 'var(--bg-card)', border: `1px solid var(--border)`, borderLeft: `3px solid ${color}` }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color+'20', color }}>
                        {lead.avatar}
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{lead.name}</p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate mb-1.5">{lead.lastMessage}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-md font-medium" style={{ backgroundColor: color+'15', color, fontSize:'10px' }}>{colLabel}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Desktop: todas as colunas em scroll horizontal ── */}
      <div className="hidden md:block flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden"
          onDragOver={handleDragOver} onDragEnd={stopAutoScroll}>
          <div className="flex gap-3 p-4 h-full" style={{ minWidth: 'max-content' }}>
            {ALL_COLUMNS.map(col => (
              <KanbanColumn key={`${col}-${filterAgent?.id || 'all'}`} columnId={col}
                refreshToken={colRefresh[col] || 0} onDrop={handleDrop}
                agentFilter={filterAgent} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: bolhas de navegação ── */}
      <div className="md:hidden border-b border-[var(--border)] flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex gap-2.5 px-3 py-2.5 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {ALL_COLUMNS.map((col, i) => {
            const color = COL_COLORS[col]
            const count = columnCounts[col] || 0
            const isActive = i === mobileCol
            const hasUnread = !!colHasUnread[col]
            const unreadNum = colUnreadCount[col] || 0
            return (
              <button key={col} onClick={() => setMobileCol(i)}
                className="flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-200 active:scale-90">
                <div className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? color : color + '18',
                    border: `2px solid ${isActive ? color : color + '35'}`,
                    boxShadow: isActive ? `0 0 14px ${color}55` : 'none',
                  }}>
                  <span className="font-bold leading-none"
                    style={{ fontSize: count > 99 ? '10px' : count > 9 ? '13px' : '16px',
                      color: isActive ? 'white' : color }}>
                    {count > 99 ? '99+' : count}
                  </span>
                  {/* Badge vermelho iOS-style no canto superior direito */}
                  {hasUnread && (
                    <span className="absolute flex items-center justify-center font-bold text-white rounded-full shadow-lg"
                      style={{
                        top: '-4px', right: '-4px',
                        minWidth: unreadNum > 9 ? '18px' : '16px',
                        height: '16px',
                        fontSize: '9px',
                        paddingLeft: unreadNum > 9 ? '3px' : '0',
                        paddingRight: unreadNum > 9 ? '3px' : '0',
                        backgroundColor: '#ef4444',
                        border: '1.5px solid var(--bg-secondary)',
                        lineHeight: '1',
                      }}>
                      {unreadNum > 99 ? '99+' : unreadNum}
                    </span>
                  )}
                </div>
                <span className="text-center font-semibold"
                  style={{ fontSize: '9px', lineHeight: '1.2',
                    color: isActive ? color : 'var(--text-muted)',
                    maxWidth: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {COL_LABELS[col]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Mobile: colunas com swipe horizontal ── */}
      <div className="md:hidden flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}>
        <div className="absolute inset-0">
          {ALL_COLUMNS.map((col, i) => (
            <div key={col}
              className="absolute inset-0 transition-all duration-300 ease-in-out"
              style={{
                opacity: i === mobileCol ? 1 : 0,
                pointerEvents: i === mobileCol ? 'all' : 'none',
                transform: i === mobileCol
                  ? 'translateX(0)'
                  : i < mobileCol ? 'translateX(-100%)' : 'translateX(100%)',
              }}>
              <KanbanColumn columnId={col} refreshToken={colRefresh[col] || 0} onDrop={handleDrop} agentFilter={filterAgent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
