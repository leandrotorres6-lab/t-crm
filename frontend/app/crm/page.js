'use client'
import MainLayout from '../../components/layout/MainLayout'
import KanbanBoard from '../../components/crm/KanbanBoard'
import ChatPanel from '../../components/crm/ChatPanel'
import ScheduleModal from '../../components/crm/ScheduleModal'
import PaymentModal from '../../components/crm/PaymentModal'
import { api } from '../../lib/api'
import NotificationAlarm from '../../components/crm/NotificationAlarm'

export default function CRMPage() {
  return (
    <MainLayout chat={<ChatPanel />}>
      {/* Botão exportar CSV — abre em nova aba com o token atual */}
      <div className="fixed bottom-20 right-4 z-30 md:bottom-4">
        <div className="flex flex-col gap-1 items-end">
          <button
            onClick={() => {
              const url = api.exportKanban()
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shadow-lg transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            ↓ Exportar CRM
          </button>
        </div>
      </div>
      <KanbanBoard />
      <ScheduleModal onConfirm={() => {}} />
      <PaymentModal onConfirm={() => {}} />
      <NotificationAlarm />
    </MainLayout>
  )
}
