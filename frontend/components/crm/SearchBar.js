'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, SlidersHorizontal, User, Tag, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../contexts/AppContext'

const COL_LABELS = {
  leads:'Leads', negociacao:'Negociação', aguardando_cotacao:'Ag. Cotação',
  agendado:'Agendado', lancar_venda:'Lançar Venda', aguardando_pagamento:'Ag. Pgto',
  pago:'Pago ✓', sem_retorno:'Sem Retorno'
}

export default function SearchBar({ onResults, onClear }) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ column: '', assignee: '', product: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [agents, setAgents] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)
  const { currentAgent } = useApp()

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {})
  }, [])

  const doSearch = useCallback(async (q, f) => {
    const hasQuery = q.trim().length > 0
    const hasFilter = f.column || f.assignee || f.product
    if (!hasQuery && !hasFilter) { onClear?.(); return }

    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (f.column) params.set('column', f.column)
      if (f.assignee) params.set('assignee', f.assignee)
      if (f.product) params.set('product', f.product)
      if (currentAgent?.role === 'vendedor') params.set('agentId', currentAgent.id)

      const data = await api.search(params.toString())
      onResults?.(data.results || [])
    } catch { onClear?.() }
    finally { setSearching(false) }
  }, [currentAgent, onResults, onClear])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query, filters), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, filters, doSearch])

  const clear = () => {
    setQuery('')
    setFilters({ column: '', assignee: '', product: '' })
    onClear?.()
  }

  const hasActive = query || filters.column || filters.assignee || filters.product
  const activeFilters = [filters.column, filters.assignee, filters.product].filter(Boolean).length

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {/* Campo de busca */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nome, telefone ou mensagem..."
            className="w-full pl-8 pr-8 py-2 rounded-xl text-sm transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: `1px solid ${hasActive ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {(searching) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
          )}
          {!searching && hasActive && (
            <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-red-400 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros */}
        <button
          onClick={() => setShowFilters(o => !o)}
          className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0"
          style={{
            backgroundColor: showFilters || activeFilters > 0 ? 'rgba(59,130,246,0.12)' : 'var(--bg-card)',
            color: activeFilters > 0 ? '#60a5fa' : 'var(--text-muted)',
            border: `1px solid ${activeFilters > 0 ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
          }}>
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilters > 0 && (
            <span className="w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center text-white"
              style={{ backgroundColor: '#3b82f6', fontSize: '10px' }}>
              {activeFilters}
            </span>
          )}
        </button>
      </div>

      {/* Painel de filtros */}
      {showFilters && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-xl shadow-2xl z-30"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Filtro por etapa */}
            <div>
              <label className="text-xs text-[var(--text-muted)] font-medium mb-1 block">Etapa</label>
              <select
                value={filters.column}
                onChange={e => setFilters(f => ({ ...f, column: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}>
                <option value="">Todas</option>
                {Object.entries(COL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Filtro por vendedor */}
            <div>
              <label className="text-xs text-[var(--text-muted)] font-medium mb-1 block">Vendedor</label>
              <select
                value={filters.assignee}
                onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}>
                <option value="">Todos</option>
                {agents.map(a => (
                  <option key={a.id} value={a.name}>{a.name.split(' ')[0]}</option>
                ))}
              </select>
            </div>

            {/* Filtro por produto */}
            <div>
              <label className="text-xs text-[var(--text-muted)] font-medium mb-1 block">Produto</label>
              <select
                value={filters.product}
                onChange={e => setFilters(f => ({ ...f, product: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}>
                <option value="">Todos</option>
                <option value="Seguro de Vida">Seg. Vida</option>
                <option value="Seguro">Seguro</option>
                <option value="Plano de Saúde">Saúde</option>
                <option value="Seguro Auto">Auto</option>
              </select>
            </div>
          </div>
          {(filters.column || filters.assignee || filters.product) && (
            <button onClick={() => setFilters({ column: '', assignee: '', product: '' })}
              className="mt-2 text-xs text-red-400 hover:text-red-300">
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  )
}
