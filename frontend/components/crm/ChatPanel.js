'use client'
import React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { api } from '../../lib/api'
import { useSocket } from '../../lib/socket'
import {
  Send, Loader2, MessageCircle, Smile, Wifi, WifiOff, Tag, ChevronDown,
  Check, ArrowRight, Mic, MicOff, Paperclip, ImageIcon, X,
  Play, Pause, Download, FileText, ChevronUp, MoreVertical,
  UserCheck, Plus, Trash2, Volume2, StickyNote, Layout, Pencil
} from 'lucide-react'

// ─── Constantes ──────────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { id: 'leads', label: 'Leads', color: '#3b82f6' },
  { id: 'negociacao', label: 'Negociação', color: '#8b5cf6' },
  { id: 'aguardando_cotacao', label: 'Ag. Cotação', color: '#f59e0b' },
  { id: 'agendado', label: 'Agendado', color: '#06b6d4' },
  { id: 'lancar_venda', label: 'Lançar Venda', color: '#10b981' },
  { id: 'aguardando_pagamento', label: 'Ag. Pagamento', color: '#f97316' },
  { id: 'pago', label: 'Pago ✓', color: '#22c55e' },
  { id: 'sem_retorno', label: 'Sem Retorno', color: '#6b7280' },
]

function labelColor(str) {
  let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'][Math.abs(h) % 8]
}
function normalize(s) { return (s || '').toLowerCase().replace(/[_\-\s]/g, '') }
function formatDuration(sec) { const m = Math.floor(sec / 60); return `${m}:${String(Math.floor(sec % 60)).padStart(2,'0')}` }
function formatSize(bytes) { if (bytes > 1024*1024) return `${(bytes/(1024*1024)).toFixed(1)}MB`; return `${Math.round(bytes/1024)}KB` }

// ─── Componente: player de áudio customizado ─────────────────────────────────
function AudioPlayer({ url, isAgent }) {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef(null)

  // Força carregamento dos metadados (duração) assim que url estiver disponível
  useEffect(() => {
    if (!url || !audioRef.current) return
    const audio = audioRef.current
    audio.load()

    const tryDuration = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('loadedmetadata', tryDuration)
    audio.addEventListener('durationchange', tryDuration)
    // Fallback: tenta após pequeno delay
    const t = setTimeout(tryDuration, 300)

    return () => {
      audio.removeEventListener('loadedmetadata', tryDuration)
      audio.removeEventListener('durationchange', tryDuration)
      clearTimeout(t)
    }
  }, [url])

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(console.error) }
  }

  const bg = isAgent ? 'rgba(255,255,255,0.15)' : 'var(--bg-hover)'
  const fg = isAgent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'
  const accent = isAgent ? 'white' : '#3b82f6'
  const progress = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio ref={audioRef} src={url} preload="metadata"
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onLoadedMetadata={e => { if (isFinite(e.target.duration)) setDuration(e.target.duration) }}
        onEnded={() => { setPlaying(false); setCurrent(0) }} />
      <button onClick={toggle}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
        style={{ backgroundColor: accent, color: isAgent ? '#1d4ed8' : 'white' }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex-1">
        <div className="h-1 rounded-full cursor-pointer" style={{ backgroundColor: bg }}
          onClick={e => {
            if (!audioRef.current || !duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            audioRef.current.currentTime = pct * duration
          }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: accent }} />
        </div>
        <p className="text-xs mt-0.5" style={{ color: fg, fontSize: '10px' }}>
          {formatDuration(playing ? current : duration)}
        </p>
      </div>
      <Volume2 size={12} style={{ color: fg, flexShrink: 0 }} />
    </div>
  )
}

// ─── Componente: imagem recebida ──────────────────────────────────────────────
function ImageAttachment({ att }) {
  const [open, setOpen] = useState(false)
  if (!att.url) return null
  return (
    <>
      <img src={att.url} alt="imagem" onClick={() => setOpen(true)}
        className="rounded-xl max-w-[220px] max-h-[200px] object-cover cursor-zoom-in"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.9)' }} onClick={() => setOpen(false)}>
          <img src={att.url} className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </>
  )
}

// ─── Componente: documento recebido ──────────────────────────────────────────
function DocumentAttachment({ att, isAgent }) {
  const ext = att.extension || att.filename?.split('.').pop()?.toUpperCase() || 'FILE'
  const bg = isAgent ? 'rgba(255,255,255,0.15)' : 'var(--bg-hover)'
  const fg = isAgent ? 'white' : 'var(--text-primary)'
  const sub = isAgent ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)'
  return (
    <a href={att.url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:opacity-80"
      style={{ backgroundColor: bg, minWidth: '180px', maxWidth: '240px' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#3b82f620' }}>
        <FileText size={16} style={{ color: '#60a5fa' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: fg }}>{att.filename}</p>
        <p className="text-xs" style={{ color: sub, fontSize: '10px' }}>
          {ext} {att.fileSize ? `· ${formatSize(att.fileSize)}` : ''}
        </p>
      </div>
      <Download size={13} style={{ color: sub, flexShrink: 0 }} />
    </a>
  )
}

// ─── Componente: bolha de mensagem ───────────────────────────────────────────
// Separa mensagens por data
function groupByDate(messages) {
  const groups = []
  let currentDate = null
  messages.forEach(msg => {
    const d = new Date(msg.timestamp)
    const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    const today = new Date()
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
    let label = dateStr
    if (d.toDateString() === today.toDateString()) label = 'Hoje'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Ontem'
    if (label !== currentDate) {
      groups.push({ type: 'date', label })
      currentDate = label
    }
    groups.push({ type: 'msg', msg })
  })
  return groups
}

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
    </div>
  )
}

function AgentAvatar({ name, avatarUrl, size = 24 }) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
    )
  }
  const initials = name ? name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : '?'
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: '#2563eb', fontSize: size * 0.38 }}>
      {initials}
    </div>
  )
}

function MessageBubble({ msg }) {
  if (msg.sender === 'activity') return null
  const isAgent = msg.sender === 'agent'
  const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hasText = msg.content && msg.content.trim()
  const atts = msg.attachments || []

  return (
    <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'} mb-3 gap-2 animate-fade-in`}>
      {/* Avatar do lead (lado esquerdo) */}
      {!isAgent && (
        <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-white flex-shrink-0 mt-1"
          style={{ fontSize: '10px', fontWeight: 'bold' }}>?</div>
      )}

      <div className="max-w-[78%]">
        {/* Nome do agente acima da mensagem */}
        {isAgent && msg.authorName && (
          <div className="flex items-center gap-1.5 justify-end mb-1">
            <span className="text-xs text-[var(--text-muted)]">{msg.authorName}</span>
            <AgentAvatar name={msg.authorName} avatarUrl={msg.authorAvatarUrl} size={18} />
          </div>
        )}

      <div className={`${isAgent ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'} overflow-hidden`}
        style={{
          backgroundColor: isAgent ? '#2563eb' : 'var(--bg-card)',
          border: isAgent ? 'none' : '1px solid var(--border)',
        }}>
        {/* Texto */}
        {hasText && (
          <div className="px-3 pt-2.5" style={{ color: isAgent ? 'white' : 'var(--text-primary)' }}>
            <p className="text-sm leading-relaxed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
          </div>
        )}

        {/* Attachments */}
        {atts.map(att => (
          <div key={att.id} className={`${hasText ? 'mt-1' : ''} ${atts.length === 1 && att.fileType === 'image' ? '' : 'px-3 py-1'}`}>
            {att.fileType === 'image' && <ImageAttachment att={att} />}
            {att.fileType === 'audio' && <div className="px-2 py-1"><AudioPlayer url={att.url} isAgent={isAgent} /></div>}
            {att.fileType === 'video' && att.url && (
              <video controls className="rounded-xl max-w-[220px]" style={{ maxHeight: '180px' }}>
                <source src={att.url} />
              </video>
            )}
            {att.fileType === 'file' && <DocumentAttachment att={att} isAgent={isAgent} />}
          </div>
        ))}

        {/* Timestamp */}
        <div className="px-3 pb-2 mt-0.5">
          <p className={`text-xs text-right ${isAgent ? 'text-blue-200' : 'text-[var(--text-muted)]'}`}
            style={{ fontSize: '10px' }}>{time}</p>
        </div>
      </div>
      </div>
    </div>
  )
}

// ─── Componente: seletor de coluna ───────────────────────────────────────────
function ColumnMover({ currentColumn, onMove }) {
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const ref = useRef(null)
  const cur = ALL_COLUMNS.find(c => c.id === currentColumn) || ALL_COLUMNS[0]

  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} disabled={moving}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
        style={{ backgroundColor: cur.color + '20', color: cur.color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cur.color }} />
        {moving ? '...' : cur.label}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-52 rounded-xl border border-[var(--border)] shadow-2xl z-50 overflow-hidden animate-slide-up"
          style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Mover para</p>
          </div>
          {ALL_COLUMNS.map(col => (
            <button key={col.id} onClick={async () => {
                setOpen(false)
                const needsModal = col.id === 'agendado' || col.id === 'aguardando_pagamento'
                if (!needsModal) setMoving(true)
                await onMove(col.id)
                if (!needsModal) setMoving(false)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
              <span className="text-sm flex-1" style={{ color: col.id === currentColumn ? col.color : 'var(--text-secondary)' }}>{col.label}</span>
              {col.id === currentColumn && <Check size={13} style={{ color: col.color }} />}
            </button>
          ))}
          {/* Divider + Finalizar Conversa */}
          <div className="border-t border-[var(--border)]" />
          <button onClick={async () => {
              setOpen(false)
              setMoving(true)
              await onMove('__resolve__')
              setMoving(false)
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-green-500/10 transition-colors text-left">
            <Check size={14} className="text-green-500" />
            <span className="text-sm flex-1 text-green-400 font-semibold">Finalizar Conversa</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Componente: atribuir agente ─────────────────────────────────────────────
function AgentAssigner({ conversationId, currentAssigneeName, onAssigned }) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(null)

  // Carrega agentes uma vez
  useEffect(() => {
    api.getAgents()
      .then(data => setAgents(Array.isArray(data) ? data : []))
      .catch(e => console.error('getAgents failed:', e))
  }, [])

  const assign = async (agent) => {
    setOpen(false)
    setAssigning(agent.name)
    try {
      await api.assignAgent(conversationId, agent.id)
      onAssigned && onAssigned(agent)
    } catch (e) { console.error('assignAgent failed:', e) }
    finally { setAssigning(null) }
  }

  const displayName = assigning || (currentAssigneeName ? currentAssigneeName.split(' ')[0] : 'Atribuir')

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
        style={{ backgroundColor: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
        {assigning ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
        {displayName}
        <ChevronDown size={10} />
      </button>

      {/* Modal centralizado — nunca cortado */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}>
          <div className="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>

            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Atribuir conversa</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Escolha quem vai atender</p>
            </div>

            <div className="py-1 max-h-64 overflow-y-auto">
              {agents.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] px-4 py-4 text-center">
                  Carregando agentes...
                </p>
              )}
              {agents.map(a => {
                const isActive = a.name === currentAssigneeName
                const roleColor = a.role === 'supervisor' ? '#60a5fa' : '#34d399'
                return (
                  <button key={a.id} onClick={() => assign(a)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                    style={isActive ? { backgroundColor: 'rgba(59,130,246,0.08)' } : {}}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: roleColor + '30', color: roleColor }}>
                      {a.avatarUrl
                        ? <img src={a.avatarUrl} alt={a.name} className="w-full h-full rounded-xl object-cover" />
                        : a.avatar
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{a.name}</p>
                      <p className="text-xs capitalize" style={{ color: roleColor }}>{a.role}</p>
                    </div>
                    {isActive && <Check size={14} className="text-blue-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>

            <div className="px-4 py-3 border-t border-[var(--border)]">
              <button onClick={() => setOpen(false)}
                className="w-full py-2 rounded-xl text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Componente: painel de etiquetas ─────────────────────────────────────────
// ─── Barra unificada: etapa + humano ────────────────────────────────────────────
function UnifiedBar({ conversationId, initialLabels, currentColumn, product, assigneeName, onAssigned, onMove, onResolve }) {
  const [labels, setLabels] = useState(initialLabels || [])
  const [showMenu, setShowMenu] = useState(false)
  const [togglingHumano, setTogglingHumano] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { setLabels(initialLabels || []) }, [JSON.stringify(initialLabels)])

  const hasHumano = labels.some(l => l.toLowerCase() === 'humano')
  const hasCancelado = labels.some(l => l.toLowerCase() === 'cancelado')
  const [togglingCancelado, setTogglingCancelado] = useState(false)

  const toggleCancelado = async () => {
    setTogglingCancelado(true)
    try {
      const updated = hasCancelado
        ? labels.filter(l => l.toLowerCase() !== 'cancelado')
        : [...labels, 'cancelado']
      setLabels(updated)
      await api.setConversationLabels(conversationId, updated)
    } catch { setLabels(labels) }
    finally { setTogglingCancelado(false) }
  }
  const curCol = ALL_COLUMNS.find(c => c.id === currentColumn) || ALL_COLUMNS[0]

  const toggleHumano = async () => {
    setTogglingHumano(true)
    try {
      const updated = hasHumano
        ? labels.filter(l => l.toLowerCase() !== 'humano')
        : [...labels, 'humano']
      setLabels(updated)
      await api.setConversationLabels(conversationId, updated)
    } catch { setLabels(labels) }
    finally { setTogglingHumano(false) }
  }

  const moveToColumn = (col) => {
    setShowMenu(false)
    setSearch('')
    onMove(col.id)
  }

  const filteredCols = ALL_COLUMNS.filter(c =>
    c.id !== currentColumn &&
    (!search || c.label.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex-shrink-0 border-b border-[var(--border)]">
      {/* Linha única: tudo junto, compacto */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
        {/* Etapa — clica para mover */}
        <button onClick={() => setShowMenu(o => !o)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold transition-all active:scale-95"
          style={{ backgroundColor: curCol.color + '18', color: curCol.color,
            border: `1px solid ${curCol.color}28`, fontSize: '10px' }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: curCol.color }} />
          {curCol.label}
          <ChevronDown size={8} />
        </button>

        {/* Toggle humano */}
        <button onClick={toggleHumano} disabled={togglingHumano}
          title={hasHumano ? 'Reativar robô' : 'Desativar robô'}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{ fontSize: '10px', ...(hasHumano
            ? { backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }
            : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }) }}>
          {togglingHumano ? '·' : hasHumano
            ? <>🤝 humano <span style={{opacity:0.5,fontSize:'8px'}}>·off</span></>
            : <><span style={{opacity:0.35}}>🤖</span> humano</>}
        </button>

        {/* Toggle cancelado */}
        <button onClick={toggleCancelado} disabled={togglingCancelado}
          title={hasCancelado ? 'Desmarcar cancelado' : 'Cancelar plano'}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{ fontSize: '10px', ...(hasCancelado
            ? { backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
            : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }) }}>
          {togglingCancelado ? '·' : <>✕ {hasCancelado ? 'Cancelado' : 'Cancelar'}</>}
        </button>

        {/* Agente — alinhado à direita */}
        <div className="ml-auto">
          <AgentAssigner conversationId={conversationId} currentAssigneeName={assigneeName} onAssigned={onAssigned} />
        </div>
      </div>

      {/* Modal de seleção de etapa */}
      {showMenu && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowMenu(false); setSearch('') } }}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}>
          <div className="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>

            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Mover para etapa</p>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar etapa..." className="input-theme text-sm py-2" />
            </div>

            {/* Lista de etapas */}
            <div className="max-h-[50vh] overflow-y-auto py-1">
              {filteredCols.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] px-4 py-4 text-center">Nenhuma etapa encontrada</p>
              )}
              {filteredCols.map(col => (
                <button key={col.id} onClick={() => moveToColumn(col)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] text-left transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: col.color + '18' }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  </div>
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{col.label}</span>
                  <ArrowRight size={14} style={{ color: col.color, opacity: 0.6 }} />
                </button>
              ))}
            </div>

            {/* Fechar */}
            <div className="px-4 py-3 border-t border-[var(--border)]">
              <button onClick={() => { setShowMenu(false); setSearch('') }}
                className="w-full py-2 rounded-xl text-sm text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// Labels que representam posição no kanban — não mostrar como chips avulsos
// A única label "livre" típica é 'humano' (desativa bot) e outras personalizadas
const KANBAN_LABEL_KEYS = new Set([
  'lead','leads','bot',
  'negociacao','negociação','em_negociacao','em_negociação',
  'aguardando_cotacao','aguardando_cotação','cotacao','cotação','aguardando-cotacao',
  'aguardando_documentacao','aguardando_documentação','documentacao',
  'agendado','agendamento',
  'lancar_venda','lançar_venda','lancar-venda','lançar-venda','venda',
  'aguardando_pagamento','aguardando-pagamento','pagamento',
  'pago','pago_confirmado','fechado',
  'sem_retorno','sem-retorno','sem retorno','perdido','inativo',
])

function isKanbanLabel(label) {
  return KANBAN_LABEL_KEYS.has(label.toLowerCase().trim())
}

function LabelsPanel({ conversationId, initialLabels, currentColumn, onColumMigrate }) {
  const [labels, setLabels] = useState(initialLabels || [])
  const [allLabels, setAllLabels] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [togglingHumano, setTogglingHumano] = useState(false)
  const ref = useRef(null)

  // Sincroniza quando selectedLead.labels muda (via socket)
  useEffect(() => { setLabels(initialLabels || []) }, [JSON.stringify(initialLabels)])

  useEffect(() => {
    api.getAccountLabels().then(setAllLabels).catch(() => {})
  }, [])

  useEffect(() => {
    if (!showAdd) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setShowAdd(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showAdd])

  // Apenas labels não-kanban para exibir
  const displayLabels = labels.filter(l => !isKanbanLabel(l))
  const hasHumano = displayLabels.some(l => l.toLowerCase() === 'humano')
  const otherLabels = displayLabels.filter(l => l.toLowerCase() !== 'humano')

  // Toggle da label humano — sincroniza com Chatwoot
  const toggleHumano = async () => {
    setTogglingHumano(true)
    try {
      let updated
      if (hasHumano) {
        updated = labels.filter(l => l.toLowerCase() !== 'humano')
      } else {
        updated = [...labels, 'humano']
      }
      setLabels(updated)
      await api.setConversationLabels(conversationId, updated)
    } catch (e) {
      console.error(e)
      setLabels(labels) // reverte
    } finally {
      setTogglingHumano(false)
    }
  }

  const addLabel = async (label) => {
    const title = label.title || label
    if (isKanbanLabel(title)) return // segurança extra
    const updated = [...new Set([...labels, title])]
    setLabels(updated)
    setShowAdd(false)
    setSearch('')
    await api.setConversationLabels(conversationId, updated).catch(console.error)
  }

  const removeLabel = async (label) => {
    const updated = labels.filter(l => l !== label)
    setLabels(updated)
    await api.setConversationLabels(conversationId, updated).catch(console.error)
  }

  // Labels livres disponíveis para adicionar (não kanban, não humano, não já presente)
  const filteredFree = allLabels.filter(l => {
    const title = l.title || l
    if (isKanbanLabel(title)) return false
    if (title.toLowerCase() === 'humano') return false
    if (labels.some(e => e.toLowerCase() === title.toLowerCase())) return false
    return title.toLowerCase().includes(search.toLowerCase())
  })

  // Colunas do kanban filtradas para o dropdown (exclui coluna atual)
  const kanbanOptions = ALL_COLUMNS.filter(c => {
    if (c.id === currentColumn) return false
    return c.label.toLowerCase().includes(search.toLowerCase()) ||
           c.id.toLowerCase().includes(search.toLowerCase())
  })

  const hasResults = filteredFree.length > 0 || kanbanOptions.length > 0

  const colLabel = {
    leads:'Leads', negociacao:'Negociação', aguardando_cotacao:'Ag. Cotação',
    agendado:'Agendado', lancar_venda:'Lançar Venda', aguardando_pagamento:'Ag. Pgto',
    pago:'Pago ✓', sem_retorno:'Sem Retorno'
  }[currentColumn] || currentColumn
  const colColor = {
    leads:'#3b82f6', negociacao:'#8b5cf6', aguardando_cotacao:'#f59e0b',
    agendado:'#06b6d4', lancar_venda:'#10b981', aguardando_pagamento:'#f97316',
    pago:'#22c55e', sem_retorno:'#6b7280'
  }[currentColumn] || '#3b82f6'

  return (
    <div className="px-4 py-2 flex-shrink-0 border-b border-[var(--border)]">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Tag size={11} className="text-[var(--text-muted)] flex-shrink-0" />

        {/* Etapa atual — chip fixo, não removível. Clica em + Etiqueta para mudar */}
        <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold"
          style={{ backgroundColor: colColor + '20', color: colColor, border: `1px solid ${colColor}40` }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colColor }} />
          {colLabel}
        </span>

        {/* Toggle HUMANO — desativa/ativa o robô */}
        <button
          onClick={toggleHumano}
          disabled={togglingHumano}
          title={hasHumano ? "Clique para reativar o robô" : "Clique para desativar o robô (atendimento humano)"}
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold transition-all hover:opacity-80 disabled:opacity-50"
          style={hasHumano
            ? { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
            : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
          }
        >
          {togglingHumano ? <span style={{ fontSize: '9px' }}>...</span>
            : hasHumano
              ? <><span>🤝</span><span>humano</span><span style={{ fontSize: '9px', opacity: 0.7 }}> · bot off</span></>
              : <><span style={{ opacity: 0.4 }}>🤖</span><span>humano</span></>
          }
        </button>

        {/* Outras labels livres */}
        {otherLabels.map(label => {
          const c = labelColor(label)
          return (
            <span key={label}
              className="flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full font-medium group"
              style={{ backgroundColor: c + '18', color: c, border: `1px solid ${c}30` }}>
              <span>{label}</span>
              <button onClick={() => removeLabel(label)}
                className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                <X size={9} />
              </button>
            </span>
          )
        })}

        {/* Botão dropdown — move kanban OU adiciona label livre */}
        <div className="relative" ref={ref}>
          <button onClick={() => setShowAdd(o => !o)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-all hover:opacity-80"
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            <Plus size={9} /> Etiqueta
          </button>

          {showAdd && (
            <div className="absolute top-full left-0 mt-1 w-56 rounded-xl border border-[var(--border)] shadow-2xl z-50 overflow-hidden animate-slide-up"
              style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="p-2 border-b border-[var(--border)]">
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar etapa ou etiqueta..." className="input-theme text-xs py-1.5" />
              </div>

              <div className="max-h-56 overflow-y-auto">
                {!hasResults && (
                  <p className="text-xs text-[var(--text-muted)] px-3 py-2 italic">Nenhuma encontrada</p>
                )}

                {/* ── Mover para coluna (etapas do kanban) ── */}
                {kanbanOptions.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-b border-[var(--border)]">
                      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
                        Mover para etapa
                      </p>
                    </div>
                    {kanbanOptions.map(col => (
                      <button key={col.id}
                        onClick={() => { setShowAdd(false); setSearch(''); onColumMigrate(col.id) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--bg-hover)] text-left transition-colors">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                        <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{col.label}</span>
                        <ArrowRight size={12} style={{ color: col.color, opacity: 0.7 }} />
                      </button>
                    ))}
                  </>
                )}

                {/* ── Etiquetas livres (informativas) ── */}
                {filteredFree.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 border-t border-[var(--border)]">
                      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
                        Etiquetas
                      </p>
                    </div>
                    {filteredFree.map(l => {
                      const title = l.title || l
                      const c = l.color || labelColor(title)
                      return (
                        <button key={title} onClick={() => addLabel(l)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] text-left transition-colors">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                          <span className="text-sm text-[var(--text-secondary)]">{title}</span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente: preview de arquivo/imagem antes de enviar ─────────────────────
function FilePreview({ pending, onSend, onCancel, sending }) {
  const { file, url, fileType } = pending
  const sizeMB = file.size > 1024*1024
    ? `${(file.size/1024/1024).toFixed(1)} MB`
    : `${Math.round(file.size/1024)} KB`

  return (
    <div className="rounded-xl overflow-hidden animate-slide-up"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>

      {/* Preview de imagem */}
      {fileType === 'image' && url && (
        <div className="relative">
          <img src={url} alt="preview"
            className="w-full max-h-48 object-cover"
            style={{ display: 'block' }} />
          {/* X no canto da imagem */}
          <button onClick={onCancel}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Preview de documento */}
      {fileType === 'file' && (
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
            <FileText size={20} style={{ color: '#60a5fa' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{sizeMB}</p>
          </div>
          {/* X no documento */}
          <button onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Barra de ação: cancel + send */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--border)]">
        {/* Info */}
        <div className="flex-1 min-w-0">
          {fileType === 'image'
            ? <p className="text-xs text-[var(--text-muted)] truncate">📷 {file.name} · {sizeMB}</p>
            : null
          }
        </div>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1.5">
          <X size={12} /> Cancelar
        </button>
        <button onClick={onSend} disabled={sending}
          className="px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
          style={{ backgroundColor: '#2563eb', color: 'white' }}>
          {sending
            ? <><Loader2 size={12} className="animate-spin" /> Enviando...</>
            : <><Send size={12} /> Enviar</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Componente: gravação de áudio ───────────────────────────────────────────
function RecordingBar({ onStop, onCancel }) {
  const [duration, setDuration] = useState(0)
  const canvasRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const animRef = useRef(null)
  const streamRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    let timer
    const start = async () => {
      if (startedRef.current) return
      startedRef.current = true
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        audioCtx.createMediaStreamSource(stream).connect(analyser)
        analyserRef.current = analyser

        // Waveform animation
        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          const data = new Uint8Array(analyser.frequencyBinCount)
          const draw = () => {
            animRef.current = requestAnimationFrame(draw)
            analyser.getByteFrequencyData(data)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            const bw = (canvas.width / data.length) * 1.8
            let x = 0
            for (let i = 0; i < data.length; i++) {
              const h = Math.max(2, (data[i] / 255) * canvas.height * 0.85)
              const alpha = 0.3 + (data[i] / 255) * 0.7
              ctx.fillStyle = `rgba(59,130,246,${alpha})`
              ctx.beginPath()
              if (ctx.roundRect) ctx.roundRect(x, (canvas.height - h) / 2, bw - 1, h, 2)
              else ctx.rect(x, (canvas.height - h) / 2, bw - 1, h)
              ctx.fill()
              x += bw
            }
          }
          draw()
        }

        // Escolhe o melhor formato suportado pelo browser
        // OGG/OPUS = compatível com WhatsApp Android
        // MP4/AAC = compatível com iOS
        // WEBM = fallback
        const mimeType =
          MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' :
          MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' :
          MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
          'audio/webm'

        const mr = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = mr
        chunksRef.current = []
        // timeslice=100ms: coleta dados a cada 100ms para blob mais preciso
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          onStop(blob, mimeType)
          stream.getTracks().forEach(t => t.stop())
          cancelAnimationFrame(animRef.current)
          audioCtx.close()
        }
        mr.start(100)  // coleta a cada 100ms

        // Timer
        timer = setInterval(() => setDuration(d => d + 1), 1000)
      } catch (err) {
        console.error('Mic error:', err)
        onCancel()
      }
    }
    start()
    return () => {
      clearInterval(timer)
      cancelAnimationFrame(animRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  const stop = () => mediaRecorderRef.current?.stop()

  const cancel = () => {
    mediaRecorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    cancelAnimationFrame(animRef.current)
    onCancel()
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* REC indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-mono font-bold text-red-400">{formatDuration(duration)}</span>
      </div>

      {/* Waveform */}
      <canvas ref={canvasRef} width={160} height={32} className="flex-1 rounded-lg"
        style={{ backgroundColor: 'rgba(59,130,246,0.05)' }} />

      {/* Cancelar */}
      <button onClick={cancel}
        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0">
        <Trash2 size={15} />
      </button>

      {/* Enviar */}
      <button onClick={stop}
        className="p-1.5 rounded-lg flex-shrink-0 transition-all"
        style={{ backgroundColor: '#2563eb', color: 'white' }}>
        <Check size={15} />
      </button>
    </div>
  )
}

// ─── Componente: preview de áudio antes de enviar ────────────────────────────
function AudioPreview({ blob, onSend, onCancel, sending }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  if (!url) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex-1">
        <AudioPlayer url={url} isAgent={false} />
      </div>
      <button onClick={onCancel}
        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 flex-shrink-0">
        <X size={15} />
      </button>
      <button onClick={onSend} disabled={sending}
        className="px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 flex items-center gap-1 disabled:opacity-50"
        style={{ backgroundColor: '#2563eb', color: 'white' }}>
        {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        Enviar
      </button>
    </div>
  )
}

// ─── Componente principal: ChatPanel ─────────────────────────────────────────
// ─── TemplateManager ─────────────────────────────────────────────────────────
function TemplateManager({ templates, setTemplates, onClose }) {
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    if (!newTitle.trim() || !newContent.trim()) { setError('Preencha título e mensagem'); return }
    setSaving(true); setError('')
    try {
      const d = await api.createTemplate(newTitle.trim(), newContent.trim())
      setTemplates(prev => [...prev, d.template])
      setNewTitle(''); setNewContent('')
    } catch { setError('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id) => {
    await api.deleteTemplate(id).catch(() => {})
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const startEdit = (t) => {
    setEditingId(t.id); setEditTitle(t.title); setEditContent(t.content)
  }

  const saveEdit = async () => {
    if (!editTitle.trim() || !editContent.trim()) return
    setSaving(true)
    try {
      // Deleta e recria (simplificado)
      await api.deleteTemplate(editingId)
      const d = await api.createTemplate(editTitle.trim(), editContent.trim())
      setTemplates(prev => prev.map(t => t.id === editingId ? d.template : t))
      setEditingId(null)
    } catch { setError('Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Mensagens Rápidas</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Use <span className="font-mono bg-blue-500/10 text-blue-400 px-1 rounded">/</span> no chat para acessar</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        {/* Lista de templates */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
              {editingId === t.id ? (
                /* Modo edição */
                <div className="p-3 space-y-2" style={{ backgroundColor: 'rgba(59,130,246,0.04)' }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="Título"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    placeholder="Mensagem... use {{nome}} para o nome do cliente"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ backgroundColor: '#2563eb', color: 'white' }}>
                      {saving ? '...' : 'Salvar'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-4 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div className="flex items-start gap-3 p-3 hover:bg-[var(--bg-hover)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{t.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed line-clamp-2">{t.content}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(t)}
                      title="Editar"
                      className="p-1.5 rounded-lg hover:bg-blue-500/10 text-[var(--text-muted)] hover:text-blue-400 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => remove(t.id)}
                      title="Excluir"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Adicionar novo */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex-shrink-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Nova mensagem rápida</p>
          <div className="space-y-2">
            <input value={newTitle} onChange={e => { setNewTitle(e.target.value); setError('') }}
              placeholder='Título (ex: "Saudação inicial")'
              className="w-full px-3 py-2 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            <textarea value={newContent} onChange={e => { setNewContent(e.target.value); setError('') }}
              placeholder={'Mensagem... use {{nome}} para o nome do cliente'}
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button onClick={create} disabled={saving || !newTitle.trim() || !newContent.trim()}
                className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ backgroundColor: '#2563eb', color: 'white' }}>
                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : '+ Adicionar'}
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              💡 Use <span className="font-mono text-blue-400">{'{{nome}}'}</span> para inserir o nome do cliente automaticamente
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── NotesPanel ──────────────────────────────────────────────────────────────
function NotesPanel({ conversationId, notes, setNotes }) {
  const [noteInput, setNoteInput] = useState('')
  const [saving, setSaving] = useState(false)
  const { currentAgent } = useApp()

  const addNote = async () => {
    if (!noteInput.trim() || saving) return
    setSaving(true)
    try {
      const data = await api.addNote(conversationId, noteInput.trim())
      setNotes(prev => [data.note, ...prev])
      setNoteInput('')
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const deleteNote = async (noteId) => {
    await api.deleteNote(conversationId, noteId).catch(() => {})
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Input de nova nota */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <p className="text-xs text-[var(--text-muted)] mb-2">
          📝 Notas internas — <span style={{ color: '#f59e0b' }}>não aparecem para o cliente</span>
        </p>
        <div className="flex gap-2">
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote() }}
            placeholder="Adicionar nota interna... (Ctrl+Enter para salvar)"
            rows={3}
            className="flex-1 text-sm p-2.5 rounded-xl resize-none outline-none"
            style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--text-primary)' }}
          />
          <button onClick={addNote} disabled={saving || !noteInput.trim()}
            className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </div>
      </div>

      {/* Lista de notas */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <StickyNote size={28} className="text-[var(--text-muted)]" style={{ opacity: 0.3 }} />
            <p className="text-sm text-[var(--text-muted)]">Nenhuma nota ainda</p>
          </div>
        ) : notes.map(note => (
          <div key={note.id} className="group rounded-xl p-3"
            style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-[var(--text-primary)] leading-relaxed flex-1 whitespace-pre-wrap">{note.content}</p>
              <button onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-400 hover:text-red-300 flex-shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500/30 flex items-center justify-center">
                <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 700 }}>
                  {(note.author || 'A').slice(0, 1)}
                </span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{note.author}</span>
              <span className="text-xs text-[var(--text-muted)]">·</span>
              <span className="text-xs text-[var(--text-muted)]">
                {note.createdAt ? new Date(note.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const QUICK_EMOJIS = [
  '😊','😃','😄','🙂','😁','😂','🤣','👍','🙏','❤',
  '✅','🔥','💪','🎉','👏','😍','🤝','💯','⭐','🚀',
  '😅','😉','😎','🤔','😮','😢','😡','🥰','😇','🤩',
  '📞','📱','💬','📋','💰','🏠','🚗','📅','⏰','✉',
]

export default function ChatPanel() {
  const { selectedLead, setSelectedLead, setScheduleModal, setPaymentModal, applyPendingMove, unreadCounts, setUnreadCounts, unreadUpdatedAt } = useApp()
  const [messages, setMessages] = useState([])
  const [currentColumn, setCurrentColumn] = useState(null)
  const [assigneeName, setAssigneeName] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingInit, setLoadingInit] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])  // múltiplos arquivos

  const [isLive, setIsLive] = useState(false)
  const [moveToast, setMoveToast] = useState(null)
  const [activeTab, setActiveTab] = useState('chat')  // 'chat' | 'notas'
  const [notes, setNotes] = useState([])
  const [noteInput, setNoteInput] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [slashMenu, setSlashMenu] = useState({ open: false, query: '', filtered: [] })
  const [showTplManager, setShowTplManager] = useState(false)
  const textareaRef = useRef(null)

  // Auto-resize textarea ao digitar (estilo WhatsApp)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const newH = Math.min(el.scrollHeight, 160)  // máximo 160px (~6 linhas)
    el.style.height = newH + 'px'
  }, [input])
  const [contactTyping, setContactTyping] = useState(false)
  const typingTimeoutRef = useRef(null)
  const typingDebounceRef = useRef(null)
  // Áudio
  const [recordingMode, setRecordingMode] = useState(false) // gravando
  const [audioBlob, setAudioBlob] = useState(null)          // preview de áudio
  const [pendingFile, setPendingFile] = useState(null)       // preview de imagem/arquivo { file, url, fileType }
  const [sendingAudio, setSendingAudio] = useState(false)
  // Refs
  const messagesEndRef = useRef(null)
  const scrollRef = useRef(null)
  const prevScrollHeight = useRef(0)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)

  // ── Socket status ──────────────────────────────────────────────────────────
  useEffect(() => {
    import('../../lib/socket').then(({ getSocket }) => {
      const s = getSocket()
      const onC = () => setIsLive(true)
      const onD = () => setIsLive(false)
      s.on('connect', onC); s.on('disconnect', onD)
      if (s.connected) setIsLive(true)
      return () => { s.off('connect', onC); s.off('disconnect', onD) }
    })
  }, [])

  // ── Mensagem nova em tempo real ────────────────────────────────────────────
  // Indicador de digitando — cliente digitando no WhatsApp
  useSocket('contact_typing', ({ conversationId, isTyping }) => {
    if (!selectedLead || String(conversationId) !== String(selectedLead.id)) return
    setContactTyping(isTyping)
    clearTimeout(typingTimeoutRef.current)
    if (isTyping) {
      // Auto-remove após 5s se não vier outro evento
      typingTimeoutRef.current = setTimeout(() => setContactTyping(false), 5000)
    }
  })

  // Nova nota adicionada por outro agente
  useSocket('note_added', ({ conversationId, note }) => {
    if (!selectedLead || String(conversationId) !== String(selectedLead.id)) return
    setNotes(prev => [note, ...prev.filter(n => n.id !== note.id)])
  })

  useSocket('new_message', ({ conversationId, message }) => {
    if (!selectedLead || String(conversationId) !== String(selectedLead.id)) return
    setMessages(prev => {
      // Dedup por id exato
      if (prev.find(m => m.id === message.id)) return prev
      // Dedup por optimistic: se agente enviou e tem msg optimistic com mesmo conteúdo, substitui
      if (message.sender === 'agent') {
        const optIdx = prev.findIndex(m =>
          String(m.id).startsWith('opt-') &&
          m.sender === 'agent' &&
          m.content === message.content
        )
        if (optIdx !== -1) {
          const next = [...prev]
          next[optIdx] = message
          return next
        }
      }
      return [...prev, message]
    })
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  })

  // ── Sync ao trocar de lead ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedLead) return
    setCurrentColumn(selectedLead.column)
    setAssigneeName(selectedLead.assigneeName || '')
    setMessages([])
    setHasMore(false)
    setLoadingInit(true)
    setActiveTab('chat')
    setNotes([])
    setContactTyping(false)
    // markAsRead já tratado pelo setSelectedLead no AppContext
    // Garante zerar localmente por segurança
    const lid = String(selectedLead.id)
    setUnreadCounts(prev => ({ ...prev, [lid]: 0 }))
    if (unreadUpdatedAt?.current) unreadUpdatedAt.current[lid] = new Date().toISOString()
    // Carrega notas
    api.getNotes(selectedLead.id).then(d => setNotes(d.notes || [])).catch(() => {})
    // Carrega templates (uma vez)
    if (templates.length === 0) api.getTemplates().then(d => setTemplates(d.templates || [])).catch(() => {})
    api.getMessages(selectedLead.id)
      .then(data => { setMessages(data.messages); setHasMore(data.hasMore) })
      .catch(console.error)
      .finally(() => setLoadingInit(false))
  }, [selectedLead?.id])

  useEffect(() => {
    if (!loadingInit && messages.length) setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100)
  }, [loadingInit, selectedLead?.id])

  useEffect(() => {
    if (loadingMore) prevScrollHeight.current = scrollRef.current?.scrollHeight || 0
    else if (scrollRef.current && prevScrollHeight.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevScrollHeight.current
      prevScrollHeight.current = 0
    }
  }, [messages.length, loadingMore])

  const loadOlder = useCallback(async () => {
    if (!selectedLead || !hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await api.getMessages(selectedLead.id, messages[0]?.id)
      setMessages(prev => [...data.messages, ...prev])
      setHasMore(data.hasMore)
    } catch (e) { console.error(e) }
    finally { setLoadingMore(false) }
  }, [selectedLead, messages, hasMore, loadingMore])

  // ── Mover coluna ──────────────────────────────────────────────────────────
  // Finalizar conversa — remove do kanban, volta para leads se cliente responder
  const handleFinalize = useCallback(async () => {
    if (!selectedLead) return
    if (!confirm(`Finalizar conversa com "${selectedLead.name}"?\n\nSai do Kanban. Se o cliente responder, volta para Leads.`)) return
    try {
      await api.finalizeLead(selectedLead.id)
      setMoveToast({ text: '✓ Conversa finalizada', color: '#22c55e' })
      setTimeout(() => setMoveToast(null), 2500)
      setSelectedLead(null)
    } catch (e) { console.error('Finalize failed:', e) }
  }, [selectedLead, setSelectedLead])

  // handleMove é chamado tanto pelo ColumnMover quanto pelas etiquetas na conversa
  // Para 'agendado' e 'aguardando_pagamento' abre o modal antes de mover
  const handleMove = useCallback(async (column) => {
    if (!selectedLead) return

    if (column === 'agendado') {
      setScheduleModal({ lead: selectedLead })
      return
    }
    if (column === 'aguardando_pagamento') {
      setPaymentModal({ lead: selectedLead })
      return
    }
    if (column === '__resolve__') {
      if (!confirm(`Finalizar conversa com "${selectedLead.name}"?\n\nA conversa será marcada como resolvida. Se o cliente enviar nova mensagem, ela volta automaticamente para Leads.`)) return
      try {
        await api.finalizeLead(selectedLead.id)
        setMoveToast({ text: `✓ Conversa finalizada`, color: '#22c55e' })
        setTimeout(() => setMoveToast(null), 2500)
        setSelectedLead(null)
      } catch (e) { console.error('Resolve failed:', e) }
      return
    }

    // Move INSTANTANEAMENTE no kanban (otimista) antes de chamar a API
    applyPendingMove(selectedLead, column)
    setCurrentColumn(column)
    const col = ALL_COLUMNS.find(c => c.id === column)
    setMoveToast({ text: `Movido → ${col?.label}`, color: col?.color || '#3b82f6' })
    setTimeout(() => setMoveToast(null), 2500)
    setSelectedLead({ ...selectedLead, column })

    // API em background
    api.moveLead(selectedLead.id, column).catch(e => {
      console.error('Move failed:', e)
      // Reverte se falhar
      setCurrentColumn(selectedLead.column)
      setSelectedLead({ ...selectedLead })
    })
  }, [selectedLead, setSelectedLead, setScheduleModal, setPaymentModal, applyPendingMove])

  // ── Enviar texto ──────────────────────────────────────────────────────────
  // Fecha emoji picker ao clicar fora
  const handleCloseEmoji = () => setShowEmoji(false)

  const handleSend = async () => {
    if (!input.trim() || !selectedLead || sending) return
    const content = input.trim(); setInput(''); setSending(true)
    const opt = { id: `opt-${Date.now()}`, sender: 'agent', content, timestamp: new Date().toISOString(), attachments: [] }
    setMessages(prev => [...prev, opt])
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    // Optimistic: ao responder um lead não atendido → move para negociação
    const col = currentColumn || selectedLead.column
    if (col === 'leads') {
      applyPendingMove(selectedLead, 'negociacao')
      setCurrentColumn('negociacao')
      setSelectedLead({ ...selectedLead, column: 'negociacao' })
      api.moveLead(selectedLead.id, 'negociacao').catch(() => {})
    }

    try { await api.sendMessage(selectedLead.id, content) }
    catch (e) { console.error(e) }
    finally { setSending(false) }
  }

  // ── Enviar arquivo (imagem/documento) ─────────────────────────────────────
  // Seleciona arquivo → mostra preview com X para cancelar antes de enviar
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !selectedLead) return
    // Múltiplos arquivos: envia em fila
    setPendingFiles(files.map(file => {
      const isImage = file.type.startsWith('image/')
      return { file, url: isImage ? URL.createObjectURL(file) : null, fileType: isImage ? 'image' : 'file' }
    }))
  }

  // Confirma e envia arquivo(s) após preview
  const handleSendFile = async () => {
    // Suporte a múltiplos via pendingFiles
    const filesToSend = pendingFiles.length > 0 ? pendingFiles : (pendingFile ? [pendingFile] : [])
    if (!filesToSend.length || !selectedLead) return
    setPendingFiles([])
    setPendingFile(null)
    for (const { file, url, fileType } of filesToSend) {
      const opt = {
        id: `opt-${Date.now()}-${file.name}`, sender: 'agent', content: '', timestamp: new Date().toISOString(),
        attachments: [{ id: 'opt', fileType, url: url || '', filename: file.name, fileSize: file.size }]
      }
      setMessages(prev => [...prev, opt])
      try {
        const fd = new FormData(); fd.append('file', file)
        await api.sendAttachment(selectedLead.id, fd)
      } catch (e) { console.error(e) }
    }
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // ── Áudio: parou de gravar → preview ──────────────────────────────────────
  const handleRecordStop = (blob, mimeType) => {
    setRecordingMode(false)
    setAudioBlob({ blob, mimeType: mimeType || 'audio/webm' })
  }

  // ── Áudio: enviar ─────────────────────────────────────────────────────────
  const handleSendAudio = async () => {
    if (!audioBlob || !selectedLead) return
    const { blob, mimeType } = audioBlob
    // Extensão correta por MIME type
    const ext = mimeType.includes('ogg') ? 'ogg' :
                mimeType.includes('mp4') ? 'm4a' : 'webm'
    const filename = `audio.${ext}`

    setSendingAudio(true)
    const previewUrl = URL.createObjectURL(blob)
    const opt = {
      id: `opt-${Date.now()}`, sender: 'agent', content: '', timestamp: new Date().toISOString(),
      attachments: [{ id: 'opt', fileType: 'audio', url: previewUrl, filename, fileSize: blob.size }]
    }
    setMessages(prev => [...prev, opt])
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    try {
      const fd = new FormData()
      fd.append('file', blob, filename)
      await api.sendAttachment(selectedLead.id, fd)
    } catch (e) { console.error(e) }
    finally { setSendingAudio(false); setAudioBlob(null) }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (!selectedLead) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Ícone animado */}
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '2px solid rgba(59,130,246,0.15)' }}>
            <MessageCircle size={36} className="text-blue-400" style={{ opacity: 0.7 }} />
          </div>
          {/* Pulsing ring */}
          <div className="absolute inset-0 rounded-3xl animate-ping"
            style={{ border: '2px solid rgba(59,130,246,0.2)', animationDuration: '2s' }} />
        </div>

        <div className="text-center px-6">
          <p className="text-base font-semibold text-[var(--text-primary)] mb-1">
            Nenhuma conversa selecionada
          </p>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            Clique em qualquer card do kanban<br/>para abrir a conversa aqui
          </p>
        </div>

        {/* Dica visual */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs"
          style={{ backgroundColor: 'rgba(59,130,246,0.06)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.12)' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Aguardando seleção
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-secondary)] relative animate-slide-in-right">
      {/* Toast */}
      {moveToast && (
        <div className="absolute top-3 left-3 right-3 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium animate-slide-up shadow-lg"
          style={{ backgroundColor: moveToast.color + '20', color: moveToast.color, border: `1px solid ${moveToast.color}40` }}>
          <ArrowRight size={14} />{moveToast.text}
        </div>
      )}

      {/* ── Tabs: Chat / Notas ── */}
      <div className="flex items-center px-4 border-b border-[var(--border)] flex-shrink-0 gap-0">
        {[
          { id: 'chat', label: 'Chat', Icon: MessageCircle },
          { id: 'notas', label: `Notas${notes.length > 0 ? ` (${notes.length})` : ''}`, Icon: StickyNote },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all"
            style={activeTab === id
              ? { borderColor: '#3b82f6', color: '#60a5fa' }
              : { borderColor: 'transparent', color: 'var(--text-muted)' }}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-shrink-0">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {selectedLead.avatar}
        </div>
        {/* Nome + telefone — sempre visíveis */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">{selectedLead.name}</p>
          <p className="font-mono text-[var(--text-muted)] truncate leading-tight" style={{ fontSize: '11px' }}>
            {selectedLead.phone}
          </p>
        </div>
        {/* Ações: Live + Finalizar + X — compactos */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: isLive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
              color: isLive ? '#10b981' : '#6b7280', fontSize: '10px' }}>
            {isLive ? <><Wifi size={9} /> Live</> : <><WifiOff size={9} /> Off</>}
          </span>
          <button onClick={handleFinalize}
            title="Finalizar conversa"
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg font-semibold transition-all hover:opacity-80 active:scale-95"
            style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.25)', fontSize: '11px' }}>
            <Check size={10} /> Finalizar
          </button>
          <button onClick={() => setSelectedLead(null)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 text-[var(--text-muted)] transition-all">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Barra unificada: etapa + agente + etiquetas (tudo em um só lugar) ── */}
      <UnifiedBar
        conversationId={selectedLead.id}
        initialLabels={selectedLead.labels || []}
        currentColumn={currentColumn || selectedLead.column}
        product={selectedLead.product}
        assigneeName={assigneeName}
        onAssigned={agent => {
          setAssigneeName(agent.name)
          // Optimistic: ao atribuir agente em 'leads', move para 'negociacao'
          const col = currentColumn || selectedLead?.column
          if (col === 'leads' && selectedLead) {
            applyPendingMove(selectedLead, 'negociacao')
            setCurrentColumn('negociacao')
            setSelectedLead({ ...selectedLead, column: 'negociacao', assigneeName: agent.name })
            api.moveLead(selectedLead.id, 'negociacao').catch(() => {})
          }
        }}
        onMove={handleMove}
      />

      {/* ── Aba: Notas ── */}
      {activeTab === 'notas' && (
        <NotesPanel
          conversationId={selectedLead.id}
          notes={notes}
          setNotes={setNotes}
        />
      )}

      {activeTab !== 'notas' && (
        <>
      {/* ── Mensagens ── */}
      <div ref={scrollRef}
        onScroll={() => {}}
        className="flex-1 overflow-y-auto px-4 py-3">

        {loadingInit
          ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[var(--text-muted)]" /></div>
          : groupByDate(messages).map((item, i) => {
              if (item.type === 'date') {
                // Botão "carregar mais" aparece junto ao PRIMEIRO separador de data
                const isFirst = i === 0
                return (
                  <React.Fragment key={`date-${i}`}>
                    {isFirst && loadingMore && (
                      <div className="flex justify-center mb-2">
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--bg-hover)' }}>
                          <Loader2 size={12} className="animate-spin" /> Carregando...
                        </div>
                      </div>
                    )}
                    {isFirst && hasMore && !loadingMore && (
                      <button onClick={loadOlder}
                        className="w-full flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] py-1.5 mb-1 hover:bg-[var(--bg-hover)] rounded-lg transition-colors">
                        <ChevronUp size={11} /> Ver mensagens anteriores
                      </button>
                    )}
                    <DateSeparator label={item.label} />
                  </React.Fragment>
                )
              }
              return <MessageBubble key={item.msg.id} msg={item.msg} />
            })
        }
        <div ref={messagesEndRef} />
      </div>

      {/* ── Indicador: cliente digitando ── */}
      {contactTyping && (
        <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-[var(--text-muted)] animate-fade-in">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
          <span>{selectedLead?.name?.split(' ')[0]} está digitando...</span>
        </div>
      )}

      {/* ── Modal: Gerenciar Templates ── */}
      {showTplManager && (
        <TemplateManager
          templates={templates}
          setTemplates={setTemplates}
          onClose={() => setShowTplManager(false)}
        />
      )}

      {/* ── Área de input ── */}
      <div className="px-3 py-3 border-t border-[var(--border)] flex-shrink-0">
        {/* Gravando */}
        {recordingMode && (
          <RecordingBar
            onStop={handleRecordStop}
            onCancel={() => setRecordingMode(false)}
          />
        )}

        {/* Preview de áudio gravado */}
        {!recordingMode && audioBlob && !pendingFile && (
          <AudioPreview
            blob={audioBlob.blob}
            onSend={handleSendAudio}
            onCancel={() => setAudioBlob(null)}
            sending={sendingAudio}
          />
        )}

        {/* Preview de múltiplos arquivos */}
        {!recordingMode && pendingFiles.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">{pendingFiles.length} arquivo{pendingFiles.length > 1 ? 's' : ''} selecionado{pendingFiles.length > 1 ? 's' : ''}</span>
              <button onClick={() => setPendingFiles([])} className="text-xs text-[var(--text-muted)] hover:text-red-400">Cancelar</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  {f.fileType === 'image' ? '🖼' : '📄'} {f.file.name.slice(0, 20)}{f.file.name.length > 20 ? '…' : ''}
                  <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-400 ml-1">×</button>
                </div>
              ))}
            </div>
            <button onClick={handleSendFile}
              className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: '#2563eb' }}>
              Enviar {pendingFiles.length} arquivo{pendingFiles.length > 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Preview de imagem ou arquivo (com X para cancelar) */}
        {!recordingMode && pendingFile && pendingFiles.length === 0 && (
          <FilePreview
            pending={pendingFile}
            onSend={handleSendFile}
            onCancel={() => {
              if (pendingFile.url) URL.revokeObjectURL(pendingFile.url)
              setPendingFile(null)
            }}
            sending={false}
          />
        )}

        {/* Input de texto normal */}
        {!recordingMode && !audioBlob && !pendingFile && pendingFiles.length === 0 && (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-2 relative">
              <button onClick={() => imageInputRef.current?.click()}
                title="Enviar imagem"
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-blue-400 transition-colors">
                <ImageIcon size={16} />
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                title="Enviar arquivo"
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-blue-400 transition-colors">
                <Paperclip size={16} />
              </button>
              <button onClick={() => setShowTemplates(o => !o)}
                title="Templates de mensagem"
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                style={{ color: showTemplates ? '#60a5fa' : 'var(--text-muted)' }}>
                <Layout size={16} />
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.png,.jpg,.jpeg,.gif,.mp4,.mov" multiple className="hidden" onChange={handleFileChange} />
              {/* Templates dropdown */}
              {showTemplates && templates.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-2xl z-50 overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Templates</p>
                    <button onClick={() => setShowTemplates(false)}><X size={12} className="text-[var(--text-muted)]" /></button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => {
                        const name = selectedLead?.name?.split(' ')[0] || 'cliente'
                        const text = t.content.replace(/\{\{nome\}\}/gi, name).replace(/\{\{data\}\}/gi, new Date().toLocaleDateString('pt-BR'))
                        setInput(text)
                        setShowTemplates(false)
                      }}
                        className="w-full text-left px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border)] last:border-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{t.title}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{t.content.slice(0, 60)}...</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Slash menu — aparece acima do input ao digitar / */}
            {slashMenu.open && (
              <div className="mb-2 rounded-xl overflow-hidden shadow-2xl border border-[var(--border)]"
                style={{ backgroundColor: 'var(--bg-card)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]"
                  style={{ backgroundColor: 'rgba(59,130,246,0.06)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: '#2563eb', color: 'white', fontSize: '10px' }}>
                      /
                    </span>
                    <span className="text-xs font-semibold text-blue-400">Mensagens rápidas</span>
                    {slashMenu.query && (
                      <span className="text-xs text-[var(--text-muted)]">· buscando "{slashMenu.query}"</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setSlashMenu(s => ({ ...s, open: false })); setShowTplManager(true) }}
                      title="Gerenciar templates"
                      className="p-1 rounded-md text-blue-400 hover:bg-blue-400/10 transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setSlashMenu(s => ({ ...s, open: false }))}
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {slashMenu.filtered.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] px-3 py-3 text-center">
                    Nenhum template encontrado para "/{slashMenu.query}"
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto">
                    {slashMenu.filtered.map((t, idx) => {
                      const name = selectedLead?.name?.split(' ')[0] || 'cliente'
                      const preview = t.content
                        .replace(/\{\{nome\}\}/gi, name)
                        .replace(/\{\{data\}\}/gi, new Date().toLocaleDateString('pt-BR'))
                      return (
                        <button key={t.id}
                          onClick={() => {
                            // Substitui o "/" e query pelo texto do template
                            const lines = input.split('\n')
                            lines[lines.length - 1] = preview
                            setInput(lines.join('\n'))
                            setSlashMenu({ open: false, query: '', filtered: [] })
                            setTimeout(() => textareaRef.current?.focus(), 50)
                          }}
                          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--bg-hover)] transition-colors text-left border-b border-[var(--border)] last:border-0">
                          {/* Ícone de ordem */}
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                            <span className="text-blue-400 font-bold" style={{ fontSize: '10px' }}>{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">{t.title}</p>
                            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5 leading-relaxed">
                              {preview.slice(0, 80)}{preview.length > 80 ? '...' : ''}
                            </p>
                          </div>
                          <span className="text-xs text-[var(--text-muted)] flex-shrink-0 mt-0.5">Enter</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--border)]"
                  style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                  <p className="text-xs text-[var(--text-muted)]">↑↓ navegar · Enter selecionar · Esc fechar</p>
                  <button
                    onClick={() => { setSlashMenu(s => ({ ...s, open: false })); setShowTplManager(true) }}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors py-0.5 px-1.5 rounded-md hover:bg-blue-400/10">
                    <Pencil size={10} />
                    Editar
                  </button>
                </div>
              </div>
            )}

            {/* Textarea + mic + send */}
            <div className="flex items-end gap-2 rounded-xl p-2"
              style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${slashMenu.open ? 'rgba(59,130,246,0.5)' : 'var(--border)'}` }}>
              <div className="relative flex-shrink-0">
                <button onClick={() => setShowEmoji(o => !o)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                  style={showEmoji ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' } : {}}>
                  <Smile size={16} />
                </button>
                {showEmoji && (
                  <div className="absolute bottom-10 left-0 z-50 rounded-2xl shadow-2xl p-3"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', width: '264px' }}
                    onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-[var(--text-muted)] mb-2 font-medium">Emojis rápidos</p>
                    <div className="grid grid-cols-10 gap-0.5">
                      {QUICK_EMOJIS.map((em, i) => (
                        <button key={i}
                          onClick={() => { setInput(prev => prev + em); setShowEmoji(false); textareaRef.current?.focus() }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-colors"
                          style={{ fontSize: '16px', lineHeight: 1 }}>
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <textarea ref={textareaRef}
                onPaste={e => {
                  // Detecta imagem/arquivo colado (Ctrl+V)
                  const items = e.clipboardData?.items
                  if (!items) return
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (file && selectedLead) {
                        const url = URL.createObjectURL(file)
                        setPendingFile({ file, url, fileType: 'image' })
                      }
                      return
                    }
                    if (item.kind === 'file') {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (file && selectedLead) {
                        setPendingFile({ file, url: null, fileType: 'file' })
                      }
                      return
                    }
                  }
                }}
                value={input} onChange={e => {
                const val = e.target.value
                setInput(val)
                // Detecta "/" no início da linha para abrir menu rápido
                const lastLine = val.split('\n').pop() || ''
                if (lastLine.startsWith('/')) {
                  const query = lastLine.slice(1).toLowerCase()
                  const filtered = templates.filter(t =>
                    !query || t.title.toLowerCase().includes(query) || t.content.toLowerCase().includes(query)
                  )
                  setSlashMenu({ open: true, query, filtered })
                } else {
                  setSlashMenu(s => s.open ? { ...s, open: false } : s)
                }
                // Typing indicator
                if (selectedLead) {
                  clearTimeout(typingDebounceRef.current)
                  api.sendTyping(selectedLead.id, true).catch(() => {})
                  typingDebounceRef.current = setTimeout(() => {
                    api.sendTyping(selectedLead.id, false).catch(() => {})
                  }, 3000)
                }
              }} onKeyDown={e => {
                // Navega slash menu com teclado
                if (slashMenu.open) {
                  if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(s => ({ ...s, open: false })) }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault() }
                }
                handleKeyDown(e)
              }}
                placeholder="Digite / para mensagens rápidas..."
                rows={1}
                inputMode="text"
                enterKeyHint="send"
                className="flex-1 bg-transparent resize-none outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] leading-relaxed"
                style={{ minHeight: '24px', overflowY: 'auto', transition: 'height 0.1s ease' }} />

              {/* Mic ou Send */}
              {input.trim() ? (
                <button onClick={handleSend} disabled={sending}
                  className="p-2 rounded-lg transition-all flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: '#2563eb', color: 'white' }}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              ) : (
                <button onClick={() => setRecordingMode(true)}
                  title="Gravar áudio"
                  className="p-2 rounded-lg transition-all flex-shrink-0 hover:scale-110"
                  style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                  <Mic size={16} />
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center mt-1.5">Enter para enviar · Shift+Enter nova linha</p>
          </>
        )}
      </div>
        </>
      )}
    </div>
  )
}
