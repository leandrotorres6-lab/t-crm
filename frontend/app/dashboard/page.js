'use client'
import { useEffect, useState } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts'
import {
  Users, CheckCircle, Clock, TrendingDown, XCircle,
  Loader2, RefreshCw, Trophy, Medal, Award, Calendar
} from 'lucide-react'

// ─── Tooltip personalizado ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl text-sm"
      style={{ backgroundColor: '#0f1a2e', border: '1px solid #1e293b' }}>
      <p className="font-semibold text-slate-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ─── Card de estatística ─────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: color + '18' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Ranking badge ───────────────────────────────────────────────────────────
function RankBadge({ pos }) {
  if (pos === 0) return <Trophy size={18} style={{ color: '#f59e0b' }} />
  if (pos === 1) return <Medal size={18} style={{ color: '#94a3b8' }} />
  if (pos === 2) return <Award size={18} style={{ color: '#b45309' }} />
  return <span className="text-xs font-bold text-[var(--text-muted)]">#{pos + 1}</span>
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const query = params.toString() ? `?${params}` : ''
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/dashboard${query}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const { summary = {}, monthlyData = [], ranking = [] } = data || {}

  const barData = monthlyData.map(m => ({
    month: m.month,
    'Leads': m.leads,
    'Ag. Pgto': m.aguardando_pagamento,
    'Pagos': m.pagos,
    'Cancelados': m.cancelados,
  }))

  const convRate = summary.totalLeads > 0
    ? Math.round((summary.pagos / summary.totalLeads) * 100) : 0

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">

          {/* Header + filtro de período */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                {from || to
                  ? `${from ? new Date(from+'T12:00:00').toLocaleDateString('pt-BR') : '?'} → ${to ? new Date(to+'T12:00:00').toLocaleDateString('pt-BR') : '?'}`
                  : 'Todos os períodos'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <Calendar size={12} />
                <span>De</span>
              </div>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="input-theme text-sm" style={{ maxWidth: '150px' }} />
              <span className="text-xs text-[var(--text-muted)]">até</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="input-theme text-sm" style={{ maxWidth: '150px' }} />
              <button onClick={load}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                style={{ backgroundColor: '#2563eb', color: 'white' }}>
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Filtrar
              </button>
              {(from || to) && (
                <button onClick={() => { setFrom(''); setTo(''); setTimeout(load, 50) }}
                  className="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors px-2">
                  Limpar
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <>
              {/* ── 4 cards de stats ── */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard label="Total de Leads" value={summary.totalLeads || 0}
                  icon={Users} color="#3b82f6" sub="No período" />
                <StatCard label="Em Negociação" value={summary.emNegociacao || 0}
                  icon={Clock} color="#8b5cf6" sub="Ativos" />
                <StatCard label="Ag. Pagamento" value={summary.aguardandoPagamento || 0}
                  icon={Clock} color="#f97316" sub="Aguardando" />
                <StatCard label="Pagos" value={summary.pagos || 0}
                  icon={CheckCircle} color="#10b981"
                  sub={`${convRate}% conversão`} />
                <StatCard label="Cancelados" value={summary.cancelados || 0}
                  icon={XCircle} color="#ef4444" sub="Com etiqueta cancelado" />
              </div>

              {/* ── Gráfico de barras: mensal ── */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Evolução Mensal</h3>
                    <p className="text-xs text-[var(--text-muted)]">Leads · Ag. Pgto · Pagos · Cancelados</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--text-secondary)' }} />
                    <Bar dataKey="Leads" fill="#3b82f6" radius={[4,4,0,0]} />
                    <Bar dataKey="Ag. Pgto" fill="#f97316" radius={[4,4,0,0]} />
                    <Bar dataKey="Pagos" fill="#10b981" radius={[4,4,0,0]} />
                    <Bar dataKey="Cancelados" fill="#ef4444" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* ── Taxas de conversão ── */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Taxa de Conversão</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Leads → Negociação', from: summary.totalLeads, to: summary.emNegociacao, color: '#8b5cf6' },
                    { label: 'Negociação → Pago', from: summary.emNegociacao, to: summary.pagos, color: '#10b981' },
                    { label: 'Lead → Pago (geral)', from: summary.totalLeads, to: summary.pagos, color: '#3b82f6' },
                  ].map(({ label, from: f, to: t, color }) => {
                    const rate = f > 0 ? Math.round((t / f) * 100) : 0
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-[var(--text-muted)]">{label}</span>
                          <span className="font-bold font-mono" style={{ color }}>{rate}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${rate}%`, backgroundColor: color }} />
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-1">{t} de {f}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Ranking de vendedores ── */}
              <div className="rounded-2xl p-5"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Ranking de Vendedores</h3>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  {from || to ? 'No período filtrado' : 'Todos os períodos'}
                </p>

                {ranking.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] text-center py-6">
                    Nenhum dado disponível — atribua conversas aos vendedores no Chatwoot
                  </p>
                ) : (
                  <div className="space-y-3">
                    {ranking.map((agent, i) => (
                      <div key={agent.name}
                        className="flex items-center gap-4 p-4 rounded-xl transition-all"
                        style={{
                          backgroundColor: i === 0 ? 'rgba(245,158,11,0.06)' : 'var(--bg-secondary)',
                          border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
                        }}>
                        {/* Posição */}
                        <div className="w-8 flex items-center justify-center flex-shrink-0">
                          <RankBadge pos={i} />
                        </div>

                        {/* Avatar + nome */}
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {agent.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{agent.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{agent.leads} leads atribuídos</p>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-center hidden sm:block">
                            <p className="text-sm font-bold" style={{ color: '#10b981' }}>{agent.pagos}</p>
                            <p className="text-xs text-[var(--text-muted)]">pagos</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <p className="text-sm font-bold" style={{ color: '#f97316' }}>{agent.aguardando}</p>
                            <p className="text-xs text-[var(--text-muted)]">ag. pgto</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{agent.cancelados}</p>
                            <p className="text-xs text-[var(--text-muted)]">cancel.</p>
                          </div>
                          {/* Conversão */}
                          <div className="text-center">
                            <p className="text-base font-black"
                              style={{ color: agent.conversao >= 20 ? '#10b981' : agent.conversao >= 10 ? '#f59e0b' : '#94a3b8' }}>
                              {agent.conversao}%
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">conversão</p>
                          </div>
                        </div>

                        {/* Barra de progresso */}
                        <div className="w-20 hidden lg:block">
                          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                            <div className="h-full rounded-full"
                              style={{
                                width: `${agent.conversao}%`,
                                backgroundColor: agent.conversao >= 20 ? '#10b981' : agent.conversao >= 10 ? '#f59e0b' : '#6b7280'
                              }} />
                          </div>
                          <p className="text-xs text-[var(--text-muted)] text-right mt-0.5">{agent.conversao}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  )
}
