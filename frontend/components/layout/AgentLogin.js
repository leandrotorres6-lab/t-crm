'use client'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Loader2, Shield, User, Building2, Eye, EyeOff, ArrowLeft } from 'lucide-react'

function getRoleLabel(agent) {
  const name = (agent.name || '').toLowerCase()
  if (name.includes('safira')) return 'Backoffice'
  if (agent.role === 'supervisor') return 'Supervisor'
  return 'Vendedor'
}

function getRoleColor(agent) {
  const name = (agent.name || '').toLowerCase()
  if (name.includes('safira')) return '#f59e0b'
  if (agent.role === 'supervisor') return '#60a5fa'
  return '#34d399'
}

function Avatar({ agent, size = 48 }) {
  const [imgError, setImgError] = useState(false)
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const gradient = agent.role === 'supervisor' ? 'from-blue-500 to-indigo-600' : 'from-emerald-500 to-teal-600'

  if (agent.avatarUrl && !imgError) {
    return (
      <img src={agent.avatarUrl} alt={agent.name}
        onError={() => setImgError(true)}
        className={`rounded-2xl object-cover flex-shrink-0`}
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
  const [selected, setSelected] = useState(null)   // agente escolhido
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    api.getAgents()
      .then(list => setAgents(list))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [])

  const selectAgent = (agent) => {
    setSelected(agent)
    setPassword('')
    setError('')
  }

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!password.trim()) { setError('Digite sua senha'); return }
    setLogging(true)
    setError('')
    try {
      const { agent, token } = await api.login(selected.id, password)
      onLogin(agent, token)
    } catch (err) {
      const msg = err?.message || 'Senha incorreta'
      // Tenta extrair mensagem do JSON de erro
      try {
        const data = JSON.parse(err?.message || '{}')
        setError(data.error || msg)
      } catch {
        setError('Senha incorreta')
      }
    } finally {
      setLogging(false)
    }
  }

  const supervisors = agents.filter(a => a.role === 'supervisor')
  const vendedores = agents.filter(a => a.role === 'vendedor')

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto py-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm px-6">

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

        {/* Tela de senha */}
        {selected ? (
          <div className="animate-slide-up">
            <button onClick={() => { setSelected(null); setPassword(''); setError('') }}
              className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 transition-colors">
              <ArrowLeft size={14} /> Trocar agente
            </button>

            {/* Card do agente selecionado */}
            <div className="flex items-center gap-3 p-4 rounded-2xl mb-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <Avatar agent={selected} size={48} />
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-[var(--text-primary)]">{selected.name}</p>
                <div className="flex items-center gap-1 mt-0.5"
                  style={{ color: getRoleColor(selected) }}>
                  {selected.role === 'supervisor' ? <Shield size={11} /> : <User size={11} />}
                  <span className="text-xs font-medium capitalize">{selected.role}</span>
                </div>
              </div>
            </div>

            {/* Campo de senha */}
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">
                  Senha
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="Digite sua senha"
                    autoFocus
                    className="input-theme pr-10 text-sm"
                    style={{ fontSize: '16px' }}
                  />
                  <button type="button" onClick={() => setShowPass(o => !o)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 px-1 animate-fade-in">⚠️ {error}</p>
              )}

              <button type="submit" disabled={logging || !password.trim()}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: '#2563eb', color: 'white' }}>
                {logging ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar'}
              </button>
            </form>
          </div>

        ) : (
          /* Lista de agentes */
          loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={28} className="animate-spin text-blue-400" />
              <p className="text-sm text-[var(--text-muted)]">Conectando ao Chatwoot...</p>
            </div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">Nenhum agente encontrado</p>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {supervisors.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Shield size={12} className="text-blue-400" />
                    <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Supervisores</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                    {supervisors.map((agent, i) => (
                      <button key={agent.id} onClick={() => selectAgent(agent)}
                        className="w-full flex items-center gap-4 px-4 py-3.5 transition-all hover:bg-[var(--bg-hover)] text-left"
                        style={{ borderBottom: i < supervisors.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <Avatar agent={agent} size={44} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</p>
                          <p className="text-xs truncate" style={{ color: getRoleColor(agent) }}>{getRoleLabel(agent)}</p>
                        </div>
                        <ArrowLeft size={14} className="rotate-180 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {vendedores.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <User size={12} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Vendedores</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                    {vendedores.map((agent, i) => (
                      <button key={agent.id} onClick={() => selectAgent(agent)}
                        className="w-full flex items-center gap-4 px-4 py-3.5 transition-all hover:bg-[var(--bg-hover)] text-left"
                        style={{ borderBottom: i < vendedores.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <Avatar agent={agent} size={44} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{agent.name}</p>
                          <p className="text-xs truncate" style={{ color: getRoleColor(agent) }}>{getRoleLabel(agent)}</p>
                        </div>
                        <ArrowLeft size={14} className="rotate-180 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        <p className="text-xs text-center text-[var(--text-muted)] mt-6">
          Agentes sincronizados com o Chatwoot
        </p>
      </div>
    </div>
  )
}
