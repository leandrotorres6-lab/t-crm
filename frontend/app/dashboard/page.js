'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import MainLayout from '../../components/layout/MainLayout'
import { api } from '../../lib/api'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users, CheckCircle, TrendingUp, XCircle, RefreshCw, Trophy, Medal, Award, DollarSign, Clock } from 'lucide-react'

const _cache = { data: null, key: null, ts: 0 }
const CACHE_TTL = 60 * 1000

const fmt = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0)

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl text-sm"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="font-semibold text-[var(--text-muted)] mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.dataKey === 'valor' ? fmt(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

function Skel({ w = '100%', h = 16, r = 8, mt = 0 }) {
  return <div className="animate-pulse" style={{ width: w, height: h, borderRadius: r, marginTop: mt, backgroundColor: 'var(--bg-hover)', flexShrink: 0 }} />
}

function StatCard({ label, value, icon: Icon, color, sub, pct, skeleton, money }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      {skeleton ? (
        <><Skel w="60%" h={28} r={6} /><Skel w="40%" h={11} r={4} mt={4} /></>
      ) : (
        <>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{money ? fmt(value) : value}</p>
          {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>}
        </>
      )}
      {!skeleton && pct !== undefined && (
        <div className="w-full h-1 rounded-full" style={{ backgroundColor: color + '20' }}>
          <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
        </div>
      )}
    </div>
  )
}

function RankBadge({ pos }) {
  if (pos === 0) return <Trophy size={16} style={{ color: '#f59e0b' }} />
  if (pos === 1) return <Medal size={16} style={{ color: '#94a3b8' }} />
  if (pos === 2) return <Award size={16} style={{ color: '#b45309' }} />
  return <span className="text-xs font-bold text-[var(--text-muted)]">#{pos + 1}</span>
}

// Preset de períodos
const PRESETS = [
  { label: '7d',  days: 7  },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Tudo', days: 0 },
]

export default function DashboardPage() {
  const [data,     setData]     = useState(() => _cache.data || null)
  const [loading,  setLoading]  = useState(true)
  const [preset,   setPreset]   = useState(30)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [custom,   setCustom]   = useState(false)
  const abortRef = useRef(null)

  const load = useCallback(async (force = false) => {
    const cacheKey = custom ? `${dateFrom}_${dateTo}` : String(preset)
    if (!force && _cache.data && _cache.key === cacheKey && Date.now() - _cache.ts < CACHE_TTL) {
      setData(_cache.data); setLoading(false); return
    }
    setLoading(true)
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      let url = '/dashboard?'
      if (custom && (dateFrom || dateTo)) {
        if (dateFrom) url += `from=${dateFrom}&`
        if (dateTo)   url += `to=${dateTo}&`
      } else if (preset > 0) {
        url += `days=${preset}&`
      }
      const d = await api.getDashboard(0, url)
      _cache.data = d; _cache.key = cacheKey; _cache.ts = Date.now()
      setData(d)
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[Dashboard]', e)
    } finally { setLoading(false) }
  }, [preset, custom, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const sk = loading && !data
  const s  = data?.summary || {}
  const funnel   = data?.funnel    || []
  const maxF     = Math.max(...funnel.map(f => f.count), 1)
  const ranking  = data?.ranking   || []
  const chart    = data?.monthlyData || []

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard</h1>
              <p className="text-sm text-[var(--text-muted)] mt-0.5">
                {data?.period ? `${data.period.start} → ${data.period.end}` : 'Visão geral'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Presets */}
              {!custom && (
                <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  {PRESETS.map(p => (
                    <button key={p.days} onClick={() => setPreset(p.days)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={preset === p.days ? { backgroundColor: '#2563eb', color: 'white' } : { color: 'var(--text-muted)' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              {/* Custom range */}
              <button onClick={() => setCustom(o => !o)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={custom ? { backgroundColor: '#2563eb', color: 'white' } : { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                📅 Período
              </button>
              <button onClick={() => load(true)} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Custom date picker */}
          {custom && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl animate-fade-in"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-muted)]">De</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="input-theme text-sm" style={{ maxWidth: 160 }} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-muted)]">Até</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="input-theme text-sm" style={{ maxWidth: 160 }} />
              </div>
              <button onClick={() => load(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: '#2563eb', color: 'white' }}>
                Buscar
              </button>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard skeleton={sk} label="Total de Leads" value={s.totalLeads || 0} icon={Users} color="#3b82f6" sub="no período" />
            <StatCard skeleton={sk} label="Em Negociação"  value={s.emNegociacao || 0} icon={TrendingUp} color="#8b5cf6"
              pct={s.totalLeads > 0 ? Math.round((s.emNegociacao / s.totalLeads) * 100) : 0} />
            <StatCard skeleton={sk} label="Ag. Pagamento"  value={s.aguardandoPagamento || 0} icon={Clock} color="#f97316"
              pct={s.totalLeads > 0 ? Math.round((s.aguardandoPagamento / s.totalLeads) * 100) : 0} />
            <StatCard skeleton={sk} label="Pagos" value={s.pagos || 0} icon={CheckCircle} color="#22c55e"
              sub={`${data?.convRate || 0}% conversão`} pct={data?.convRate} />
            <StatCard skeleton={sk} label="💰 Total Vendido" value={s.totalVendido || 0} icon={DollarSign} color="#f59e0b"
              money sub={s.pagos > 0 ? `${s.pagos} contratos` : 'nenhum ainda'} />
          </div>

          {/* Funil + Gráfico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Funil */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Funil de Conversão</h2>
              {sk
                ? <div className="space-y-2">{[1,2,3,4,5,6].map(i => <Skel key={i} h={28} r={8} />)}</div>
                : <div className="space-y-2">
                    {funnel.map(f => (
                      <div key={f.stage} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-[var(--text-muted)] text-right flex-shrink-0">{f.stage}</div>
                        <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-hover)' }}>
                          <div className="h-full rounded-lg flex items-center px-2 transition-all duration-700"
                            style={{ width: `${maxF > 0 ? (f.count / maxF) * 100 : 0}%`, backgroundColor: f.color + 'cc', minWidth: f.count > 0 ? '2.5rem' : 0 }}>
                            {f.count > 0 && <span className="text-white text-xs font-bold">{f.count}</span>}
                          </div>
                        </div>
                        <div className="w-10 text-xs font-bold flex-shrink-0" style={{ color: f.color }}>{f.pct}%</div>
                        {f.valor != null && f.valor > 0 && (
                          <div className="text-xs font-medium flex-shrink-0" style={{ color: '#22c55e', minWidth: 70 }}>{fmt(f.valor)}</div>
                        )}
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Gráfico de linha */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Evolução no período</h2>
              {sk
                ? <Skel h={200} r={12} />
                : <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gLeads"     x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                        <linearGradient id="gPagos"     x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                        <linearGradient id="gAguardando" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} />
                      <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="leads"     name="Leads"      stroke="#3b82f6" fill="url(#gLeads)"      strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="pagos"     name="Pagos"      stroke="#22c55e" fill="url(#gPagos)"      strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="aguardando" name="Ag. Pgto"  stroke="#f97316" fill="url(#gAguardando)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
              }
            </div>
          </div>

          {/* Ranking de vendedores */}
          {(sk || ranking.length > 0) && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Ranking de Vendedores</h2>
              {sk
                ? <div className="space-y-2">{[1,2,3].map(i => <Skel key={i} h={56} r={12} />)}</div>
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
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-center hidden sm:block">
                            <p className="text-sm font-bold text-green-400">{agent.pagos}</p>
                            <p className="text-xs text-[var(--text-muted)]">pagos</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <p className="text-sm font-bold text-orange-400">{agent.aguardando}</p>
                            <p className="text-xs text-[var(--text-muted)]">ag. pgto</p>
                          </div>
                          {agent.totalVendido > 0 && (
                            <div className="text-center">
                              <p className="text-sm font-bold text-yellow-400">{fmt(agent.totalVendido)}</p>
                              <p className="text-xs text-[var(--text-muted)]">vendido</p>
                            </div>
                          )}
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
