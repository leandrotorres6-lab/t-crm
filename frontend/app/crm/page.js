'use client'
import { useEffect } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import KanbanBoard from '../../components/crm/KanbanBoard'
import ChatPanel from '../../components/crm/ChatPanel'
import ScheduleModal from '../../components/crm/ScheduleModal'
import PaymentModal from '../../components/crm/PaymentModal'
import NotificationAlarm from '../../components/crm/NotificationAlarm'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'

export default function CRMPage() {
  const { selectedLead, setSelectedLead } = useApp()

  useEffect(() => {
    // Só abre o primeiro lead automaticamente se NENHUM lead estiver selecionado
    // Isso evita sobrescrever o lead escolhido na aba de Contatos
    if (selectedLead) return
    api.getColumnLeads('leads', 1).then(data => {
      if (data.items?.length > 0) setSelectedLead(data.items[0])
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MainLayout chat={<ChatPanel />}>
      <KanbanBoard />
      <ScheduleModal onConfirm={() => {}} />
      <PaymentModal onConfirm={() => {}} />
      <NotificationAlarm />
    </MainLayout>
  )
}
