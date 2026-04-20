'use client'
import MainLayout from '../../components/layout/MainLayout'
import KanbanBoard from '../../components/crm/KanbanBoard'
import ChatPanel from '../../components/crm/ChatPanel'
import ScheduleModal from '../../components/crm/ScheduleModal'
import PaymentModal from '../../components/crm/PaymentModal'
import NotificationAlarm from '../../components/crm/NotificationAlarm'

export default function CRMPage() {
  return (
    <MainLayout chat={<ChatPanel />}>
      <KanbanBoard />
      <ScheduleModal onConfirm={() => {}} />
      <PaymentModal onConfirm={() => {}} />
      <NotificationAlarm />
    </MainLayout>
  )
}
