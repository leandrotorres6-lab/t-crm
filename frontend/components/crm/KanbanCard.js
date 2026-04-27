'use client'
import { memo, useRef, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { ChevronRight } from 'lucide-react'

const COL_COLORS = {
  leads:'#3b82f6', negociacao:'#8b5cf6', aguardando_cotacao:'#f59e0b',
  agendado:'#06b6d4', lancar_venda:'#10b981', aguardando_pagamento:'#f97316',
  pago:'#22c55e', sem_retorno:'#6b7280',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const now  = new Date()
  const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return hhmm
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `Ontem`
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

// ── Ícone de mídia ────────────────────────────────────────────────────────────
function MediaBadge({ type }) {
  if (type === 'audio') return (
    <span className="flex items-center gap-1" style={{ color: '#a78bfa' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v5a2 2 0 0 0 4 0V7a2 2 0 0 0-2-2zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.92V22h-4v-1.08A7 7 0 0 1 5 14z"/>
      </svg>
      Áudio
    </span>
  )
  if (type === 'image') return (
    <span className="flex items-center gap-1" style={{ color: '#22d3ee' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
      </svg>
      Imagem
    </span>
  )
  if (type === 'document') return (
    <span className="flex items-center gap-1" style={{ color: '#fbbf24' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
      </svg>
      Documento
    </span>
  )
  return null
}

// ── Seta de direção ──────────────────────────────────────────────────────────
// isOutbound = true  → EU enviei → seta VERDE para baixo ↓
// isOutbound = false → CLIENTE enviou → seta AZUL para cima ↑
function DirectionArrow({ isOutbound }) {
  if (isOutbound) {
    // ↓ verde = eu enviei (saindo)
    return (
      <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
        <path d="M5 1L5 9M5 9L1 5.5M5 9L9 5.5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  // ↑ azul = cliente enviou (entrando)
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
      <path d="M5 11L5 3M5 3L1 6.5M5 3L9 6.5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function KanbanCard({ lead, columnId }) {
  const { setSelectedLead, pendingMoves, unreadCounts } = useApp()
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const [pressing, setPressing] = useState(false)

  const unread    = Math.max(unreadCounts[lead.id] || 0, lead.unreadCount || 0)
  const color     = COL_COLORS[columnId] || '#6b7280'
  const isPending = !!pendingMoves?.[lead.id]
  const msgType   = lead.lastMsgType || 'text'
  // Se tem mensagem e o tipo não está definido, assume inbound (cliente)
  // Se tem não-lidas, última msg é definitivamente do cliente (inbound)
  // Se lastMsgIsOutbound está definido explicitamente, usa o valor
  const hasDefinedDir = lead.lastMsgIsOutbound !== undefined && lead.lastMsgIsOutbound !== null
  const isOut = hasDefinedDir ? lead.lastMsgIsOutbound === true : false
  // Só mostra seta se tiver direção definida ou tiver unread (certeza que é inbound)
  const showArrow = hasDefinedDir || unread > 0

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify(lead)); e.currentTarget.style.opacity = '0.4' }}
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
      className="group relative flex flex-col gap-2 p-3 rounded-xl cursor-pointer select-none w-full"
      style={{
        backgroundColor: pressing ? 'var(--bg-hover)' : 'var(--bg-card)',
        border: `1px solid ${unread > 0 ? color + '40' : 'var(--border)'}`,
        borderLeft: `3px solid ${color}`,
        opacity: isPending ? 0.5 : 1,
        transform: pressing ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s, opacity 0.1s',
        boxShadow: unread > 0 ? `0 0 0 1px ${color}20` : 'none',
        // content-visibility: auto = browser pula render de cards fora da viewport
        // Equivale a virtualização sem biblioteca — ganho imediato no mobile
        contentVisibility: 'auto',
        containIntrinsicSize: '0 90px',  // altura estimada do card
        contain: 'layout style',
      }}>

      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: color + '20', color }}>
          {lead.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm truncate leading-tight ${unread > 0 ? 'font-bold' : 'font-semibold'} text-[var(--text-primary)]`}>
              {lead.name}
            </p>
            {unread > 0 && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: '#ef4444', fontSize: '10px', padding: '0 3px' }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
          {lead.phone && (
            <p className="text-xs text-[var(--text-muted)] truncate" style={{ fontSize: '11px' }}>
              {lead.phone}
            </p>
          )}
        </div>
        <ChevronRight size={13} className="flex-shrink-0 text-[var(--text-muted)] opacity-0 group-hover:opacity-60 mt-0.5" />
      </div>

      {/* Última mensagem: seta + ícone ou texto */}
      {(lead.lastMessage || msgType !== 'text') && (
        <div className="flex items-center gap-1.5" style={{ minHeight: 14 }}>
          {lead.lastMessage && showArrow && <DirectionArrow isOutbound={isOut} />}
          {msgType !== 'text'
            ? <span style={{ fontSize: '11px' }}><MediaBadge type={msgType} /></span>
            : <p className="text-xs text-[var(--text-muted)] truncate flex-1" style={{ fontSize: '12px' }}>
                {lead.lastMessage}
              </p>
          }
        </div>
      )}

      {/* Footer */}
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
        <div className="ml-auto flex items-center gap-1.5">
          {lead.assigneeName && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: color, fontSize: '8px' }}>
              {lead.assigneeName.slice(0, 2).toUpperCase()}
            </div>
          )}
          {(lead.lastMessageAt || lead.createdAt) && (
            <span className="text-xs text-[var(--text-muted)]" style={{ fontSize: '10px' }}>
              {formatTime(lead.lastMessageAt || lead.createdAt)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(KanbanCard)
