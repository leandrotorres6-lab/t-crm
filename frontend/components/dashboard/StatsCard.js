'use client'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function StatsCard({ label, value, sub, color, icon: Icon, trend }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 animate-fade-in"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: color + '20' }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-red-400' : 'text-slate-400'
          }`}>
            {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-[var(--text-primary)] font-mono">{value}</p>
        <p className="text-sm font-medium text-[var(--text-secondary)] mt-0.5">{label}</p>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
      </div>
    </div>
  )
}
