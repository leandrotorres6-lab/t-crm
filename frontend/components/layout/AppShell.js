'use client'
import { useApp } from '../../contexts/AppContext'
import AgentLogin from './AgentLogin'

export default function AppShell({ children }) {
  const { currentAgent, login } = useApp()

  if (!currentAgent) {
    return <AgentLogin onLogin={login} />
  }

  return children
}
