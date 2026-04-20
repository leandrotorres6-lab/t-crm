'use client'
import { useApp } from '../../contexts/AppContext'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function MainLayout({ children, chat }) {
  const { selectedLead, setSelectedLead } = useApp()

  return (
    <>
      {/* ── DESKTOP (≥ 768px) ── */}
      <div className="hidden md:flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        <Sidebar />
        <div className="flex flex-1 overflow-hidden min-w-0">
          <main className="flex-1 overflow-hidden min-w-0">
            {children}
          </main>
          {chat && (
            <div className="flex-shrink-0" style={{ width: '38%', borderLeft: '1px solid var(--border)' }}>
              {chat}
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE (< 768px) ── */}
      <div className="flex md:hidden flex-col h-screen overflow-hidden bg-[var(--bg-primary)]">
        <MobileNav />
        <div className="flex-1 overflow-hidden relative">
          {/* Kanban / página principal */}
          <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
            chat && selectedLead ? '-translate-x-full' : 'translate-x-0'
          }`}>
            {children}
          </div>

          {/* Chat — desliza da direita ao clicar num card */}
          {chat && (
            <div className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
              selectedLead ? 'translate-x-0' : 'translate-x-full'
            }`}>
              {/* Botão voltar para o kanban */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="flex items-center gap-1.5 text-sm text-blue-400 font-medium py-1"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                  </svg>
                  Voltar ao Kanban
                </button>
              </div>
              <div className="h-[calc(100%-41px)] overflow-hidden">
                {chat}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
