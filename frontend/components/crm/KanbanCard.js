'use client'
import { memo, useRef, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { ChevronRight, Clock } from 'lucide-react'

const COL_COLORS = {
  leads: '#3b82f6', negociacao: '#8b5cf6', aguardando_cotacao: '#f59e0b',
  agendado: '#06b6d4', lancar_venda: '#10b981', aguardando_pagamento: '#f97316',
  pago: '#22c55e', sem_retorno: '#6b7280',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
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

const KanbanCard = memo(function KanbanCard({ lead, columnId }) {
  const { setSelectedLead, pendingMoves, unreadCounts } = useApp()
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const [pressing, setPressing] = useState(false)

  const unread = unreadCounts[lead.id] || lead.unreadCount || 0
  const color = COL_COLORS[columnId] || '#6b7280'
  const isPending = !!pendingMoves?.[lead.id]

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/json', JSON.stringify(lead))
        e.currentTarget.style.opacity = '0.4'
      }}
      onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
      onMouseDown={() => setPressing(true)}
      onMouseUp={() => setPressing(false)}
      onMouseLeave={() => setPressing(false)}
      onTouchStart={e => {
        touchStartY.current = e.touches[0].clientY
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={e => {
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
        const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current)
        if (dy < 8 && dx < 8) { e.preventDefault(); setSelectedLead(lead) }
      }}
      onClick={() => setSelectedLead(lead)}
      className="group relative flex flex-col gap-2 p-3 rounded-xl cursor-pointer select-none transition-all duration-150"
      style={{
        backgroundColor: pressing ? 'var(--bg-hover)' : 'var(--bg-card)',
        border: `1px solid ${unread > 0 ? color + '40' : 'var(--border)'}`,
        borderLeft: `3px solid ${color}`,
        opacity: isPending ? 0.5 : 1,
        transform: pressing ? 'scale(0.98)' : 'scale(1)',
        boxShadow: unread > 0 ? `0 0 0 1px ${color}20` : 'none',
      }}>

      {/* Header: avatar + nome + unread + seta */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
          style={{ backgroundColor: color + '20', color }}>
          {lead.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm truncate leading-tight ${unread > 0 ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
              {lead.name}
            </p>
            {unread > 0 && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: '#ef4444', fontSize: '10px', padding: '0 3px', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          {lead.phone && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5" style={{ fontSize: '11px' }}>
              {lead.phone}
            </p>
          )}
        </div>
        <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </div>

      {/* Última mensagem */}
      {lead.lastMessage && (
        <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed" style={{ fontSize: '12px' }}>
          {lead.lastMessage}
        </p>
      )}

      {/* Footer: tags + assignee + tempo */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {lead.product && (
          <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa', fontSize: '10px' }}>
            {lead.product}
          </span>
        )}
        {(lead.labels || []).slice(0, 2).map(l => (
          <span key={l} className="text-xs px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: l === 'humano' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              color: l === 'humano' ? '#f59e0b' : 'var(--text-muted)', fontSize: '10px' }}>
            {l}
          </span>
        ))}
        {lead.assigneeName && (
          <div className="ml-auto flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: color, fontSize: '9px' }}>
            {lead.assigneeName.slice(0, 2).toUpperCase()}
          </div>
        )}
        {(lead.lastMessageAt || lead.createdAt) && (
          <span className="text-xs text-[var(--text-muted)] ml-auto" style={{ fontSize: '10px' }}>
            {formatTime(lead.lastMessageAt || lead.createdAt)}
          </span>
        )}
      </div>
    </div>
  )
})

export default KanbanCard
