'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { useTheme } from '../../contexts/ThemeContext'
import { api } from '../../lib/api'
import {
  KanbanSquare, MessageCircle, Calendar, DollarSign, Menu,
  X, Sun, Moon, LogOut, LayoutDashboard, Users
} from 'lucide-react'

const BOTTOM_TABS = [
  { href: '/crm',         icon: KanbanSquare,  label: 'CRM',        badgeKey: 'unread' },
  { href: '/conversas',   icon: MessageCircle, label: 'Conversas',  badgeKey: 'unread' },
  { href: '/agendamento', icon: Calendar,       label: 'Agenda',     badgeKey: 'agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pgtos', badgeKey: 'pagamento' },
  { href: '#menu',        icon: Menu,           label: 'Menu',       badgeKey: null },
]

const DRAWER_NAV = [
  { href: '/crm',         icon: KanbanSquare,   label: 'CRM' },
  { href: '/conversas',   icon: MessageCircle,  label: 'Conversas' },
  { href: '/contatos',    icon: Users,          label: 'Contatos' },
  { href: '/agendamento', icon: Calendar,       label: 'Agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pagamentos' },
  { href: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
]

const BADGE_COLORS = {
  unread:      { bg: '#ef4444' },
  agendamento: { bg: '#f59e0b' },
  pagamento:   { bg: '#f97316' },
}

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentAgent, logout, setSelectedLead, unreadCounts } = useApp()
  const { theme, toggleTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [badges, setBadges] = useState({ unread: 0, agendamento: 0, pagamento: 0 })
  const drawerRef = useRef(null)

  // Computa badges
  useEffect(() => {
    const unread = Object.values(unreadCounts || {}).reduce((s, v) => s + (v || 0), 0)
    setBadges(prev => ({ ...prev, unread }))
  }, [unreadCounts])

  useEffect(() => {
    const compute = async () => {
      try {
        const [schedResp, payResp] = await Promise.all([
          api.getScheduled(currentAgent?.id, currentAgent?.role),
          api.getPagamentos(),
        ])
        const today = new Date().toDateString()
        const sched = Array.isArray(schedResp) ? schedResp : []
        const pay = Array.isArray(payResp) ? payResp : []
        setBadges(prev => ({
          ...prev,
          agendamento: sched.filter(l => l.scheduledAt && new Date(l.scheduledAt).toDateString() === today).length,
          pagamento: pay.filter(l => {
            if (!l.paymentDueDate) return false
            const d = new Date(l.paymentDueDate)
            return d.toDateString() === today || d < new Date()
          }).length,
        }))
      } catch {}
    }
    compute()
    const iv = setInterval(compute, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [currentAgent?.id])

  // Fecha drawer ao clicar fora
  useEffect(() => {
    if (!drawerOpen) return
    const fn = (e) => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawerOpen(false) }
    document.addEventListener('mousedown', fn)
    document.addEventListener('touchstart', fn)
    return () => { document.removeEventListener('mousedown', fn); document.removeEventListener('touchstart', fn) }
  }, [drawerOpen])

  const handleTab = (href) => {
    if (href === '#menu') { setDrawerOpen(o => !o); return }
    setSelectedLead(null)
    setDrawerOpen(false)
    router.push(href)
  }

  const handleDrawerNav = (href) => {
    setDrawerOpen(false)
    setSelectedLead(null)
    router.push(href)
  }

  return (
    <>
      {/* ── Overlay drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
      )}

      {/* ── Drawer direito ── */}
      <div ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: 'rgba(6,12,24,0.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg" style={{ boxShadow: '0 0 12px rgba(59,130,246,0.4)' }}>
              <span className="text-white font-black text-sm">T</span>
            </div>
            <span className="text-white font-bold">T-CRM</span>
          </div>
          <button onClick={() => setDrawerOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {DRAWER_NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (pathname.startsWith(href) && href !== '/')
            return (
              <button key={href} onClick={() => handleDrawerNav(href)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left active:scale-[0.97] active:bg-white/5"
                style={active ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' } : { color: 'rgba(255,255,255,0.65)' }}>
                <Icon size={20} className="flex-shrink-0" />
                <span className="font-medium text-base">{label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </button>
            )
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/5 space-y-1">
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="text-sm">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </button>
          {currentAgent && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {currentAgent.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{currentAgent.name}</p>
                <p className="text-xs" style={{ color: currentAgent.role === 'supervisor' ? '#60a5fa' : '#34d399' }}>
                  {currentAgent.role === 'supervisor' ? 'Supervisor' : 'Vendedor'}
                </p>
              </div>
              <button onClick={() => { logout(); setDrawerOpen(false) }}
                className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center"
        style={{
          background: 'rgba(6,12,24,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        }}>
        {BOTTOM_TABS.map(({ href, icon: Icon, label, badgeKey }) => {
          const active = href !== '#menu' && (pathname === href || pathname.startsWith(href + '/'))
          const menuActive = href === '#menu' && drawerOpen
          const badge = badgeKey ? badges[badgeKey] || 0 : 0
          const color = (active || menuActive) ? '#60a5fa' : 'rgba(255,255,255,0.4)'

          return (
            <button key={href} onClick={() => handleTab(href)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90"
              style={{ height: '56px' }}>
              <div className="relative">
                <Icon size={22} style={{ color }} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ fontSize: '9px', padding: '0 3px', backgroundColor: BADGE_COLORS[badgeKey]?.bg || '#ef4444', lineHeight: 1 }}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="font-medium" style={{ fontSize: '10px', color }}>{label}</span>
              {(active || menuActive) && (
                <div className="absolute bottom-0" style={{
                  height: '2px', width: '20px',
                  backgroundColor: '#60a5fa',
                  borderRadius: '2px 2px 0 0',
                  bottom: 'env(safe-area-inset-bottom, 0px)',
                }} />
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
