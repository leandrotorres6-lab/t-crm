'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { kanbanCache } from '../../lib/kanbanCache'
import KanbanCard from './KanbanCard'
import { Loader2, Plus } from 'lucide-react'
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

export default function KanbanColumn({ columnId, refreshToken, onDrop }) {
  const [leads, setLeads] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const bottomRef = useRef(null)
  const scrollRef = useRef(null)
  const loadingRef = useRef(false)
  const initialLoad = useRef(true)
  const { currentAgent, setScheduleModal, setPaymentModal, pendingMoves, applyPendingMove } = useApp()

  const retryRef = useRef(null)

  const loadLeads = useCallback(async (pageNum = 1, silent = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!silent) setLoading(true)

    try {
      // Cache local do frontend (instantâneo)
      if (pageNum === 1) {
        const cached = kanbanCache.get(columnId, 1)
        if (cached) {
          setLeads(cached.items)
          setHasMore(cached.hasMore)
          setTotal(cached.total)
          setPage(1)
          loadingRef.current = false
          if (!silent) setLoading(false)
          return
        }
      }

      const data = await api.getColumnLeads(columnId, pageNum, currentAgent?.id, currentAgent?.role)

      if (pageNum === 1) {
        // Se o backend ainda está buscando do Chatwoot (cacheReady=false),
        // agenda retry em 2s para pegar dados frescos
        if (data.cacheReady === false && data.items.length === 0) {
          loadingRef.current = false
          if (!silent) setLoading(false)
          clearTimeout(retryRef.current)
          retryRef.current = setTimeout(() => loadLeads(1, true), 2000)
          return
        }

        kanbanCache.set(columnId, 1, data)
        // Sempre atualiza direto — hiddenIds cuida de esconder cards em movimento
        setLeads(data.items)
        setHasMore(data.hasMore)
        setTotal(data.total)
        setPage(1)
      } else {
        setLeads(prev => [...prev, ...data.items])
        setHasMore(data.hasMore)
        setTotal(data.total)
        setPage(pageNum)
      }
    } catch (err) {
      console.error('[KanbanColumn]', columnId, err.message)
      // Retry em 3s em caso de erro de rede
      clearTimeout(retryRef.current)
      retryRef.current = setTimeout(() => loadLeads(1, true), 3000)
    } finally {
      loadingRef.current = false
      if (!silent) setLoading(false)
    }
  }, [columnId, currentAgent?.id])

  // Monta → carrega imediatamente
  useEffect(() => {
    loadLeads(1, false)
    return () => clearTimeout(retryRef.current)
  }, [columnId, currentAgent?.id])

  // Escuta evento customizado de remoção imediata de card
  useEffect(() => {
    const handler = (e) => {
      const { leadId, fromCol } = e.detail
      if (fromCol === columnId) {
        setLeads(prev => prev.filter(l => l.id !== leadId))
        setTotal(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('tcrm:lead-moved', handler)
    return () => window.removeEventListener('tcrm:lead-moved', handler)
  }, [columnId])

  // refreshToken muda → recarrega em background
  useEffect(() => {
    if (refreshToken > 0) {
      kanbanCache.invalidate(columnId)
      loadLeads(1, true)
    }
  }, [refreshToken])

  // Lazy load vertical
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) loadLeads(page + 1)
    }, { root: el, threshold: 0.1 })
    if (bottomRef.current) obs.observe(bottomRef.current)
    return () => obs.disconnect()
  }, [hasMore, page])

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    let leadData
    try { leadData = JSON.parse(e.dataTransfer.getData('application/json')) }
    catch { return }
    if (leadData.column === columnId) return

    if (columnId === 'agendado') { setScheduleModal({ lead: leadData }); return }
    if (columnId === 'aguardando_pagamento') { setPaymentModal({ lead: leadData }); return }

    // Otimismo instantâneo — avisa todas as colunas via evento global
    applyPendingMove(leadData, columnId)
    // Adiciona na destino
    setLeads(prev => prev.find(l => l.id === leadData.id) ? prev : [{ ...leadData, column: columnId }, ...prev])
    setTotal(prev => prev + 1)
    // Remove da origem via evento (a coluna de origem escuta e remove imediatamente)
    window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
      detail: { leadId: leadData.id, fromCol: leadData.column, toCol: columnId }
    }))
    kanbanCache.invalidate(leadData.column)
    kanbanCache.invalidate(columnId)

    api.moveLead(leadData.id, columnId, leadData.column)
      .then(() => {
        onDrop && onDrop(leadData.id, leadData.column, columnId)
      })
      .catch(() => {
        // Reverte em caso de erro
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
          detail: { leadId: leadData.id, fromCol: columnId, toCol: leadData.column }
        }))
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

  return (
    <div className="kanban-column flex-shrink-0 flex flex-col rounded-xl transition-all duration-200"
      style={{
        width: '280px', minWidth: '280px', maxHeight: 'calc(100vh - 80px)',
        backgroundColor: dragOver ? color + '08' : 'var(--bg-secondary)',
        border: `1px solid ${dragOver ? color : 'var(--border)'}`,
      }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{COL_LABELS[columnId]}</span>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color + '20', color }}>{displayTotal}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin' }}>
        {allLeads.map(lead => <KanbanCard key={lead.id} lead={lead} />)}
        <div ref={bottomRef} className="h-2" />
        {loading && allLeads.length === 0 && (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl p-3 animate-pulse"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', opacity: 1 - i * 0.2 }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg" style={{ backgroundColor: 'var(--border)' }} />
                  <div className="h-3 rounded-full flex-1" style={{ backgroundColor: 'var(--border)', maxWidth: '60%' }} />
                </div>
                <div className="h-2.5 rounded-full mb-1.5" style={{ backgroundColor: 'var(--border)', width: '80%' }} />
                <div className="h-2.5 rounded-full" style={{ backgroundColor: 'var(--border)', width: '50%' }} />
              </div>
            ))}
          </div>
        )}
        {!loading && allLeads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: color + '15' }}>
              <Plus size={16} style={{ color }} />
            </div>
            <p className="text-xs text-[var(--text-muted)]">Nenhum lead aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}
