'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import KanbanColumn from './KanbanColumn'
import { api } from '../../lib/api'
import { kanbanCache } from '../../lib/kanbanCache'
import { useSocket } from '../../lib/socket'
import { ChevronLeft, ChevronRight, RefreshCw, Bell } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'

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
  const { unreadCounts } = useApp()
  const [columnCounts, setColumnCounts] = useState({})
  const [colRefresh, setColRefresh] = useState({})
  const [notifications, setNotifications] = useState([])
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
      <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)]">Pipeline CRM</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{totalLeads} leads ativos</p>
          </div>
          <UnreadBadge unreadCounts={unreadCounts} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshAll} className="btn-ghost" title="Atualizar">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => scrollBy(-1)} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scrollBy(1)} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Mobile: header da coluna atual ── */}
      <div className="md:hidden flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] flex-shrink-0">
        {/* Nome + badge + dots */}
        <div className="flex flex-col flex-1 items-center">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: currentColor }} />
            <span className="text-sm font-bold text-[var(--text-primary)]">{COL_LABELS[currentColId]}</span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: currentColor + '20', color: currentColor }}>
              {columnCounts[currentColId] || 0}
            </span>
          </div>
          {/* Dots clicáveis */}
          <div className="flex gap-1 mt-1.5">
            {ALL_COLUMNS.map((_, i) => (
              <button key={i} onClick={() => setMobileCol(i)}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === mobileCol ? '18px' : '6px',
                  height: '6px',
                  backgroundColor: i === mobileCol ? currentColor : 'var(--border)',
                }} />
            ))}
          </div>
        </div>
        <button onClick={refreshAll}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] flex-shrink-0">
          <RefreshCw size={14} className={false ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Toasts */}
      <div className="fixed top-16 right-3 z-50 flex flex-col gap-2 pointer-events-none md:top-4 md:right-[39%]">
        {notifications.map(n => (
          <div key={n.id} className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg text-sm animate-slide-up"
            style={{ backgroundColor: '#0f1a2e', border: '1px solid #1e293b', color: '#60a5fa' }}>
            <Bell size={13} />{n.text}
          </div>
        ))}
      </div>

      {/* ── Desktop: todas as colunas em scroll horizontal ── */}
      <div className="hidden md:block flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden"
          onDragOver={handleDragOver} onDragEnd={stopAutoScroll}>
          <div className="flex gap-3 p-4 h-full" style={{ minWidth: 'max-content' }}>
            {ALL_COLUMNS.map(col => (
              <KanbanColumn key={col} columnId={col}
                refreshToken={colRefresh[col] || 0} onDrop={handleDrop} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: pills de navegação no TOPO (abaixo do header) ── */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-[var(--border)] flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Pill esquerda */}
        {mobileCol > 0 ? (
          <button onClick={() => setMobileCol(i => i - 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={{
              backgroundColor: COL_COLORS[ALL_COLUMNS[mobileCol - 1]] + '25',
              color: COL_COLORS[ALL_COLUMNS[mobileCol - 1]],
              border: `1px solid ${COL_COLORS[ALL_COLUMNS[mobileCol - 1]]}40`,
            }}>
            <ChevronLeft size={13} />
            <span style={{ fontSize: '11px', fontWeight: '700', maxWidth: '70px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {COL_LABELS[ALL_COLUMNS[mobileCol - 1]]}
            </span>
          </button>
        ) : <div className="w-20" />}

        {/* Swipe hint */}
        <p className="text-xs text-[var(--text-muted)]" style={{ fontSize: '10px' }}>deslize ←→</p>

        {/* Pill direita */}
        {mobileCol < ALL_COLUMNS.length - 1 ? (
          <button onClick={() => setMobileCol(i => i + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all active:scale-95"
            style={{
              backgroundColor: COL_COLORS[ALL_COLUMNS[mobileCol + 1]] + '25',
              color: COL_COLORS[ALL_COLUMNS[mobileCol + 1]],
              border: `1px solid ${COL_COLORS[ALL_COLUMNS[mobileCol + 1]]}40`,
            }}>
            <span style={{ fontSize: '11px', fontWeight: '700', maxWidth: '70px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {COL_LABELS[ALL_COLUMNS[mobileCol + 1]]}
            </span>
            <ChevronRight size={13} />
          </button>
        ) : <div className="w-20" />}
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
              <KanbanColumn columnId={col} refreshToken={colRefresh[col] || 0} onDrop={handleDrop} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
