'use client'
import { useState, useEffect } from 'react'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'
import { Calendar, Clock, X, Check, FileText, Trash2 } from 'lucide-react'

export default function ScheduleModal({ onConfirm }) {
  const { scheduleModal, setScheduleModal, selectedLead, setSelectedLead, applyPendingMove } = useApp()
  const [date, setDate]           = useState('')
  const [time, setTime]           = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving]       = useState(false)
  const [canceling, setCanceling] = useState(false)

  const lead = scheduleModal?.lead

  // Pre-fill se lead já tem agendamento (modo edição)
  useEffect(() => {
    if (!lead) { setDate(''); setTime(''); setObservacao(''); return }
    if (lead.scheduledAt) {
      const d = new Date(lead.scheduledAt)
      setDate(d.toISOString().split('T')[0])
      setTime(d.toTimeString().slice(0, 5))
    } else {
      setDate(''); setTime('')
    }
    setObservacao(lead.observacao || '')
  }, [lead?.id, lead?.scheduledAt])

  if (!scheduleModal) return null

  const isEditing = !!lead?.scheduledAt

  const handleConfirm = async () => {
    if (!date || !time) return
    setSaving(true)
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
      await api.scheduleLead(lead.id, scheduledAt, observacao)
      const updated = { ...lead, scheduledAt, observacao, column: 'agendado' }

      if (selectedLead && String(selectedLead.id) === String(lead.id)) {
        setSelectedLead(updated)
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
          detail: { leadId: String(lead.id), fromCol: lead.column || null, toCol: 'agendado', leadData: updated }
        }))
        window.dispatchEvent(new CustomEvent('tcrm:schedule-created', {
          detail: { id: String(lead.id), scheduledAt, observacao, lead: updated }
        }))
        window.dispatchEvent(new CustomEvent('tcrm:reload-column', {
          detail: { column: 'agendado' }
        }))
      }

      onConfirm && onConfirm(updated)
      setScheduleModal(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm(`Cancelar agendamento de ${lead.name}?`)) return
    setCanceling(true)
    try {
      // Move de volta para negociação
      await api.moveLead(lead.id, 'negociacao', 'agendado')
      const updated = { ...lead, scheduledAt: null, observacao: '', column: 'negociacao' }

      if (selectedLead && String(selectedLead.id) === String(lead.id)) {
        setSelectedLead(updated)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
          detail: { leadId: String(lead.id), fromCol: 'agendado', toCol: 'negociacao', leadData: updated }
        }))
        window.dispatchEvent(new CustomEvent('tcrm:reload-column', {
          detail: { column: 'agendado' }
        }))
      }
      setScheduleModal(null)
    } catch (err) {
      console.error(err)
    } finally {
      setCanceling(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl animate-slide-up"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">
              {isEditing ? 'Editar Agendamento' : 'Agendar Contato'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{lead.name}</p>
          </div>
          <button onClick={() => setScheduleModal(null)}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar size={12} /> Data
            </label>
            <input type="date" value={date} min={today}
              onChange={e => setDate(e.target.value)} className="input-theme" />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Clock size={12} /> Horário
            </label>
            <input type="time" value={time}
              onChange={e => setTime(e.target.value)} className="input-theme" />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={12} /> Observação
            </label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: Ligar para apresentar proposta..."
              rows={2} className="input-theme resize-none" />
          </div>

          {date && time && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm animate-fade-in"
              style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
              <Check size={14} />
              <span>{new Date(`${date}T${time}`).toLocaleString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
              })}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 pb-5">
          {isEditing && (
            <button onClick={handleCancel} disabled={canceling}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              <Trash2 size={13} />
              {canceling ? '...' : 'Cancelar'}
            </button>
          )}
          <button onClick={() => setScheduleModal(null)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors">
            Fechar
          </button>
          <button onClick={handleConfirm} disabled={!date || !time || saving}
            className="flex-1 btn-primary justify-center py-2.5 rounded-xl disabled:opacity-40">
            {saving ? 'Salvando...' : isEditing ? 'Atualizar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
