'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  LayoutDashboard, KanbanSquare, Calendar, Users, X,
  Sun, Moon, DollarSign, LogOut, Shield, User, MessageCircle, Menu
} from 'lucide-react'

const NAV = [
  { href: '/crm', icon: KanbanSquare, label: 'CRM' },
  { href: '/conversas', icon: MessageCircle, label: 'Conversas' },
  { href: '/contatos', icon: Users, label: 'Contatos' },
  { href: '/agendamento', icon: Calendar, label: 'Agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pagamentos' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
]

function getRoleLabel(agent) {
  const name = (agent?.name || '').toLowerCase()
  if (name.includes('safira')) return 'Backoffice'
  return agent?.role === 'supervisor' ? 'Supervisor' : 'Vendedor'
}

export default function MobileNav({ onMenuOpen, onMenuClose, menuOpen }) {
  const pathname = usePathname()
  const router = useRouter()
  const { currentAgent, logout, setSelectedLead } = useApp()
  const { theme, toggleTheme } = useTheme()
  const drawerRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const fn = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onMenuClose?.()
    }
    document.addEventListener('mousedown', fn)
    document.addEventListener('touchstart', fn)
    return () => {
      document.removeEventListener('mousedown', fn)
      document.removeEventListener('touchstart', fn)
    }
  }, [menuOpen, onMenuClose])

  const currentPage = NAV.find(n => pathname === n.href || pathname.startsWith(n.href + '/'))

  const handleNav = (href) => {
    onMenuClose?.()
    setSelectedLead(null)
    router.push(href)
  }

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-[var(--border)]"
        style={{ backgroundColor: 'var(--sidebar-bg)' }}>
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
        <button onClick={onMenuOpen}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all">
          <Menu size={22} />
        </button>
      </div>

      {/* Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onMenuClose} />
      )}

      {/* Drawer lateral */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ backgroundColor: 'var(--sidebar-bg)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Header drawer */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
              <span className="text-white font-black text-sm">T</span>
            </div>
            <span className="text-white font-bold">T-CRM</span>
          </div>
          <button onClick={onMenuClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-white/5">
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <button key={href} onClick={() => handleNav(href)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                style={active
                  ? { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' }
                  : { color: '#64748b' }}>
                <Icon size={20} className="flex-shrink-0" />
                <span className="font-medium">{label}</span>
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/5 space-y-2">
          <button onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span className="text-sm">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </button>

          {currentAgent && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {currentAgent.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-300 truncate">{currentAgent.name}</p>
                <p className="text-xs capitalize" style={{ color: currentAgent.role === 'supervisor' ? '#60a5fa' : '#34d399' }}>
                  {getRoleLabel(currentAgent)}
                </p>
              </div>
              <button onClick={() => { logout(); onMenuClose?.() }}
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
