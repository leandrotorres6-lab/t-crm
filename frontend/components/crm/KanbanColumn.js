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
  const { currentAgent, setScheduleModal, setPaymentModal, pendingMoves, applyPendingMove, unreadCounts, unreadUpdatedAt } = useApp()

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
        // Merge com timestamps: item do banco tem updatedAt, estado local também
        // Só aceita unread do banco se for mais recente que o último update local
        setLeads(prev => {
          const prevMap = {}
          prev.forEach(l => { prevMap[l.id] = l })
          return data.items.map(item => {
            const localTs = unreadUpdatedAt?.current?.[item.id] || '2000-01-01'
            const remoteTs = item.updatedAt || '2000-01-01'
            // Se o estado local é mais recente (agente leu após este dado), mantém local
            if (localTs > remoteTs && prevMap[item.id]) {
              return { ...item, unreadCount: prevMap[item.id].unreadCount }
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

  // Eventos globais de movimento
  useEffect(() => {
    const handler = ({ detail: { leadId, fromCol } }) => {
      if (fromCol === columnId) {
        setLeads(prev => prev.filter(l => l.id !== leadId))
        setTotal(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('tcrm:lead-moved', handler)
    return () => window.removeEventListener('tcrm:lead-moved', handler)
  }, [columnId])

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
          // NÃO incrementa unreadCount aqui — AppContext.unreadCounts é a fonte de verdade
          // KanbanCard lê de unreadCounts[lead.id] que já foi incrementado no AppContext
        }

        // Invalida cache
        kanbanCache.invalidate(columnId)

        // Move para o topo
        if (idx === 0) return [updatedCard, ...prev.slice(1)]
        return [updatedCard, ...prev.filter((_, i) => i !== idx)]
      })
    }
    window.addEventListener('tcrm:new-message', handler)
    return () => window.removeEventListener('tcrm:new-message', handler)
  }, [columnId])

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
    setLeads(prev => prev.find(l => l.id === lead.id) ? prev : [{ ...lead, column: columnId }, ...prev])
    setTotal(prev => prev + 1)
    window.dispatchEvent(new CustomEvent('tcrm:lead-moved', { detail: { leadId: lead.id, fromCol: lead.column, toCol: columnId } }))
    kanbanCache.invalidate(lead.column); kanbanCache.invalidate(columnId)
    api.moveLead(lead.id, columnId, lead.column)
      .then(() => { onDrop?.(lead.id, lead.column, columnId) })
      .catch(() => { window.dispatchEvent(new CustomEvent('tcrm:lead-moved', { detail: { leadId: lead.id, fromCol: columnId, toCol: lead.column } })); loadLeads(1, false) })
  }

  const color = COL_COLORS[columnId] || '#3b82f6'
  const incomingLeads = Object.values(pendingMoves || {})
    .filter(m => m.toCol === columnId && !leads.find(l => l.id === m.lead.id))
    .map(m => ({ ...m.lead, column: columnId }))
  const hiddenIds = new Set(Object.entries(pendingMoves || {}).filter(([, m]) => m.fromCol === columnId).map(([id]) => id))
  const allLeads = [...incomingLeads, ...leads.filter(l => !hiddenIds.has(l.id))]
  const displayTotal = Math.max(0, total + incomingLeads.length - hiddenIds.size)

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
      <div ref={scrollRef} className="kanban-scroll flex-1 overflow-y-auto p-2.5 space-y-2" style={{ scrollbarWidth: 'thin' }}>
        {/* Skeleton inicial */}
        {loading && allLeads.length === 0 && (
          <>
            <SkeletonCard opacity={1} />
            <SkeletonCard opacity={0.7} />
            <SkeletonCard opacity={0.4} />
          </>
        )}

        {/* Cards */}
        {allLeads.map(lead => (
          <div key={lead.id} className="kanban-card-wrap">
            <KanbanCard lead={lead} columnId={columnId} />
          </div>
        ))}

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
