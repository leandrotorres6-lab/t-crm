'use client'
import { useRef, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'
import { Phone, Clock, ChevronRight } from 'lucide-react'

const PRODUCT_COLORS = {
  'Seguro de Vida': '#3b82f6',
  'Plano de Saúde': '#10b981',
  'Seguro Auto': '#f59e0b',
  'Seguro Residencial': '#8b5cf6',
  'Seguro Empresarial': '#ef4444',
}

const COLUMNS = [
  { id: 'leads', label: 'Leads', color: '#3b82f6' },
  { id: 'negociacao', label: 'Negociação', color: '#8b5cf6' },
  { id: 'aguardando_cotacao', label: 'Ag. Cotação', color: '#f59e0b' },
  { id: 'agendado', label: 'Agendado', color: '#06b6d4' },
  { id: 'lancar_venda', label: 'Lançar Venda', color: '#10b981' },
  { id: 'aguardando_pagamento', label: 'Ag. Pagamento', color: '#f97316' },
  { id: 'pago', label: 'Pago ✓', color: '#22c55e' },
  { id: 'sem_retorno', label: 'Sem Retorno', color: '#6b7280' },
]

// Labels de posição kanban - não exibir como chips avulsos no card
const KANBAN_CARD_LABELS = new Set([
  'lead','leads',
  'negociacao','negociação','em_negociacao','em_negociação',
  'aguardando_cotacao','aguardando_cotação','cotacao','cotação',
  'aguardando_documentacao','aguardando_documentação','documentacao',
  'agendado','agendamento',
  'lancar_venda','lançar_venda','venda',
  'aguardando_pagamento','pagamento',
  'pago','fechado',
  'sem_retorno','perdido','inativo',
])

function labelColor(str) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'][Math.abs(h) % 8]
}

export default function KanbanCard({ lead, onDragStart, onDragEnd }) {
  const { selectedLead, setSelectedLead, unreadCounts, setScheduleModal, setPaymentModal, applyPendingMove } = useApp()
  const isSelected = selectedLead?.id === lead.id
  const color = PRODUCT_COLORS[lead.product] || '#3b82f6'
  const unread = unreadCounts[String(lead.id)] ?? lead.unreadCount ?? 0
  const [menuOpen, setMenuOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const menuRef = useRef(null)

  const handleQuickMove = async (e, col) => {
    e.stopPropagation()
    setMenuOpen(false)

    if (col.id === lead.column) return

    if (col.id === 'agendado') {
      setScheduleModal({ lead })
      return
    }
    if (col.id === 'aguardando_pagamento') {
      setPaymentModal({ lead })
      return
    }

    setMoving(true)
    applyPendingMove(lead, col.id)
    try {
      await api.moveLead(lead.id, col.id, lead.column)
    } catch (e) {
      console.error(e)
    } finally {
      setMoving(false)
    }
  }

  const toggleMenu = (e) => {
    e.stopPropagation()
    setMenuOpen(o => !o)
  }

  // Fecha menu ao clicar fora
  const handleBlur = (e) => {
    if (!menuRef.current?.contains(e.relatedTarget)) setMenuOpen(false)
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(lead))
        e.currentTarget.classList.add('dragging')
        // Marca como "saindo" imediatamente — coluna vai esconder via hiddenIds
        e.currentTarget.style.opacity = '0.3'
        setMenuOpen(false)
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging')
        e.currentTarget.style.opacity = '1'
        if (onDragEnd) onDragEnd(e)
      }}
      onClick={() => setSelectedLead(lead)}
      onTouchEnd={e => { e.preventDefault(); setSelectedLead(lead) }}
      className={`kanban-card group relative rounded-xl p-3 cursor-pointer transition-all duration-200 animate-fade-in select-none
        ${isSelected ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/10' : 'hover:shadow-md hover:-translate-y-0.5'}
      `}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isSelected ? 'transparent' : 'var(--border)'}`,
        minHeight: '88px',
      }}
    >
      {/* Barra lateral */}
      <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ backgroundColor: color }} />

      <div className="pl-2.5">
        {/* Linha 1: avatar + nome + badge unread */}
        <div className="flex items-start justify-between mb-1.5 gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: color + '25', color }}>
              {lead.avatar}
            </div>
            <p className="text-sm font-semibold truncate text-[var(--text-primary)] leading-tight">{lead.name}</p>
          </div>
          {unread > 0 && (
            <div className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-xs font-bold text-white animate-pulse"
              style={{ backgroundColor: '#ef4444', fontSize: '10px', padding: '0 4px' }}>
              {unread > 99 ? '99+' : unread}
            </div>
          )}
        </div>

        {/* Telefone */}
        <div className="flex items-center gap-1 mb-1.5">
          <Phone size={10} className="text-[var(--text-muted)] flex-shrink-0" />
          <span className="text-xs text-[var(--text-muted)] font-mono">{lead.phone}</span>
        </div>

        {/* Última mensagem */}
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-2">
          {lead.lastMessage}
        </p>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs px-1.5 py-0.5 rounded-md font-medium truncate max-w-[50%]"
            style={{ backgroundColor: color + '18', color, fontSize: '10px' }}>
            {lead.product?.split(' ').slice(1).join(' ') || lead.product || '—'}
          </span>

          <div className="flex items-center gap-1">
            {/* Vendedor */}
            {lead.assigneeName && (
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                style={{ backgroundColor: '#2563eb', fontSize: '9px' }}
                title={lead.assigneeName}>
                {lead.assigneeAvatar || lead.assigneeName.slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Botão mover rápido */}
            <div className="relative" ref={menuRef} onBlur={handleBlur}>
              <button
                onClick={toggleMenu}
                title="Mover para..."
                className="md:opacity-0 md:group-hover:opacity-100 flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}
              >
                <ChevronRight size={11} />
              </button>

              {menuOpen && (
                <div
                  className="absolute bottom-full right-0 mb-1 w-44 rounded-xl border border-[var(--border)] shadow-2xl z-50 overflow-hidden animate-slide-up"
                  style={{ backgroundColor: 'var(--bg-card)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Mover para</p>
                  </div>
                  {COLUMNS.filter(c => c.id !== lead.column).map(col => (
                    <button
                      key={col.id}
                      onClick={(e) => handleQuickMove(e, col)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                      <span className="text-xs text-[var(--text-secondary)]">{col.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Etiquetas */}
        {lead.labels?.filter(l => !KANBAN_CARD_LABELS.has(l.toLowerCase())).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {lead.labels.filter(l => !KANBAN_CARD_LABELS.has(l.toLowerCase())).slice(0, 3).map(label => {
              const c = labelColor(label)
              return (
                <span key={label} className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                  style={{ backgroundColor: c + '18', color: c, fontSize: '9px' }}>
                  {label}
                </span>
              )
            })}
          </div>
        )}

        {/* Agendamento */}
        {lead.scheduledAt && (
          <div className="mt-1.5 flex items-center gap-1 text-amber-500">
            <Clock size={10} />
            <span className="text-xs font-medium" style={{ fontSize: '10px' }}>
              {new Date(lead.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {/* Pagamento */}
        {lead.paymentDueDate && (
          <div className="mt-1.5 flex items-center gap-1" style={{ color: '#f97316' }}>
            <span style={{ fontSize: '10px' }}>💰</span>
            <span className="text-xs font-medium" style={{ fontSize: '10px' }}>
              Vence: {new Date(lead.paymentDueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
