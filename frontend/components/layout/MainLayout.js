'use client'
import { useApp } from '../../contexts/AppContext'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'

export default function MainLayout({ children, chat, inbox }) {
  const _swipeStartX = { current: 0 }
  const { selectedLead, setSelectedLead } = useApp()
  const chatOpen = !!selectedLead
  const isInboxMode = !!inbox

  const BackButton = ({ label }) => (
    <div className="flex items-center px-4 py-2.5 border-b border-[var(--border)] flex-shrink-0"
      style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={() => setSelectedLead(null)}
        className="flex items-center gap-1.5 text-sm text-blue-400 font-medium">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        {label}
      </button>
    </div>
  )

  return (
    <div className="flex overflow-hidden bg-[var(--bg-primary)]" style={{ height: "100dvh", maxHeight: "-webkit-fill-available" }}>

      {/* Sidebar — desktop: empurra conteúdo | mobile: overlay */}
      <div className="hidden md:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile: bottom tabs + drawer */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Área de conteúdo — padding bottom no mobile para o bottom nav */}
      <style>{`
        @media (max-width: 767px) {
          .main-content-area { padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)) !important; }
          .kanban-main { margin-right: 0 !important; }
          .kanban-main, .kanban-main * { max-width: 100vw; }
        }
      `}</style>
      {isInboxMode ? (
        /* INBOX MODE: [Lista] | [Chat] */
        <div className="flex flex-1 overflow-hidden min-w-0 main-content-area">
          {/* Lista — esconde quando chat aberto no mobile */}
          <div className={`border-r border-[var(--border)] overflow-hidden flex-shrink-0 transition-all duration-300
            ${chatOpen ? 'w-0 pointer-events-none' : 'w-full'}
            md:w-[320px] md:pointer-events-auto`}>
            {inbox}
          </div>

          {/* Chat */}
          <div className={`flex-1 overflow-hidden min-w-0 flex flex-col
            ${chatOpen ? 'flex' : 'hidden md:flex'}`}>
            {chatOpen && (
              <div className="md:hidden">
                <BackButton label="Voltar" />
              </div>
            )}
            <div className="flex-1 overflow-hidden">{chat}</div>
          </div>

          {children}
        </div>

      ) : (
        /* KANBAN MODE: Kanban + Chat slide */
        <div className="flex flex-1 overflow-hidden min-w-0 relative main-content-area">

          {/* Kanban — esconde no mobile quando chat aberto */}
          <div className={`flex-1 overflow-hidden min-w-0 transition-all duration-300
            ${chatOpen ? 'hidden md:block' : 'block'}
            md:mr-0`}
            style={{ marginRight: chatOpen ? 'min(420px, 45vw)' : 0 }}>
            {children}
          </div>

          {/* Chat slide — desktop lateral, mobile tela cheia */}
          {chat && (
            <>
              {/* Desktop: painel deslizante */}
              <div className="hidden md:flex absolute top-0 right-0 bottom-0 flex-col transition-transform duration-300"
                style={{
                  width: 'min(420px, 45vw)',
                  transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
                  borderLeft: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  boxShadow: chatOpen ? '-4px 0 24px rgba(0,0,0,0.2)' : 'none',
                  pointerEvents: chatOpen ? 'all' : 'none',
                }}>
                {chat}
              </div>

              {/* Mobile: tela cheia sobre o kanban — swipe right para voltar */}
              {chatOpen && (
                <div className="md:hidden absolute inset-0 flex flex-col z-10"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                  onTouchStart={e => { _swipeStartX.current = e.touches[0].clientX }}
                  onTouchEnd={e => {
                    const dx = e.changedTouches[0].clientX - (_swipeStartX.current || 0)
                    if (dx > 80) setSelectedLead(null)  // swipe right → volta ao kanban
                  }}>
                  <BackButton label="Voltar ao Kanban" />
                  <div className="flex-1 overflow-hidden">{chat}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
