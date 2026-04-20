'use client'
import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function MainLayout({ children, chat, inbox }) {
  const { selectedLead, setSelectedLead } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const chatOpen = !!selectedLead
  const isInboxMode = !!inbox

  const handleCloseChat = () => setSelectedLead(null)

  return (
    <>
      {/* ── DESKTOP ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        <Sidebar />
        {isInboxMode ? (
          <div className="flex flex-1 overflow-hidden min-w-0">
            <div className="flex-shrink-0 border-r border-[var(--border)] overflow-hidden" style={{ width: '320px' }}>
              {inbox}
            </div>
            <div className="flex-1 overflow-hidden min-w-0">{chat}</div>
            {children}
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden min-w-0 relative">
            <main className="flex-1 overflow-hidden min-w-0 transition-all duration-300"
              style={{ marginRight: chatOpen ? '420px' : '0' }}>
              {children}
            </main>
            {chat && (
              <div className="absolute top-0 right-0 bottom-0 transition-all duration-300 ease-in-out"
                style={{
                  width: '420px',
                  transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
                  borderLeft: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  boxShadow: chatOpen ? '-8px 0 32px rgba(0,0,0,0.15)' : 'none',
                  pointerEvents: chatOpen ? 'all' : 'none',
                }}>
                {chat}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MOBILE ── */}
      <div className="flex md:hidden flex-col h-screen overflow-hidden bg-[var(--bg-primary)]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        <MobileNav
          menuOpen={menuOpen}
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
        />

        <div className="flex-1 overflow-hidden relative">
          {isInboxMode ? (
            <>
              {/* Lista conversas */}
              <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                chatOpen ? '-translate-x-full' : 'translate-x-0'
              }`}>
                {inbox}
              </div>
              {/* Chat */}
              <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                chatOpen ? 'translate-x-0' : 'translate-x-full'
              }`}>
                <BackBar onBack={handleCloseChat} label="Voltar" />
                <div className="h-[calc(100%-44px)] overflow-hidden">{chat}</div>
              </div>
              {children}
            </>
          ) : (
            <>
              {/* Kanban */}
              <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                chatOpen ? '-translate-x-full' : 'translate-x-0'
              }`}>
                {children}
              </div>
              {/* Chat */}
              {chat && (
                <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                  chatOpen ? 'translate-x-0' : 'translate-x-full'
                }`}>
                  <BackBar onBack={handleCloseChat} label="Voltar ao Kanban" />
                  <div className="h-[calc(100%-44px)] overflow-hidden">{chat}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function BackBar({ onBack, label }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] flex-shrink-0 h-11"
      style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-blue-400 font-medium">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        {label}
      </button>
    </div>
  )
}
