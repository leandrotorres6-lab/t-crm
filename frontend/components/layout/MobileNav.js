'use client'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { useTheme } from '../../contexts/ThemeContext'
import { api } from '../../lib/api'
import { usePush } from '../../lib/usePush'
import {
  KanbanSquare, MessageCircle, Calendar, DollarSign, Menu,
  X, Sun, Moon, LogOut, LayoutDashboard, Users
} from 'lucide-react'

const BOTTOM_TABS = [
  { href: '/crm',                  icon: KanbanSquare,   label: 'CRM',       badgeKey: 'unread'      },
  { href: '/conversas',            icon: MessageCircle,  label: 'Conversas', badgeKey: 'unread'      },
  { href: '/agendamento',          icon: Calendar,       label: 'Agenda',    badgeKey: 'agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign,     label: 'Pgtos',     badgeKey: 'pagamento'   },
  { href: '#menu',                 icon: Menu,           label: 'Menu',      badgeKey: null          },
]

const DRAWER_NAV = [
  { href: '/crm',                  icon: KanbanSquare,    label: 'CRM'          },
  { href: '/conversas',            icon: MessageCircle,   label: 'Conversas'    },
  { href: '/contatos',             icon: Users,           label: 'Contatos'     },
  { href: '/agendamento',          icon: Calendar,        label: 'Agendamento'  },
  { href: '/aguardando-pagamento', icon: DollarSign,      label: 'Pagamentos'   },
  { href: '/dashboard',            icon: LayoutDashboard, label: 'Dashboard'    },
]

const BADGE_BG = { unread: '#ef4444', agendamento: '#f59e0b', pagamento: '#f97316' }

export default function MobileNav() {
  const pathname  = usePathname()
  const router    = useRouter()
  const { currentAgent, logout, setSelectedLead, unreadCounts } = useApp()
  const { theme, toggleTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [badges, setBadges]         = useState({ unread: 0, agendamento: 0, pagamento: 0 })
  const { supported, permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePush(currentAgent?.id)
  const drawerRef = useRef(null)

  const isDark = theme === 'dark'

  // ── Variáveis de tema ────────────────────────────────────────────────────────
  const T = {
    drawerBg:     isDark ? '#0c1525'  : '#ffffff',
    drawerBorder: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0',
    drawerShadow: isDark ? '-4px 0 32px rgba(0,0,0,0.6)' : '-4px 0 32px rgba(0,0,0,0.12)',
    titleColor:   isDark ? '#f1f5f9'  : '#0f172a',
    closeBtn:     isDark ? '#64748b'  : '#94a3b8',
    navText:      isDark ? 'rgba(255,255,255,0.65)' : '#374151',
    navHoverBg:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    divider:      isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
    themeText:    isDark ? '#94a3b8'  : '#374151',
    themeIcon:    isDark ? '#f59e0b'  : '#6366f1',
    agentCardBg:  isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    agentName:    isDark ? 'rgba(255,255,255,0.85)' : '#0f172a',
    tabBg:        isDark ? '#0c1525'  : '#ffffff',
    tabBorder:    isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0',
    tabInactive:  isDark ? 'rgba(255,255,255,0.38)' : '#94a3b8',
    tabActive:    '#3b82f6',
  }

  // ── Badges ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unread = Object.values(unreadCounts || {}).reduce((s, v) => s + (v || 0), 0)
    setBadges(prev => ({ ...prev, unread }))
  }, [unreadCounts])

  useEffect(() => {
    if (!currentAgent?.id) return
    const compute = async () => {
      try {
        const [schedResp, payResp] = await Promise.all([
          api.getScheduled(currentAgent.id, currentAgent.role),
          api.getPagamentos(),
        ])
        const today = new Date().toDateString()
        const sched = Array.isArray(schedResp) ? schedResp : []
        const pay   = Array.isArray(payResp)   ? payResp   : []
        setBadges(prev => ({
          ...prev,
          agendamento: sched.filter(l => l.scheduledAt &&
            new Date(l.scheduledAt).toDateString() === today).length,
          pagamento: pay.filter(l => {
            if (!l.paymentDueDate) return false
            const d = new Date(l.paymentDueDate)
            return d.toDateString() === today || d < new Date()
          }).length,
        }))
      } catch {}
    }
    // Computa ao montar e quando volta ao foco (economiza chamadas desnecessárias)
    compute()
    const onFocus = () => compute()
    window.addEventListener('focus', onFocus)
    const iv = setInterval(compute, 10 * 60 * 1000)  // 10min em vez de 5min
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus) }
  }, [currentAgent?.id, currentAgent?.role])

  // ── Fecha drawer ao clicar fora ──────────────────────────────────────────────
  useEffect(() => {
    if (!drawerOpen) return
    const fn = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawerOpen(false) }
    document.addEventListener('mousedown',  fn)
    document.addEventListener('touchstart', fn)
    return () => { document.removeEventListener('mousedown', fn); document.removeEventListener('touchstart', fn) }
  }, [drawerOpen])

  const handleTab = (href) => {
    if (href === '#menu') { setDrawerOpen(o => !o); return }
    setSelectedLead(null); setDrawerOpen(false); router.push(href)
  }

  return (
    <>
      {/* ── Overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── Drawer ── */}
      <div ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: T.drawerBg, borderLeft: `1px solid ${T.drawerBorder}`, boxShadow: T.drawerShadow, paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${T.divider}`, paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="T-CRM" className="w-8 h-8 rounded-xl object-cover" style={{ boxShadow: '0 0 12px rgba(99,102,241,0.4)' }} />
            <span className="font-bold text-base" style={{ color: T.titleColor }}>T-CRM</span>
          </div>
          <button onClick={() => setDrawerOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{ color: T.closeBtn, backgroundColor: 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = T.navHoverBg}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {DRAWER_NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (pathname.startsWith(href + '/') && href !== '/')
            return (
              <button key={href}
                onClick={() => { setDrawerOpen(false); setSelectedLead(null); router.push(href) }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left active:scale-[0.97]"
                style={active
                  ? { backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: 600 }
                  : { color: T.navText }}>
                <Icon size={19} className="flex-shrink-0" />
                <span className="text-base font-medium">{label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-3 pt-2 space-y-1" style={{ borderTop: `1px solid ${T.divider}` }}>

          {/* Push notifications */}
          {supported && permission !== 'denied' && (
            <button
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{ color: subscribed ? '#10b981' : (isDark ? '#64748b' : '#64748b') }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = T.navHoverBg}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              <div className="relative flex-shrink-0">
                {subscribed
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{opacity:0.4}}><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                }
                {subscribed && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />}
              </div>
              <span className="text-sm font-medium" style={{ color: subscribed ? '#10b981' : T.themeText }}>
                {pushLoading ? 'Aguarde...' : subscribed ? 'Notificações ativas' : 'Ativar notificações'}
              </span>
            </button>
          )}

          {/* Botão de tema — cores corretas em ambos os modos */}
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ color: T.themeText }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = T.navHoverBg}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            {isDark
              ? <Sun  size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
              : <Moon size={18} style={{ color: '#6366f1', flexShrink: 0 }} />}
            <span className="text-sm font-medium">
              {isDark ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            </span>
          </button>

          {/* Agente logado */}
          {currentAgent && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: T.agentCardBg }}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {currentAgent.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: T.agentName }}>
                  {currentAgent.name}
                </p>
                <p className="text-xs font-medium" style={{ color: currentAgent.role === 'supervisor' ? '#60a5fa' : '#34d399' }}>
                  {currentAgent.role === 'supervisor' ? 'Supervisor' : 'Vendedor'}
                </p>
              </div>
              <button onClick={() => { logout(); setDrawerOpen(false) }}
                className="p-2 rounded-lg transition-colors"
                style={{ color: '#ef4444' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
        style={{
          background:    T.tabBg,
          borderTop:     `1px solid ${T.tabBorder}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          minHeight:     'calc(56px + env(safe-area-inset-bottom, 0px))',
        }}>
        {BOTTOM_TABS.map(({ href, icon: Icon, label, badgeKey }) => {
          const active     = href !== '#menu' && (pathname === href || pathname.startsWith(href + '/'))
          const menuActive = href === '#menu' && drawerOpen
          const isActive   = active || menuActive
          const badge      = badgeKey ? (badges[badgeKey] || 0) : 0
          const color      = isActive ? T.tabActive : T.tabInactive

          return (
            <button key={href} onClick={() => handleTab(href)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all active:scale-90"
              style={{ height: '56px' }}>
              {/* Indicador ativo no topo */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                  style={{ backgroundColor: T.tabActive }} />
              )}
              <div className="relative">
                <Icon size={21} style={{ color }} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] rounded-full flex items-center justify-center text-white font-bold"
                    style={{ fontSize: '8px', padding: '0 2px', backgroundColor: BADGE_BG[badgeKey] || '#ef4444' }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="font-medium leading-none" style={{ fontSize: '10px', color }}>{label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
