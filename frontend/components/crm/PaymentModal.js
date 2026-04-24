'use client'
import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'
import { Calendar, X, Check, DollarSign, FileText } from 'lucide-react'

export default function PaymentModal({ onConfirm }) {
  const { paymentModal, setPaymentModal } = useApp()
  const [date, setDate] = useState('')
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)

  if (!paymentModal) return null
  const { lead } = paymentModal

  const { setSelectedLead, selectedLead } = useApp()

  const handleConfirm = async () => {
    if (!date) return
    setSaving(true)
    try {
      const paymentDueDate = new Date(`${date}T23:59:00`).toISOString()
      await api.setPaymentDue(lead.id, paymentDueDate, observacao)
      const updated = { ...lead, paymentDueDate, observacao, column: 'aguardando_pagamento' }

      // Atualiza lead selecionado se for o mesmo
      if (selectedLead && String(selectedLead.id) === String(lead.id)) {
        setSelectedLead(updated)
      }

      // Eventos globais — funcionam independente de qual tela abriu o modal
      if (typeof window !== 'undefined') {
        // Move o card no Kanban
        window.dispatchEvent(new CustomEvent('tcrm:lead-moved', {
          detail: {
            leadId: String(lead.id),
            fromCol: lead.column || null,
            toCol:   'aguardando_pagamento',
            leadData: updated,
          }
        }))
        // Reload da coluna destino
        window.dispatchEvent(new CustomEvent('tcrm:reload-column', {
          detail: { column: 'aguardando_pagamento' }
        }))
        // Evento para a aba de Pagamentos atualizar
        window.dispatchEvent(new CustomEvent('tcrm:payment-created', {
          detail: { id: String(lead.id), paymentDueDate, observacao, lead: updated }
        }))
      }

      onConfirm && onConfirm(updated)
      setPaymentModal(null)
      setDate(''); setValor(''); setObservacao('')
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = date && new Date(date) < new Date(today)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl animate-slide-up"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Aguardando Pagamento</h3>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{lead.name}</p>
          </div>
          <button onClick={() => setPaymentModal(null)}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar size={12} /> Data de Vencimento
            </label>
            <input type="date" value={date} min={today}
              onChange={e => setDate(e.target.value)} className="input-theme" />
            {isOverdue && (
              <p className="text-xs text-amber-500 mt-1">⚠️ Data no passado — será marcado como atrasado</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <DollarSign size={12} /> Valor (opcional)
            </label>
            <input type="text" value={valor} onChange={e => setValor(e.target.value)}
              placeholder="Ex: R$ 180,00" className="input-theme" />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <FileText size={12} /> Observação
            </label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: Boleto enviado por WhatsApp, aguardando confirmação..."
              rows={2} className="input-theme resize-none" />
          </div>

          {date && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm animate-fade-in"
              style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#fb923c' }}>
              <Check size={14} />
              <span>Vence em {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long'
              })}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 pb-5">
          <button onClick={() => setPaymentModal(null)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={!date || saving}
            className="flex-1 btn-primary justify-center py-2.5 rounded-xl disabled:opacity-40"
            style={date ? { backgroundColor: '#f97316' } : {}}>
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
