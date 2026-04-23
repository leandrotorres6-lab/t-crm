'use client'
import { useEffect, useState, useCallback } from 'react'
import { showNotification, playSound } from '../../lib/notifications'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'
import {
  Calendar, Clock, DollarSign, Loader2, MessageCircle, ChevronRight,
  Edit2, Check, X, RefreshCw, AlertTriangle, Phone
} from 'lucide-react'
import { useRouter } from 'next/navigation'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = d - new Date()
  const days = Math.ceil(diff / 86400000)
  if (days < -1) return `${Math.abs(days)} dias atrás`
  if (days === -1) return 'Ontem'
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  if (days < 7) return `Em ${days} dias`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function statusInfo(dateStr) {
  if (!dateStr) return { label: 'Sem data', color: '#6b7280', urgent: false }
  const d = new Date(dateStr)
  const now = new Date()
  const diff = d - now
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return { label: `Atrasado ${Math.abs(days)}d`, color: '#ef4444', urgent: true }
  if (days === 0) return { label: 'Vence hoje!', color: '#f59e0b', urgent: true }
  if (days === 1) return { label: 'Vence amanhã', color: '#f97316', urgent: true }
  if (days <= 3) return { label: `Vence em ${days}d`, color: '#f97316', urgent: false }
  return { label: timeAgo(dateStr), color: '#10b981', urgent: false }
}

function EditDateModal({ lead, onSave, onClose }) {
  const [date, setDate] = useState(lead.paymentDueDate ? new Date(lead.paymentDueDate).toISOString().split('T')[0] : '')
  const [observacao, setObservacao] = useState(lead.observacao || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!date) return
    setSaving(true)
    try {
      const paymentDueDate = new Date(`${date}T23:59:00`).toISOString()
      await api.setPaymentDue(lead.id, paymentDueDate, observacao)
      onSave({ ...lead, paymentDueDate, observacao })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl animate-slide-up"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--text-primary)]">Alterar Vencimento</h3>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{lead.name}</p>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Calendar size={12} /> Nova data de vencimento
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-theme" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
              Observação
            </label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Motivo da prorrogação, acordo, etc..."
              rows={2} className="input-theme resize-none" />
          </div>
          {date && (
            <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#fb923c' }}>
              Novo vencimento: {new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
            Cancelar
          </button>
          <button onClick={save} disabled={!date || saving}
            className="flex-1 btn-primary justify-center py-2.5 rounded-xl disabled:opacity-40"
            style={date ? { backgroundColor: '#f97316' } : {}}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AguardandoPagamentoPage() {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editingLead, setEditingLead] = useState(null)
  const { setSelectedLead } = useApp()
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getPagamentos()
      const list = Array.isArray(data) ? data : []
      setAll(list)
      // Notifica pagamentos que vencem hoje
      const today = new Date()
      today.setHours(0,0,0,0)
      const endToday = new Date(today.getTime() + 86400000)
      const dueToday = list.filter(l => {
        if (!l.paymentDueDate) return false
        const d = new Date(l.paymentDueDate)
        return d >= today && d < endToday
      })
      if (dueToday.length > 0) {
        playSound('alarm')
        showNotification(
          `💰 ${dueToday.length} pagamento${dueToday.length > 1 ? 's' : ''} vence${dueToday.length > 1 ? 'm' : ''} hoje`,
          dueToday.map(l => l.name).slice(0, 3).join(', '),
          { tag: 'payment-due-today', requireInteraction: false }
        )
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [])

  const filtered = all.filter(lead => {
    // Backend já garante que todos têm paymentDueDate — mas por segurança
    if (!lead.paymentDueDate) return false
    if (filter === 'todos') return true
    const d = new Date(lead.paymentDueDate)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endToday = new Date(today.getTime() + 86400000)
    const endWeek = new Date(today.getTime() + 7 * 86400000)
    const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())
    if (filter === 'atrasados') return d < today
    if (filter === 'hoje') return d >= today && d < endToday
    if (filter === 'semana') return d >= today && d < endWeek
    if (filter === 'mes') return d >= today && d < endMonth
    if (filter === 'custom') {
      if (dateFrom && d < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    }
    return true
  })

  // Ordena: atrasados primeiro, depois por data
  const sorted = [...filtered].sort((a, b) => {
    if (!a.paymentDueDate) return 1
    if (!b.paymentDueDate) return -1
    return new Date(a.paymentDueDate) - new Date(b.paymentDueDate)
  })

  const openConversation = (lead) => {
    setSelectedLead(lead)
    router.push('/crm')
  }

  const handleEditSave = (updated) => {
    setAll(prev => prev.map(l => l.id === updated.id ? updated : l))
    setEditingLead(null)
  }

  const counts = {
    todos: all.length,
    atrasados: all.filter(l => l.paymentDueDate && new Date(l.paymentDueDate) < new Date()).length,
    hoje: all.filter(l => {
      if (!l.paymentDueDate) return false
      const d = new Date(l.paymentDueDate)
      const t = new Date(); t.setHours(0,0,0,0)
      const e = new Date(t.getTime() + 86400000)
      return d >= t && d < e
    }).length,
    semana: all.filter(l => {
      if (!l.paymentDueDate) return false
      const d = new Date(l.paymentDueDate)
      const t = new Date(); t.setHours(0,0,0,0)
      return d >= t && d < new Date(t.getTime() + 7*86400000)
    }).length,
    mes: all.filter(l => {
      if (!l.paymentDueDate) return false
      const d = new Date(l.paymentDueDate)
      const t = new Date(); t.setHours(0,0,0,0)
      const n = new Date()
      return d >= t && d < new Date(n.getFullYear(), n.getMonth()+1, n.getDate())
    }).length,
  }

  return (
    <MainLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Aguardando Pagamento</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">{all.length} leads nesta etapa</p>
            </div>
            <button onClick={load} className="btn-ghost">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Filtros rápidos + calendário */}
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'todos', label: 'Todos', color: '#3b82f6' },
                { id: 'atrasados', label: '⚠️ Atrasados', color: '#ef4444' },
                { id: 'hoje', label: 'Hoje', color: '#f59e0b' },
                { id: 'semana', label: 'Semana', color: '#f97316' },
                { id: 'mes', label: 'Mês', color: '#8b5cf6' },
                { id: 'custom', label: '📅 Período', color: '#06b6d4' },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={filter === f.id
                    ? { backgroundColor: f.color, color: 'white' }
                    : { color: 'var(--text-muted)' }}>
                  {f.label}
                  {f.id !== 'custom' && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                      style={filter === f.id
                        ? { backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }
                        : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                      {counts[f.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Seletor de período personalizado */}
            {filter === 'custom' && (
              <div className="flex items-center gap-3 p-3 rounded-xl animate-fade-in"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs text-[var(--text-muted)] flex-shrink-0">De</label>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="input-theme text-sm flex-1" style={{ maxWidth: '160px' }} />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs text-[var(--text-muted)] flex-shrink-0">Até</label>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="input-theme text-sm flex-1" style={{ maxWidth: '160px' }} />
                </div>
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors px-2">
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(249,115,22,0.1)' }}>
                <DollarSign size={24} className="text-orange-400" />
              </div>
              <p className="text-sm text-[var(--text-secondary)] font-semibold">Nenhum registro encontrado</p>
              <p className="text-xs text-[var(--text-muted)]">Arraste leads para "Aguardando Pagamento" no CRM</p>
            </div>
          ) : (
            <div className="max-w-2xl space-y-3">
              {sorted.map(lead => {
                const status = statusInfo(lead.paymentDueDate)
                return (
                  <div key={lead.id}
                    className="rounded-2xl p-4 transition-all animate-fade-in"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: `1px solid ${status.urgent ? status.color + '40' : 'var(--border)'}`,
                      boxShadow: status.urgent ? `0 0 0 1px ${status.color}20` : 'none',
                    }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                        {lead.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{lead.name}</p>
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                            style={{ backgroundColor: status.color + '18', color: status.color }}>
                            {status.urgent && <AlertTriangle size={10} />}
                            {status.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 mb-1.5">
                          <Phone size={10} className="text-[var(--text-muted)]" />
                          <p className="text-xs text-[var(--text-muted)] font-mono">{lead.phone}</p>
                        </div>

                        {lead.paymentDueDate && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Calendar size={11} style={{ color: status.color }} />
                            <span className="text-xs font-medium" style={{ color: status.color }}>
                              Vence: {new Date(lead.paymentDueDate).toLocaleDateString('pt-BR', {
                                weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                              })}
                            </span>
                          </div>
                        )}

                        {lead.observacao && (
                          <p className="text-xs text-[var(--text-secondary)] mb-2">
                            📝 {lead.observacao}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-[var(--text-muted)] flex-1">{lead.product}</span>
                          <button onClick={() => setEditingLead(lead)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                            style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#fb923c' }}>
                            <Edit2 size={11} /> Alterar data
                          </button>
                          <button onClick={() => openConversation(lead)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
                            style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                            <MessageCircle size={11} /> Conversar
                            <ChevronRight size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de edição de data */}
      {editingLead && (
        <EditDateModal
          lead={editingLead}
          onSave={handleEditSave}
          onClose={() => setEditingLead(null)}
        />
      )}
    </MainLayout>
  )
}
