'use client'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { kanbanCache } from '../../lib/kanbanCache'
import KanbanCard from './KanbanCard'
import { useApp } from '../../contexts/AppContext'

const COL_LABELS = {
  leads: 'Leads', negociacao: 'Negociação', aguardando_cotacao: 'Aguard. Cotação',
  agendado: 'Agendado', lancar_venda: 'Lançar Venda', aguardando_pagamento: 'Aguard. Pagamento',
  pago: 'Pago ✓', sem_retorno: 'Sem Retorno',
}
const COL_COLORS = {
  leads: '#3b82f6', negociacao: '#8b5cf6', aguardando_cotacao: '#f59e0b',
  agendado: '#06b6d4', lancar_venda: '#10b981', aguardando_pagamento: '#f97316',
  pago: '#22c55e', sem_retorno: '#6b7280',
}

// Skeleton card
const SkeletonCard = memo(({ opacity = 1 }) => (
  <div className="rounded-xl p-3 animate-pulse" style={{
    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    borderLeft: '3px solid var(--border)', opacity
  }}>
    <div className="flex items-center gap-2.5 mb-2.5">
      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: 'var(--border)' }} />
      <div className="flex-1">
        <div className="h-3 rounded-full mb-1.5" style={{ backgroundColor: 'var(--border)', width: '65%' }} />
        <div className="h-2.5 rounded-full" style={{ backgroundColor: 'var(--border)', width: '40%' }} />
      </div>
    </div>
    <div className="h-2.5 rounded-full mb-1.5" style={{ backgroundColor: 'var(--border)', width: '90%' }} />
    <div className="h-2.5 rounded-full" style={{ backgroundColor: 'var(--border)', width: '60%' }} />
  </div>
))

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContextMenu({ menu, agents, onClose, onMarkUnread, onAssign, onMove, onFinalize }) {
  const ref = useRef(null)
  const [showAssign, setShowAssign] = useState(false)
  const [showMove, setShowMove] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const x = Math.min(menu.x, window.innerWidth - 220)
  const y = Math.min(menu.y, window.innerHeight - 280)

  return (
    <div ref={ref}
      className="fixed z-[9999] rounded-xl shadow-2xl py-1 overflow-visible"
      style={{ top: y, left: x, minWidth: '190px',
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      onContextMenu={e => e.preventDefault()}>

      {/* Cabeçalho */}
      <div className="px-3 py-1.5 border-b border-[var(--border)] mb-1">
        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{menu.lead.name}</p>
        <p className="text-[10px] text-[var(--text-muted)] truncate">{menu.lead.phone}</p>
      </div>

      {/* Marcar não lida */}
      <button onClick={() => { onMarkUnread(menu.lead); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--bg-hover)] text-left transition-colors">
        <span>🔴</span>
        <span className="text-[var(--text-secondary)]">Marcar como não lida</span>
      </button>

      {/* Mover para coluna */}
      <div className="relative">
        <button onClick={() => { setShowMove(o => !o); setShowAssign(false) }}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-hover)] text-left transition-colors">
          <span className="flex items-center gap-2.5">
            <span>📁</span>
            <span className="text-[var(--text-secondary)]">Mover para</span>
          </span>
          <span className="text-[var(--text-muted)]" style={{fontSize:'10px'}}>▶</span>
        </button>
        {showMove && (
          <div className="absolute left-full top-0 rounded-xl shadow-2xl py-1"
            style={{ minWidth:'170px', backgroundColor:'var(--bg-card)', border:'1px solid var(--border)' }}>
            {Object.entries(COL_LABELS).filter(([id]) => id !== menu.lead.column).map(([id, label]) => (
              <button key={id} onClick={() => { onMove(menu.lead, id); onClose() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-hover)] text-left transition-colors">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{backgroundColor: COL_COLORS[id]}} />
                <span className="text-[var(--text-secondary)]">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divisor */}
      <div className="h-px mx-2 my-1" style={{backgroundColor:'var(--border)'}} />

      {/* Finalizar */}
      <button onClick={() => { onFinalize(menu.lead); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-green-500/10 text-left transition-colors"
        style={{color:'#22c55e'}}>
        <span>✅</span>
        <span>Finalizar conversa</span>
      </button>
    </div>
  )
}

const KanbanColumn = memo(function KanbanColumn({ columnId, refreshToken, onDrop }) {
  const [leads, setLeads] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  const loadingRef = useRef(false)
  const retryRef = useRef(null)
  const { currentAgent, setScheduleModal, setPaymentModal, pendingMoves, applyPendingMove, unreadCounts, setUnreadCounts, unreadUpdatedAt } = useApp()
  const [contextMenu, setContextMenu] = useState(null)
  const [pullY, setPullY] = useState(0)
  const [pulling, setPulling] = useState(false)
  const pullStartY = useRef(0)
  const [agents, setAgents] = useState([])

  // Carrega agentes uma vez
  useEffect(() => {
    api.getAgents().then(list => setAgents((list || []).filter(a => a.role !== 'supervisor'))).catch(() => {})
  }, [])

  const loadLeads = useCallback(async (pageNum = 1, silent = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!silent && pageNum === 1) setLoading(true)
    if (pageNum > 1) setLoadingMore(true)

    try {
      // Cache first (instantâneo)
      if (pageNum === 1) {
        const cached = kanbanCache.get(columnId, 1)
        if (cached) {
          // Re-sort cache by lastMessageAt before showing (may have been updated by new messages)
          const sorted = [...cached.items].sort((a, b) => {
            const ua = a.unreadCount || 0, ub = b.unreadCount || 0
            if (ua !== ub) return ub - ua
            return new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0)
          })
          setLeads(sorted)
          setHasMore(cached.hasMore)
          setTotal(cached.total)
          setPage(1)
          loadingRef.current = false
          setLoading(false)
          return
        }
      }

      const data = await api.getColumnLeads(columnId, pageNum, currentAgent?.id, currentAgent?.role)

      if (pageNum === 1) {
        if (data.cacheReady === false && data.items.length === 0) {
          loadingRef.current = false
          setLoading(false)
          retryRef.current = setTimeout(() => loadLeads(1, true), 2000)
          return
        }
        kanbanCache.set(columnId, 1, data)
        // Merge: preserva dados locais mais recentes (lastMessage, unreadCount, etc)
        setLeads(prev => {
          const prevMap = {}
          prev.forEach(l => { prevMap[l.id] = l })
          return data.items.map(item => {
            const local = prevMap[item.id]
            if (!local) return item
            // Se o card local tem dados mais recentes, preserva
            const localTs = local.lastMessageAt || local.updatedAt || ''
            const remoteTs = item.lastMessageAt || item.updatedAt || ''
            if (localTs > remoteTs) {
              return { ...item, lastMessage: local.lastMessage, lastMessageAt: local.lastMessageAt, unreadCount: local.unreadCount }
            }
            return item
          })
        })
        setHasMore(data.hasMore)
        setTotal(data.total)
        setPage(1)
      } else {
        setLeads(prev => {
          const ids = new Set(prev.map(l => l.id))
          return [...prev, ...data.items.filter(l => !ids.has(l.id))]
        })
        setHasMore(data.hasMore)
        setTotal(prev => Math.max(prev, data.total))
        setPage(pageNum)
      }
    } catch (err) {
      console.error('[KanbanColumn]', columnId, err.message)
      retryRef.current = setTimeout(() => loadLeads(1, true), 3000)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [columnId, currentAgent?.id])

  useEffect(() => {
    loadLeads(1, false)
    return () => clearTimeout(retryRef.current)
  }, [columnId, currentAgent?.id])

  useEffect(() => {
    if (refreshToken > 0) {
      kanbanCache.invalidate(columnId)
      loadLeads(1, true)
    }
  }, [refreshToken])

  // Reporta contagem de não lidas desta coluna (para badge nas bolhas mobile)
  useEffect(() => {
    const count = leads.reduce((sum, l) => sum + (unreadCounts[l.id] || l.unreadCount || 0), 0)
    window.dispatchEvent(new CustomEvent('tcrm:col-unread', {
      detail: { columnId, hasUnread: count > 0, unreadCount: count }
    }))
  }, [leads, unreadCounts, columnId])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = bottomRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingRef.current && hasMore) {
        loadLeads(page + 1)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, page, loadLeads])

  // Eventos globais de movimento — 100% atômico, sem fetch, sem delay
  useEffect(() => {
    const handler = ({ detail: { leadId, fromCol, toCol, leadData } }) => {
      const lid = String(leadId)

      // 1. Remove da coluna de origem
      if (fromCol === columnId) {
        setLeads(prev => {
          const exists = prev.some(l => String(l.id) === lid)
          if (!exists) return prev
          setTotal(t => Math.max(0, t - 1))
          return prev.filter(l => String(l.id) !== lid)
        })
      }

      // 2. Insere na coluna de destino (outro usuário moveu para cá)
      if (toCol === columnId && fromCol !== columnId) {
        setLeads(prev => {
          // Dedup: não inserir se já existe
          if (prev.some(l => String(l.id) === lid)) return prev

          if (leadData) {
            // Lead completo veio no evento — inserção instantânea, zero fetch
            const card = { ...leadData, column: toCol }
            setTotal(t => t + 1)
            return [card, ...prev]
          }
          // Fallback: lead não veio no evento (compatibilidade) — busca pontual
          kanbanCache.invalidate(columnId)
          loadLeads(1, true)
          return prev
        })
      }
    }
    window.addEventListener('tcrm:lead-moved', handler)
    return () => window.removeEventListener('tcrm:lead-moved', handler)
  }, [columnId, loadLeads])

  // Conversa resolvida — remove de qualquer coluna
  useEffect(() => {
    const handler = ({ detail: { id } }) => {
      setLeads(prev => {
        const exists = prev.some(l => String(l.id) === String(id))
        if (!exists) return prev
        setTotal(t => Math.max(0, t - 1))
        return prev.filter(l => String(l.id) !== String(id))
      })
    }
    window.addEventListener('tcrm:conversation-resolved', handler)
    return () => window.removeEventListener('tcrm:conversation-resolved', handler)
  }, [])

  // Conversa lida — zera local unreadCount no card (o global já foi zerado no AppContext)
  useEffect(() => {
    const handler = ({ detail: { conversationId } }) => {
      setLeads(prev => {
        const idx = prev.findIndex(l => l.id === conversationId)
        if (idx === -1) return prev
        if (prev[idx].unreadCount === 0) return prev  // já está zerado, evita re-render
        const updated = { ...prev[idx], unreadCount: 0 }
        return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
      })
    }
    window.addEventListener('tcrm:read', handler)
    return () => window.removeEventListener('tcrm:read', handler)
  }, [])

  useEffect(() => {
    const handler = ({ detail: { conversationId, content, lastMessageAt, isInbound } }) => {
      setLeads(prev => {
        const idx = prev.findIndex(l => l.id === conversationId)
        if (idx === -1) return prev

        const ts = lastMessageAt || new Date().toISOString()
        const card = prev[idx]
        const updatedCard = {
          ...card,
          lastMessage: content || card.lastMessage,
          lastMessageAt: ts,
          updatedAt: ts,
          // Incrementa local + global garante que badge aparece imediatamente
          unreadCount: isInbound !== false ? (card.unreadCount || 0) + 1 : card.unreadCount || 0,
          // Força React a ver um objeto diferente
          _tick: Date.now(),
        }

        kanbanCache.invalidate(columnId)

        // Sempre gera array novo — move card para o topo
        const rest = prev.filter((_, i) => i !== idx)
        return [updatedCard, ...rest]
      })
    }
    window.addEventListener('tcrm:new-message', handler)
    return () => window.removeEventListener('tcrm:new-message', handler)
  }, [columnId])

  // Força reload quando nova conversa chega na coluna
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.column === columnId) {
        kanbanCache.invalidate(columnId)
        loadLeads(1, true)
      }
    }
    window.addEventListener('tcrm:reload-column', handler)
    return () => window.removeEventListener('tcrm:reload-column', handler)
  }, [columnId, loadLeads])

  // Drag
  const handleDragOver = e => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }
  const handleDrop = e => {
    e.preventDefault(); setDragOver(false)
    let lead; try { lead = JSON.parse(e.dataTransfer.getData('application/json')) } catch { return }
    if (lead.column === columnId) return
    if (columnId === 'agendado') { setScheduleModal({ lead }); return }
    if (columnId === 'aguardando_pagamento') { setPaymentModal({ lead }); return }
    applyPendingMove(lead, columnId)
    // Adiciona ao destino apenas se não existe (dedup)
    setLeads(prev => prev.find(l => l.id === lead.id) ? prev : [{ ...lead, column: columnId }, ...prev])
    setTotal(prev => prev + 1)
    // Notifica coluna de origem para remover imediatamente
    window.dispatchEvent(new CustomEvent('tcrm:lead-moved', { detail: { leadId: lead.id, fromCol: lead.column, toCol: columnId } }))
    kanbanCache.invalidate(lead.column); kanbanCache.invalidate(columnId)
    api.moveLead(lead.id, columnId, lead.column)
      .then(() => { onDrop?.(lead.id, lead.column, columnId) })
      .catch(() => {
        // Rollback: devolver ao original
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', { detail: { leadId: lead.id, fromCol: columnId, toCol: lead.column } }))
        loadLeads(1, false)
      })
  }

  const color = COL_COLORS[columnId] || '#3b82f6'
  const incomingLeads = Object.values(pendingMoves || {})
    .filter(m => m.toCol === columnId && !leads.find(l => l.id === m.lead.id))
    .map(m => ({ ...m.lead, column: columnId }))
  const hiddenIds = new Set(Object.entries(pendingMoves || {}).filter(([, m]) => m.fromCol === columnId).map(([id]) => id))
  const allLeads = [...incomingLeads, ...leads.filter(l => !hiddenIds.has(l.id))]
  const displayTotal = Math.max(0, total + incomingLeads.length - hiddenIds.size)

  // Context menu handlers
  const handleMarkUnread = useCallback((lead) => {
    setUnreadCounts(prev => ({ ...prev, [String(lead.id)]: (prev[String(lead.id)] || 0) + 1 }))
  }, [setUnreadCounts])

  const handleAssign = useCallback(async (lead, agent) => {
    try {
      await api.assignAgent(lead.id, agent.id)
      const role = currentAgent?.role
      if (role === 'supervisor') {
        // Supervisor vê todos — atualiza assigneeName sem remover o card
        setLeads(prev => prev.map(l =>
          l.id === lead.id ? { ...l, assignedTo: String(agent.id), assigneeName: agent.name } : l
        ))
      } else {
        // Vendedor — card vai para outro vendedor, remove do state
        setLeads(prev => prev.filter(l => l.id !== lead.id))
        setTotal(prev => Math.max(0, prev - 1))
      }
      kanbanCache.invalidate(columnId)
    } catch (e) { console.error(e) }
  }, [columnId, currentAgent?.role])

  const handleMove = useCallback(async (lead, col) => {
    // Optimistic: remove imediatamente da coluna atual
    setLeads(prev => prev.filter(l => l.id !== lead.id))
    setTotal(prev => Math.max(0, prev - 1))
    // Notifica coluna destino via evento global
    window.dispatchEvent(new CustomEvent('tcrm:lead-moved', { detail: { leadId: lead.id, fromCol: lead.column, toCol: col } }))
    kanbanCache.invalidate(lead.column)
    kanbanCache.invalidate(col)
    try {
      await api.moveLead(lead.id, col, lead.column)
    } catch (e) {
      console.error(e)
      // Rollback se API falhar
      setLeads(prev => [{ ...lead }, ...prev])
      setTotal(prev => prev + 1)
    }
  }, [])

  const handleFinalize = useCallback(async (lead) => {
    try {
      await api.finalizeLead(lead.id)
      setLeads(prev => prev.filter(l => l.id !== lead.id))
      setTotal(prev => Math.max(0, prev - 1))
    } catch (e) { console.error(e) }
  }, [])

  return (
    <div className="flex flex-col h-full rounded-xl transition-all"
      style={{
        width: 'min(280px, 100vw)', minWidth: 0, maxWidth: '100%',
        backgroundColor: dragOver ? color + '08' : 'var(--bg-secondary)',
        border: `1px solid ${dragOver ? color + '60' : 'var(--border)'}`,
        maxHeight: 'calc(100vh - 80px)',
      }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

      {/* Header fixo */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{COL_LABELS[columnId]}</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
          style={{ backgroundColor: color + '20', color }}>{displayTotal}</span>
      </div>

      {/* Lista scrollável */}
      <div ref={scrollRef} className="kanban-scroll flex-1 overflow-y-auto space-y-2 safe-bottom w-full"
        style={{ scrollbarWidth: 'thin', padding: '10px 8px 0 8px' }}
        onTouchStart={e => {
          if (scrollRef.current?.scrollTop === 0) {
            pullStartY.current = e.touches[0].clientY
            setPulling(true)
          }
        }}
        onTouchMove={e => {
          if (!pulling) return
          const dy = e.touches[0].clientY - pullStartY.current
          if (dy > 0 && dy < 80) setPullY(dy)
        }}
        onTouchEnd={() => {
          if (pullY > 50) { loadLeads(1, true) }
          setPullY(0)
          setPulling(false)
        }}>
        {/* Pull to refresh indicator */}
        {pullY > 10 && (
          <div className="flex justify-center py-1 transition-all" style={{ opacity: pullY / 60 }}>
            <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          </div>
        )}
        {/* Skeleton inicial */}
        {loading && allLeads.length === 0 && (
          <>
            <SkeletonCard opacity={1} />
            <SkeletonCard opacity={0.7} />
            <SkeletonCard opacity={0.4} />
          </>
        )}

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            menu={contextMenu}
            agents={agents}
            onClose={() => setContextMenu(null)}
            onMarkUnread={handleMarkUnread}
            onAssign={handleAssign}
            onMove={handleMove}
            onFinalize={handleFinalize}
          />
        )}

        {/* Cards — long press no mobile abre o mesmo menu de contexto do desktop */}
        {allLeads.map(lead => {
          let longPressTimer = null
          return (
            <div key={lead.id} className="kanban-card-wrap"
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ x: e.clientX, y: e.clientY, lead })
              }}
              onTouchStart={e => {
                const touch = e.touches[0]
                longPressTimer = setTimeout(() => {
                  // Vibração tátil ao abrir o menu
                  try { navigator.vibrate?.(30) } catch {}
                  setContextMenu({ x: touch.clientX, y: touch.clientY, lead })
                  longPressTimer = null
                }, 500)
              }}
              onTouchMove={() => { clearTimeout(longPressTimer); longPressTimer = null }}
              onTouchEnd={() => { clearTimeout(longPressTimer); longPressTimer = null }}>
              <KanbanCard lead={lead} columnId={columnId} />
            </div>
          )
        })}

        {/* Loader de paginação */}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: color + '30', borderTopColor: color }} />
          </div>
        )}

        {/* Empty state */}
        {!loading && allLeads.length === 0 && (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: color + '10' }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color + '40' }} />
            </div>
            <p className="text-xs text-[var(--text-muted)]">Nenhum lead</p>
          </div>
        )}

        {/* Trigger de infinite scroll */}
        <div ref={bottomRef} className="h-1" />
      </div>
    </div>
  )
})

export default KanbanColumn
