'use client'
import { useEffect, useState } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'
import { Calendar, Clock, MessageCircle, Bell, ChevronRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

function AgendamentoCard({ lead, onAlert }) {
  const { setSelectedLead } = useApp()
  const router = useRouter()
  const scheduled = lead.scheduledAt ? new Date(lead.scheduledAt) : null
  const now = new Date()
  const isPast = scheduled && scheduled < now
  const isToday = scheduled && scheduled.toDateString() === now.toDateString()
  const isSoon = scheduled && (scheduled - now) < 3600000 && !isPast

  const openChat = () => {
    setSelectedLead(lead)
    router.push('/crm')
  }

  return (
    <div
      className="rounded-2xl p-4 transition-all duration-200 animate-fade-in"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isSoon ? '#f59e0b' : isPast ? '#ef4444' : 'var(--border)'}`,
        boxShadow: isSoon ? '0 0 0 1px rgba(245,158,11,0.2)' : 'none',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {lead.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{lead.name}</p>
            {isSoon && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium animate-pulse"
                style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                <Bell size={10} />
                Em breve!
              </span>
            )}
            {isPast && !isSoon && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                Atrasado
              </span>
            )}
            {isToday && !isSoon && !isPast && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                Hoje
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">{lead.product}</p>
          {scheduled && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Calendar size={13} style={{ color: '#3b82f6' }} />
                <span className="font-medium">{scheduled.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Clock size={13} style={{ color: '#8b5cf6' }} />
                <span className="font-mono font-medium">{scheduled.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={openChat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-shrink-0"
          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}
        >
          <MessageCircle size={13} />
          Abrir
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}

export default function AgendamentoPage() {
  const [agendados, setAgendados] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')

  useEffect(() => {
    // Escuta agendamentos criados em tempo real
    const handler = (e) => {
      const { lead, scheduledAt, id } = e.detail || {}
      if (!lead && !scheduledAt) return
      setAll(prev => {
        const exists = prev.find(l => String(l.id) === String(id))
        const entry = lead ? { ...lead, scheduledAt } : { id, scheduledAt }
        if (exists) return prev.map(l => String(l.id) === String(id) ? { ...l, scheduledAt } : l)
        return [entry, ...prev]
      })
    }
    window.addEventListener('tcrm:schedule-created', handler)
    return () => window.removeEventListener('tcrm:schedule-created', handler)
  }, [])

  useEffect(() => {
    api.getColumnLeads('agendado', 1).then(data => {
      setAgendados(data.items || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const filtered = agendados.filter(l => {
    if (!l.scheduledAt) return filter === 'todos'
    const d = new Date(l.scheduledAt)
    if (filter === 'hoje') return d.toDateString() === now.toDateString()
    if (filter === 'semana') {
      const diff = d - now
      return diff >= 0 && diff < 7 * 86400000
    }
    if (filter === 'atrasados') return d < now
    return true
  })

  const grouped = filtered.reduce((acc, l) => {
    if (!l.scheduledAt) { (acc['Sem data'] = acc['Sem data'] || []).push(l); return acc }
    const d = new Date(l.scheduledAt)
    const key = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    ;(acc[key] = acc[key] || []).push(l)
    return acc
  }, {})

  return (
    <MainLayout>
      <div className="h-full page-enter flex flex-col">
        <div className="px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Agendamentos</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">{agendados.length} agendados</p>
            </div>
          </div>
          <div className="flex gap-2">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'hoje', label: 'Hoje' },
              { id: 'semana', label: 'Esta semana' },
              { id: 'atrasados', label: 'Atrasados' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === f.id ? 'text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                }`}
                style={filter === f.id ? { backgroundColor: '#2563eb' } : {}}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <Calendar size={24} className="text-[var(--text-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Nenhum agendamento</p>
              <p className="text-xs text-[var(--text-muted)]">Mova um lead para "Agendado" no CRM</p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, items]) => (
              <div key={date} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={14} className="text-[var(--text-muted)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider capitalize">{date}</h3>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
                  <span className="text-xs text-[var(--text-muted)]">{items.length}</span>
                </div>
                <div className="space-y-2 max-w-2xl">
                  {items.map(l => <AgendamentoCard key={l.id} lead={l} />)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  )
}
