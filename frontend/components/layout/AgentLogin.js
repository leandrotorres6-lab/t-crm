'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Loader2, Shield, User, Building2 } from 'lucide-react'

function Avatar({ agent, size = 48 }) {
  const [imgError, setImgError] = useState(false)
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = {
    supervisor: 'from-blue-500 to-indigo-600',
    vendedor: 'from-emerald-500 to-teal-600',
  }
  const gradient = colors[agent.role] || colors.vendedor

  if (agent.avatarUrl && !imgError) {
    return (
      <img src={agent.avatarUrl} alt={agent.name}
        onError={() => setImgError(true)}
        className="rounded-2xl object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.33 }}>
      {initials}
    </div>
  )
}

export default function AgentLogin({ onLogin }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(null)

  useEffect(() => {
    api.getAgents()
      .then(list => setAgents(list))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [])

  const select = (agent) => {
    setSelecting(agent.id)
    setTimeout(() => onLogin(agent), 250)
  }

  const supervisors = agents.filter(a => a.role === 'supervisor')
  const vendedores = agents.filter(a => a.role === 'vendedor')

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto py-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md px-6">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-4 shadow-xl shadow-blue-500/25">
            <span className="text-white text-3xl font-black">T</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">T-CRM</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <Building2 size={12} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">PV Corretora de Seguros</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">Conectando ao Chatwoot...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-[var(--text-muted)]">Nenhum agente encontrado</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Verifique a configuração do Chatwoot</p>
          </div>
        ) : (
          <>
            {/* Supervisores / Administradores */}
            {supervisors.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Shield size={12} className="text-blue-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Administradores
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                  {supervisors.map((agent, i) => (
                    <button key={agent.id} onClick={() => select(agent)}
                      disabled={!!selecting}
                      className="w-full flex items-center gap-4 px-4 py-3.5 transition-all hover:bg-[var(--bg-hover)] text-left"
                      style={{ borderBottom: i < supervisors.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <Avatar agent={agent} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{agent.email}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium flex-shrink-0"
                        style={{ color: '#60a5fa' }}>
                        {selecting === agent.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <><Shield size={12} /><span>Admin</span></>
                        }
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] px-1 mt-1.5">
                  ✓ Acesso a todas as conversas
                </p>
              </div>
            )}

            {/* Vendedores */}
            {vendedores.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <User size={12} className="text-emerald-400" />
                  <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Vendedores
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                  {vendedores.map((agent, i) => (
                    <button key={agent.id} onClick={() => select(agent)}
                      disabled={!!selecting}
                      className="w-full flex items-center gap-4 px-4 py-3.5 transition-all hover:bg-[var(--bg-hover)] text-left"
                      style={{ borderBottom: i < vendedores.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <Avatar agent={agent} size={44} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{agent.email}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-medium flex-shrink-0"
                        style={{ color: '#34d399' }}>
                        {selecting === agent.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <><User size={12} /><span>Vendedor</span></>
                        }
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] px-1 mt-1.5">
                  ✓ Vê apenas conversas atribuídas a você
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-center text-[var(--text-muted)] mt-6">
          Agentes sincronizados com o Chatwoot
        </p>
      </div>
    </div>
  )
}
