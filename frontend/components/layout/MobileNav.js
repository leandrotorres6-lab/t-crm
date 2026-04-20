'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  LayoutDashboard, KanbanSquare, Calendar, Users, MessageCircle, Menu, X,
  Sun, Moon, DollarSign, LogOut, Shield, User
} from 'lucide-react'

const NAV = [
  { href: '/conversas', icon: MessageCircle, label: 'Conversas' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crm', icon: KanbanSquare, label: 'CRM' },
  { href: '/agendamento', icon: Calendar, label: 'Agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pagamentos' },
  { href: '/contatos', icon: Users, label: 'Contatos' },
]

export default function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { currentAgent, logout } = useApp()
  const { theme, toggleTheme } = useTheme()
  const drawerRef = useRef(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const fn = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    document.addEventListener('touchstart', fn)
    return () => {
      document.removeEventListener('mousedown', fn)
      document.removeEventListener('touchstart', fn)
    }
  }, [open])

  const currentPage = NAV.find(n => pathname === n.href || (n.href === '/crm' && pathname.startsWith('/crm')))

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar-bg)' }}>
        {/* Logo + Nome */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <span className="text-white font-black text-sm">T</span>
          </div>
          <div>
            <span className="text-white font-bold text-base tracking-tight">T-CRM</span>
            {currentPage && (
              <span className="text-blue-400 text-xs ml-2">/ {currentPage.label}</span>
            )}
          </div>
        </div>

        {/* Hamburger */}
        <button
          onClick={() => setOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--sidebar-bg)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Header do drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
              <span className="text-white font-black text-sm">T</span>
            </div>
            <span className="text-white font-bold">T-CRM</span>
          </div>
          <button onClick={() => setOpen(false)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-white/5 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href === '/crm' && pathname.startsWith('/crm'))
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={active
                  ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                  : { color: '#64748b' }
                }>
                <Icon size={20} className="flex-shrink-0" />
                <span className="font-medium">{label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/5 space-y-2">
          {/* Tema */}
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="text-sm">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </button>

          {/* Agente logado */}
          {currentAgent && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {currentAgent.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-300 truncate">{currentAgent.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {currentAgent.role === 'supervisor'
                    ? <Shield size={10} className="text-blue-400" />
                    : <User size={10} className="text-emerald-400" />
                  }
                  <span className="text-xs capitalize"
                    style={{ color: currentAgent.role === 'supervisor' ? '#60a5fa' : '#34d399' }}>
                    {currentAgent.role}
                  </span>
                </div>
              </div>
              <button onClick={() => { logout(); setOpen(false) }}
                className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
