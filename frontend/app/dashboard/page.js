'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, CheckCircle, TrendingUp, XCircle, RefreshCw, Trophy, Medal, Award } from 'lucide-react'

const _cache = { data: null, period: null, ts: 0 }
const CACHE_TTL = 60 * 1000

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl text-sm"
      style={{ backgroundColor: '#0f1a2e', border: '1px solid #1e293b' }}>
      <p className="font-semibold text-slate-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

function Skel({ w = '100%', h = 16, r = 8, mt = 0 }) {
  return (
    <div className="animate-pulse"
      style={{ width: w, height: h, borderRadius: r, marginTop: mt, backgroundColor: 'var(--bg-hover)', flexShrink: 0 }} />
  )
}

function StatCard({ label, value, icon: Icon, color, sub, pct, skeleton }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      {skeleton ? (
        <><Skel w="55%" h={28} r={6} /><Skel w="40%" h={11} r={4} mt={4} /></>
      ) : (
        <>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>}
        </>
      )}
      {!skeleton && pct !== undefined && (
        <div className="w-full h-1 rounded-full" style={{ backgroundColor: color + '20' }}>
          <div className="h-1 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

function FunnelBar({ stage, count, pct, color, maxCount }) {
  const width = maxCount > 0 ? (count / maxCount) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-[var(--text-muted)] text-right flex-shrink-0">{stage}</div>
      <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-hover)' }}>
        <div className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
          style={{ width: `${width}%`, backgroundColor: color + 'cc', minWidth: count > 0 ? '2rem' : 0 }}>
          {count > 0 && <span className="text-white text-xs font-bold">{count}</span>}
        </div>
      </div>
      <div className="w-10 text-xs font-bold flex-shrink-0" style={{ color }}>{pct}%</div>
    </div>
  )
}

function RankBadge({ pos }) {
  if (pos === 0) return <Trophy size={16} style={{ color: '#f59e0b' }} />
  if (pos === 1) return <Medal size={16} style={{ color: '#94a3b8' }} />
  if (pos === 2) return <Award size={16} style={{ color: '#b45309' }} />
  return <span className="text-xs font-bold text-[var(--text-muted)]">#{pos + 1}</span>
}

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Tudo', days: 0 },
]

export default function DashboardPage() {
  const [data, setData] = useState(() => _cache.data || null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const abortRef = useRef(null)

  const load = useCallback(async (days, force = false) => {
    if (!force && _cache.data && _cache.period === days && Date.now() - _cache.ts < CACHE_TTL) {
      setData(_cache.data)
      setLoading(false)
      return
    }
    setLoading(true)
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      const d = await api.getDashboard(days)
      _cache.data = d
      _cache.period = days
      _cache.ts = Date.now()
      setData(d)
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[Dashboard]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(period)
    return () => { abortRef.current?.abort() }
  }, [period, load])

  const sk = loading && !data
  const s = data?.summary || {}
  const funnel = data?.funnel || []
  const maxFunnel = Math.max(...funnel.map(f => f.count), 1)
  const ranking = data?.ranking || []
  const monthly = data?.monthlyData || []

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-6">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">Visão geral do pipeline</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                {PERIODS.map(p => (
                  <button key={p.days} onClick={() => setPeriod(p.days)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={period === p.days ? { backgroundColor: '#2563eb', color: 'white' } : { color: 'var(--text-muted)' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={() => load(period, true)}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard skeleton={sk} label="Total de Leads" value={s.totalLeads || 0} icon={Users} color="#3b82f6" sub="no período" />
            <StatCard skeleton={sk} label="Em Negociação" value={s.emNegociacao || 0} icon={TrendingUp} color="#8b5cf6"
              pct={s.totalLeads > 0 ? Math.round((s.emNegociacao / s.totalLeads) * 100) : 0} />
            <StatCard skeleton={sk} label="Pagos" value={s.pagos || 0} icon={CheckCircle} color="#22c55e"
              sub={`${data?.convRate || 0}% conversão`} pct={data?.convRate} />
            <StatCard skeleton={sk} label="Cancelados" value={s.cancelados || 0} icon={XCircle} color="#ef4444"
              pct={s.totalLeads > 0 ? Math.round((s.cancelados / s.totalLeads) * 100) : 0} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Funil de Conversão</h2>
              {sk
                ? <div className="space-y-2">{[1,2,3,4,5].map(i => <Skel key={i} h={28} r={8} />)}</div>
                : <div className="space-y-2">{funnel.map(f => <FunnelBar key={f.stage} {...f} maxCount={maxFunnel} />)}</div>
              }
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Últimos 6 meses</h2>
              {sk
                ? <Skel h={180} r={12} />
                : <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="gPagos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="leads" name="Leads" stroke="#3b82f6" fill="url(#gLeads)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="pagos" name="Pagos" stroke="#22c55e" fill="url(#gPagos)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
              }
            </div>
          </div>

          {(sk || ranking.length > 0) && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Ranking de Vendedores</h2>
              {sk
                ? <div className="space-y-2">{[1,2,3].map(i => <Skel key={i} h={52} r={12} />)}</div>
                : <div className="space-y-2">
                    {ranking.map((agent, i) => (
                      <div key={agent.name} className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: i === 0 ? 'rgba(245,158,11,0.06)' : 'var(--bg-hover)' }}>
                        <div className="w-7 flex-shrink-0 flex justify-center"><RankBadge pos={i} /></div>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: '#2563eb' }}>
                          {agent.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{agent.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{agent.leads} leads · {agent.conversao}% conversão</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-center">
                            <p className="text-sm font-bold text-green-400">{agent.pagos}</p>
                            <p className="text-xs text-[var(--text-muted)]">pagos</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-bold text-orange-400">{agent.aguardando}</p>
                            <p className="text-xs text-[var(--text-muted)]">ag. pgto</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

        </div>
      </div>
    </MainLayout>
  )
}
