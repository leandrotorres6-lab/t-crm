'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '../../contexts/AppContext'
import { LogOut } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import {
  LayoutDashboard, KanbanSquare, Calendar, Users, Menu, X,
  Sun, Moon, Circle, Wifi, WifiOff, ChevronDown, DollarSign
} from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/crm', icon: KanbanSquare, label: 'CRM' },
  { href: '/agendamento', icon: Calendar, label: 'Agendamento' },
  { href: '/aguardando-pagamento', icon: DollarSign, label: 'Pagamentos' },
  { href: '/contatos', icon: Users, label: 'Contatos' },
]

const STATUS_COLORS = { online: '#10b981', ocupado: '#f59e0b', offline: '#6b7280' }
const STATUS_LABELS = { online: 'Online', ocupado: 'Ocupado', offline: 'Offline' }

export default function Sidebar() {
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen, currentAgent, logout } = useApp()
  const currentUser = currentAgent || { name: '...', email: '', avatar: '?', status: 'online' }
  const { theme, toggleTheme } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const width = sidebarOpen ? 'w-60' : 'w-16'

  return (
    <aside
      style={{ backgroundColor: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      className={`${width} flex-shrink-0 flex flex-col h-full transition-all duration-300 relative z-20`}
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
        {NAV.map(({ href, icon: Icon, label }) => {
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
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && (
                <span className="text-sm font-medium animate-fade-in truncate">{label}</span>
              )}
              {active && sidebarOpen && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/5 space-y-1">
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
            <div className="relative flex-shrink-0">
              {currentUser.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt={currentUser.name}
                  className="w-8 h-8 rounded-xl object-cover"
                  onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              ) : null}
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 items-center justify-center"
                style={{ display: currentUser.avatarUrl ? 'none' : 'flex' }}>
                <span className="text-white text-xs font-bold">{currentUser.avatar}</span>
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900"
                style={{ backgroundColor: STATUS_COLORS[currentUser.status || 'online'] }}
              />
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
  )
}
