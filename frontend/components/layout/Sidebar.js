'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { LogOut } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import {
  LayoutDashboard, KanbanSquare, Calendar, Users, MessageCircle, Menu, X,
  Sun, Moon, Circle, Wifi, WifiOff, ChevronDown, DollarSign
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { usePush } from '../../lib/usePush'
import { api } from '../../lib/api'

const NAV = [
  { href: '/crm', icon: KanbanSquare, label: 'CRM', badgeKey: 'unread' },
  { href: '/conversas', icon: MessageCircle, label: 'Conversas', badgeKey: 'unread' },
  { href: '/contatos', icon: Users, label: 'Contatos' },
  { href: '/agendamento', icon: Calendar, label: 'Agendamento', badgeKey: 'agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pagamentos', badgeKey: 'pagamento' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
]

const STATUS_COLORS = { online: '#10b981', ocupado: '#f59e0b', offline: '#6b7280' }
const STATUS_LABELS = { online: 'Online', ocupado: 'Ocupado', offline: 'Offline' }

export default function Sidebar({ mobileOverlay = false }) {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen, currentAgent, logout, unreadCounts } = useApp()
  const currentUser = currentAgent || { name: '...', email: '', avatar: '?', status: 'online' }
  const { theme, toggleTheme } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [globalBadges, setGlobalBadges] = useState({ unread: 0, agendamento: 0, pagamento: 0 })

  const BADGE_COLORS = {
    unread:     { bg: '#ef4444', shadow: 'rgba(239,68,68,0.4)' },      // vermelho — mensagens
    agendamento:{ bg: '#f59e0b', shadow: 'rgba(245,158,11,0.4)' },    // âmbar — agenda
    pagamento:  { bg: '#f97316', shadow: 'rgba(249,115,22,0.4)' },    // laranja — pagamentos
  }

  // Computa badges globais
  useEffect(() => {
    const unread = Object.values(unreadCounts || {}).reduce((s, v) => s + (v || 0), 0)
    setGlobalBadges(prev => ({ ...prev, unread }))
  }, [unreadCounts])

  // Conta agendamentos e pagamentos do dia (a cada 5min)
  useEffect(() => {
    const computeBadges = async () => {
      try {
        const [schedResp, payResp] = await Promise.all([
          api.getScheduled(currentAgent?.id, currentAgent?.role),
          api.getPayments(),
        ])
        const today = new Date().toDateString()
        const now = new Date()

        // getScheduled retorna array direto ou { agendamentos: [] }
        const sched = Array.isArray(schedResp) ? schedResp : (schedResp?.agendamentos || schedResp?.leads || [])
        const agendamento = sched.filter(l => {
          if (!l.scheduledAt) return false
          const d = new Date(l.scheduledAt)
          return d.toDateString() === today
        }).length

        // getPayments retorna array direto ou { pagamentos: [] }
        const pay = Array.isArray(payResp) ? payResp : (payResp?.pagamentos || payResp?.leads || [])
        const pagamento = pay.filter(l => {
          if (!l.paymentDueDate) return false
          const d = new Date(l.paymentDueDate)
          return d.toDateString() === today || d < now
        }).length

        setGlobalBadges(prev => ({ ...prev, agendamento, pagamento }))
      } catch (e) {
        console.warn('[Badges]', e.message)
      }
    }
    computeBadges()
    const iv = setInterval(computeBadges, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [currentAgent?.id])
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)
  const { supported, permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePush(currentAgent?.id)

  // Fecha sidebar mobile ao clicar fora
  useEffect(() => {
    if (!mobileOverlay || !sidebarOpen) return
    const handler = (e) => {
      // Se clicou fora da sidebar, fecha
      if (e.target.closest('[data-sidebar]')) return
      setSidebarOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [mobileOverlay, sidebarOpen])

  // Pede permissão de notificação browser ao abrir
  useEffect(() => {
    if (!currentAgent) return
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      setTimeout(() => Notification.requestPermission(), 2000)
    }
  }, [currentAgent?.id])

  // Carrega avatar do agente
  useEffect(() => {
    if (!currentAgent?.id) return
    // Tenta localStorage primeiro (instantâneo)
    const cached = localStorage.getItem(`tcrm_avatar_${currentAgent.id}`)
    if (cached) setAvatarUrl(cached)
    // Confirma com backend
    api.getAgentAvatar(currentAgent.id)
      .then(d => {
        if (d.url) {
          const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/api$/, '')
          const full = d.url.startsWith('http') ? d.url : backendUrl + d.url
          setAvatarUrl(full)
          localStorage.setItem(`tcrm_avatar_${currentAgent.id}`, full)
        }
      })
      .catch(() => {})
  }, [currentAgent?.id])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !currentAgent?.id) return
    setUploadingAvatar(true)
    try {
      const data = await api.uploadAvatar(currentAgent.id, file)
      if (data.url) {
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/api$/, '')
        setAvatarUrl(backendUrl + data.url)
        // Salva no localStorage para persistir
        localStorage.setItem(`tcrm_avatar_${currentAgent.id}`, backendUrl + data.url)
      }
    } catch (err) { console.error('Avatar upload:', err) }
    finally { setUploadingAvatar(false) }
  }

  const width = sidebarOpen ? 'w-60' : 'w-16'
  // Mobile overlay: posição fixa, fecha ao clicar fora
  const mobileClass = mobileOverlay
    ? sidebarOpen
      ? 'fixed top-0 left-0 bottom-0 z-50'
      : 'fixed top-0 left-0 bottom-0 z-50 -translate-x-full'
    : ''

  return (
    <>
      {/* Backdrop mobile — fecha ao clicar fora */}
      {mobileOverlay && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        data-sidebar
        className={`${mobileOverlay ? 'w-60' : width} ${mobileClass} flex-shrink-0 flex flex-col h-full transition-all duration-300`}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 h-16 border-b border-white/5">
        {sidebarOpen && (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">T</span>
            </div>
            <span className="text-white font-bold text-base tracking-tight">T-CRM</span>
          </div>
        )}
        {!sidebarOpen && (
          <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center mx-auto">
            <span className="text-white text-xs font-bold">T</span>
          </div>
        )}
        {sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Hamburger when closed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="mx-auto mt-3 p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label, badgeKey }) => {
          const active = pathname === href || (href === '/crm' && pathname.startsWith('/crm'))
          return (
            <Link
              key={href}
              href={href}
              title={!sidebarOpen ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                ${active
                  ? 'text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }
              `}
              style={active ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' } : {}}
            >
              {/* Ícone com badge no canto (sidebar fechada) */}
              <div className="relative flex-shrink-0">
                <Icon size={18} />
                {badgeKey && !sidebarOpen && globalBadges[badgeKey] > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] rounded-full text-white flex items-center justify-center font-bold animate-pulse"
                    style={{
                      fontSize: '9px',
                      padding: '0 3px',
                      backgroundColor: BADGE_COLORS[badgeKey]?.bg || '#ef4444',
                      boxShadow: `0 0 6px ${BADGE_COLORS[badgeKey]?.shadow || 'rgba(239,68,68,0.4)'}`,
                    }}>
                    {globalBadges[badgeKey] > 99 ? '99+' : globalBadges[badgeKey]}
                  </span>
                )}
              </div>

              {/* Label (sidebar aberta) */}
              {sidebarOpen && (
                <span className="text-sm font-medium animate-fade-in truncate flex-1">{label}</span>
              )}

              {/* Badge inline (sidebar aberta) */}
              {sidebarOpen && badgeKey && globalBadges[badgeKey] > 0 && (
                <span
                  className="ml-auto flex-shrink-0 min-w-[20px] h-5 rounded-full text-white text-xs flex items-center justify-center font-bold px-1.5"
                  style={{
                    backgroundColor: BADGE_COLORS[badgeKey]?.bg || '#ef4444',
                    boxShadow: `0 0 8px ${BADGE_COLORS[badgeKey]?.shadow || 'rgba(239,68,68,0.4)'}`,
                    fontSize: '11px',
                  }}>
                  {globalBadges[badgeKey] > 99 ? '99+' : globalBadges[badgeKey]}
                </span>
              )}

              {/* Ponto ativo (sem conflito com badge) */}
              {active && sidebarOpen && !badgeKey && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/5 space-y-1">
        {/* Push notifications toggle */}
        {supported && permission !== 'denied' && (
          <button
            onClick={subscribed ? unsubscribe : subscribe}
            disabled={pushLoading}
            title={!sidebarOpen ? (subscribed ? 'Notificações ativas' : 'Ativar notificações') : undefined}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-all disabled:opacity-50"
            style={{ color: subscribed ? '#10b981' : '#64748b' }}
          >
            <div className="relative flex-shrink-0">
              {subscribed
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{opacity:0.4}}><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
              }
              {subscribed && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />}
            </div>
            {sidebarOpen && (
              <span className="text-sm animate-fade-in">
                {pushLoading ? '...' : subscribed ? 'Notificações ativas' : 'Ativar notificações'}
              </span>
            )}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={!sidebarOpen ? (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro') : undefined}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          {sidebarOpen && <span className="text-sm animate-fade-in">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </button>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => sidebarOpen && setUserMenuOpen(o => !o)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all"
          >
            {/* Avatar — clicável para trocar foto */}
            <div className="relative flex-shrink-0 group cursor-pointer"
              onClick={() => sidebarOpen && fileInputRef.current?.click()}
              title={sidebarOpen ? 'Clique para trocar sua foto' : currentUser.name}>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              {(avatarUrl || currentUser.avatarUrl) ? (
                <img src={avatarUrl || currentUser.avatarUrl} alt={currentUser.name}
                  className="w-8 h-8 rounded-xl object-cover"
                  onError={() => setAvatarUrl(null)} />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{currentUser.avatar}</span>
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {sidebarOpen && !uploadingAvatar && (
                <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <svg className="opacity-0 group-hover:opacity-100 transition-opacity" width="12" height="12" viewBox="0 0 24 24" fill="white">
                    <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                  </svg>
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900"
                style={{ backgroundColor: STATUS_COLORS[currentUser.status || 'online'] }} />
            </div>
            {sidebarOpen && (
              <div className="flex-1 text-left animate-fade-in overflow-hidden">
                <p className="text-xs font-semibold text-slate-300 truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-600 truncate">{currentUser.email}</p>
              </div>
            )}
            {sidebarOpen && <ChevronDown size={14} className="text-slate-600 flex-shrink-0" />}
          </button>

          {userMenuOpen && sidebarOpen && (
            <div
              className="absolute bottom-full left-0 w-full mb-1 rounded-xl border border-white/10 overflow-hidden shadow-xl z-50 animate-slide-up"
              style={{ backgroundColor: '#0a1628' }}
            >
              <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-slate-300 truncate">{currentUser.name}</p>
                  <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                  <p className="text-xs text-slate-600 capitalize mt-0.5">{currentUser.role}</p>
                </div>
              <div className="px-3 py-2 border-t border-white/5">
                <button onClick={() => { logout(); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2 py-1.5 text-red-400 hover:text-red-300 transition-colors">
                  <LogOut size={12} />
                  <span className="text-xs">Sair</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
    </>
  )
}