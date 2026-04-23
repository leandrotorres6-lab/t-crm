'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { showNotification, playSound } from '../../lib/notifications'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'
import { Bell, Phone, MessageCircle, X, ChevronRight, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function NotificationAlarm() {
  const [alarms, setAlarms] = useState([])
  const [current, setCurrent] = useState(null)
  const { setSelectedLead } = useApp()
  const router = useRouter()
  const shownRef = useRef(new Set())
  const leadsRef = useRef([])
  const checkRef = useRef(null)

  // Carrega agendados do backend a cada 3 min
  const loadAgendados = useCallback(async () => {
    try {
      const data = await api.getAgendamentos()
      leadsRef.current = Array.isArray(data) ? data : []
    } catch {}
  }, [])

  const checkAlarms = useCallback(() => {
    const now = new Date()
    // Janela: até 5min antes e 30min depois do horário (não perde se estava com aba fechada)
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 30 * 1000)

    // IDs já mostrados nesta sessão
    let shown = new Set()
    try {
      const saved = JSON.parse(localStorage.getItem('tcrm_shown_alarms') || '[]')
      shown = new Set(saved)
    } catch {}

    const due = leadsRef.current.filter(lead => {
      if (!lead.scheduledAt) return false
      const key = `${lead.id}_${lead.scheduledAt}`
      if (shown.has(key) || shownRef.current.has(key)) return false
      const t = new Date(lead.scheduledAt)
      return t >= windowStart && t <= windowEnd
    })

    if (due.length > 0) {
      due.forEach(lead => {
        const key = `${lead.id}_${lead.scheduledAt}`
        shownRef.current.add(key)
        shown.add(key)
      })
      try {
        localStorage.setItem('tcrm_shown_alarms', JSON.stringify(Array.from(shown).slice(-200)))
      } catch {}

      setAlarms(prev => [...prev, ...due])

      // Som + notificação do sistema para cada alarme
      playSound('alarm')
      due.forEach(lead => {
        showNotification(`🔔 Contato agora: ${lead.name}`, lead.observacao || `Tel: ${lead.phone}`, {
          requireInteraction: true,
          tag: `alarm-${lead.id}`,
        })
      })
    }
  }, [])

  useEffect(() => {
    loadAgendados()

    // Verifica a cada 15 segundos (janela de 30s garante que não perde)
    checkRef.current = setInterval(checkAlarms, 15 * 1000)
    // Recarrega lista a cada 3 min
    const loadInterval = setInterval(loadAgendados, 3 * 60 * 1000)
    checkAlarms() // verifica imediatamente ao abrir

    return () => {
      clearInterval(checkRef.current)
      clearInterval(loadInterval)
    }
  }, [loadAgendados, checkAlarms])

  // Mostra próximo alarme da fila
  useEffect(() => {
    if (!current && alarms.length > 0) {
      setCurrent(alarms[0])
      setAlarms(prev => prev.slice(1))
    }
  }, [alarms, current])

  const dismiss = () => setCurrent(null)

  const openConversation = () => {
    setSelectedLead(current)
    router.push('/crm')
    setCurrent(null)
  }

  if (!current) return null

  const scheduled = new Date(current.scheduledAt)
  const timeStr = scheduled.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = scheduled.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  const isLate = scheduled < new Date()

  return (
    <div className="fixed bottom-5 right-5 z-[200] w-80 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
      style={{ backgroundColor: 'var(--bg-card)', border: '2px solid #f59e0b' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-amber-400 animate-bounce" />
          <span className="text-sm font-bold text-amber-400">
            {isLate ? 'Contato Atrasado!' : 'Hora do Contato!'}
          </span>
        </div>
        <button onClick={dismiss}
          className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Lead info */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold flex-shrink-0">
            {current.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{current.name}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Phone size={11} className="text-[var(--text-muted)]" />
              <p className="text-xs text-[var(--text-muted)] font-mono">{current.phone}</p>
            </div>
          </div>
        </div>

        {/* Horário */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2"
          style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}>
          <Clock size={13} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-400">
            {dateStr} às {timeStr}
            {isLate && <span className="ml-1 text-red-400">(atrasado)</span>}
          </span>
        </div>

        {/* Observação */}
        {current.observacao && (
          <div className="px-3 py-2 rounded-xl mb-3" style={{ backgroundColor: 'var(--bg-hover)' }}>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">📝 {current.observacao}</p>
          </div>
        )}

        {/* Produto */}
        {current.product && (
          <p className="text-xs text-[var(--text-muted)] mb-3">{current.product}</p>
        )}

        {/* Botões */}
        <div className="flex gap-2">
          <button onClick={dismiss}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors">
            Dispensar
          </button>
          <button onClick={openConversation}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ backgroundColor: '#f59e0b', color: 'white' }}>
            <MessageCircle size={12} /> Abrir
            <ChevronRight size={11} />
          </button>
        </div>
      </div>

      {alarms.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] text-center">
            +{alarms.length} na fila
          </p>
        </div>
      )}
    </div>
  )
}
