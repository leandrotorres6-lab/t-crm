require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const compression = require('compression')
const webpush = require('web-push')
const jwt = require('jsonwebtoken')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

// VAPID para push notifications
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BC5dEmG-Wrbr87AkZqLdhePfTBBxQQmlxThtG2CH-iz5Xvd1ZQJcLhZvczWb5nPUD8EHxHnOOM8Uu7h86gg33ZA'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'KQOpbbydw1HsA7SGsZsX5RTOSr-JBZ1z_aFfKRtuiJs'
webpush.setVapidDetails('mailto:admin@pvcorretora.com.br', VAPID_PUBLIC, VAPID_PRIVATE)

// JWT secret — usa var de ambiente em prod
const JWT_SECRET = process.env.JWT_SECRET || 'tcrm-dev-secret-change-in-production'
const JWT_EXPIRES = '7d'

// Subscriptions em memória (migrar para Supabase futuramente)
// Map<deviceKey, {agentId, subscription}> — suporta múltiplos dispositivos por agente
const pushSubscriptions = new Map()
const zlib = require('zlib')
const multer = require('multer')
const cw = require('./chatwoot')
const store = require('./store')
const db = require('./db')
const polling = require('./polling')

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

const CHATWOOT_READY = !!(process.env.CHATWOOT_URL && process.env.CHATWOOT_TOKEN && process.env.CHATWOOT_ACCOUNT_ID)
const SUPERVISORS = (process.env.CHATWOOT_SUPERVISORS || 'Leandro,Daniel,Safira,Admin')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// Inbox ID a filtrar (carregado no startup)
let targetInboxId = null

if (!CHATWOOT_READY) console.log('Modo mock — configure backend/.env')

// ─── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 10000,   // 10s para considerar conexão morta
  pingInterval: 8000,   // ping a cada 8s — bem abaixo do timeout de 30s do Railway
  transports: ['websocket', 'polling'],
})
io.on('connection', s => {
  console.log(`[Socket] Cliente conectado: ${s.id} (total: ${io.engine.clientsCount})`)

  // Snapshot de unread ao conectar/reconectar — elimina janela cega
  // Aceita { since } opcional para replay de leads atualizados após desconexão
  s.on('sync_request', async ({ since } = {}) => {
    try {
      // 1. Unread snapshot — sempre
      const state = store._state()
      const unread = {}
      Object.entries(state.unread || {}).forEach(([id, count]) => {
        if (count > 0) unread[id] = count
      })
      s.emit('sync_state', { unreadCounts: unread })

      // 2. Replay de leads atualizados desde a desconexão (se since informado)
      if (since && db.DB_READY()) {
        const sinceIso = new Date(Number(since)).toISOString()
        const { data, error } = await db._supabase()
          .from('leads')
          .select('*')
          .gt('updated_at', sinceIso)
          .order('updated_at', { ascending: false })
          .limit(50)

        if (!error && data?.length) {
          const items = data.map(row => db.fromRow(row))
          s.emit('sync_data', items)
          console.log(`[Sync] Replay ${items.length} lead(s) desde ${sinceIso.slice(0,19)} para ${s.id}${items.length === 50 ? ' ⚠️ limite atingido' : ''}`)
        }
      }

      console.log(`[Socket] Sync enviado: ${Object.keys(unread).length} unread (since=${since ? new Date(Number(since)).toISOString().slice(0,19) : 'n/a'})`)
    } catch (e) { console.warn('[Sync] Erro:', e.message) }
  })

  s.on('disconnect', (reason) => {
    console.log(`[Socket] Desconectado: ${s.id} (${reason})`)
  })
})

// ── Segurança ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// CORS permissivo — aceita qualquer origem (Vercel gera URLs diferentes a cada deploy)
app.use(cors())
app.use(compression())

// Rate limiting apenas no login (evita força bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Compressão gzip para respostas grandes
app.use((req, res, next) => {
  const ae = req.headers['accept-encoding'] || ''
  if (ae.includes('gzip')) {
    const orig = res.json.bind(res)
    res.json = (data) => {
      const json = JSON.stringify(data)
      if (json.length > 1024) {
        zlib.gzip(json, (err, buf) => {
          if (err) return orig(data)
          res.set('Content-Encoding', 'gzip')
          res.set('Content-Type', 'application/json')
          res.send(buf)
        })
      } else orig(data)
    }
  }
  next()
})

// Cache headers para respostas estáticas
app.use((req, res, next) => {
  res.set('X-Powered-By', 'T-CRM')
  next()
})
app.use(express.json({ limit: '50mb' }))
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// ─── Startup: detecta inbox alvo ─────────────────────────────────────────────
async function initInboxFilter() {
  if (!CHATWOOT_READY) return

  // Prioridade 1: ID direto no .env (mais confiável)
  if (process.env.CHATWOOT_INBOX_ID) {
    targetInboxId = parseInt(process.env.CHATWOOT_INBOX_ID)
    console.log(`✅ Inbox ID: ${targetInboxId} (definido no .env)`)
    return
  }

  // Prioridade 2: busca por nome
  try {
    const inboxes = await cw.getInboxes()

    if (!process.env.CHATWOOT_INBOX_NAME) {
      console.log('📱 Inboxes disponíveis (configure CHATWOOT_INBOX_ID ou CHATWOOT_INBOX_NAME):')
      inboxes.forEach(i => console.log(`   CHATWOOT_INBOX_ID=${i.id}  →  "${i.name}"`))
      return
    }

    const nameFilter = process.env.CHATWOOT_INBOX_NAME.toLowerCase().trim()
    const inbox =
      inboxes.find(i => i.name && i.name.toLowerCase().trim() === nameFilter) ||
      inboxes.find(i => i.name && i.name.toLowerCase().includes(nameFilter))

    if (inbox) {
      targetInboxId = inbox.id
      console.log(`✅ Inbox: "${inbox.name}" (ID: ${inbox.id})`)
    } else {
      console.log(`⚠️  Inbox "${process.env.CHATWOOT_INBOX_NAME}" não encontrada`)
      inboxes.forEach(i => console.log(`   CHATWOOT_INBOX_ID=${i.id}  →  "${i.name}"`))
    }
  } catch (e) {
    console.warn('⚠️  Erro ao buscar inboxes:', e.message)
  }
}

// ─── Cache de conversas ──────────────────────────────────────────────────────
const ALL_COLUMNS = ['leads','negociacao','aguardando_cotacao','agendado','lancar_venda','aguardando_pagamento','pago','sem_retorno']

// Mutex: evita múltiplas chamadas simultâneas ao Chatwoot
let fetchingConversations = null

async function getAllConversations() {
  const cached = store.getCache()
  if (cached) return Object.values(cached)

  // Se já tem um fetch em andamento, espera ele terminar
  if (fetchingConversations) {
    await fetchingConversations
    const cached2 = store.getCache()
    if (cached2) return Object.values(cached2)
  }

  if (!CHATWOOT_READY) {
    const { leads } = require('./data/mockData')
    const map = {}
    leads.forEach(l => {
      const column = store.getColumn(l.id) ?? l.column
      const meta = store.getMeta(l.id)
      map[l.id] = { ...l, column, ...(meta.scheduledAt ? { scheduledAt: meta.scheduledAt } : {}), ...(meta.paymentDueDate ? { paymentDueDate: meta.paymentDueDate } : {}), ...(meta.observacao ? { observacao: meta.observacao } : {}) }
    })
    store.setCache(map)
    return Object.values(map)
  }

  // Inicia o fetch com mutex
  let resolveFetch
  fetchingConversations = new Promise(r => { resolveFetch = r })

  const all = []
  try {
  // Fase 1: busca as 3 primeiras páginas em paralelo (resposta imediata)
  const firstBatch = await Promise.all([1,2,3].map(p =>
    cw.getConversations({ page: p, status: 'open', inboxId: targetInboxId || undefined })
  ))
  let lastPageSize = 25
  for (const batch of firstBatch) {
    all.push(...batch)
    lastPageSize = batch.length
  }

  // Fase 2: se há mais páginas, busca 4 em paralelo por vez
  if (lastPageSize >= 25) {
    for (let startPage = 4; startPage <= 20; startPage += 4) {
      const pages = [startPage, startPage+1, startPage+2, startPage+3]
      const batches = await Promise.all(pages.map(p =>
        cw.getConversations({ page: p, status: 'open', inboxId: targetInboxId || undefined })
          .catch(() => [])
      ))
      let hasMore = false
      for (const batch of batches) {
        if (batch.length > 0) { all.push(...batch); hasMore = true }
        if (batch.length < 25) { hasMore = false; break }
      }
      if (!hasMore) break
    }
  }
  console.log(`📋 Total buscado do Chatwoot: ${all.length} conversas (paralelo)`)
  // NÃO carrega resolvidas automaticamente — só aparecem em histórico de contato
  // Resolvidas no kanban poluem com conversas internas, notificações, etc.

  // Filtra conversas que NÃO devem aparecer no kanban:
  const shouldSkip = (conv) => {
    const sender = conv.meta?.sender || {}
    const senderName = (sender.name || '').toLowerCase()
    const senderEmail = (sender.email || '').toLowerCase()
    const phone = (sender.phone_number || '')

    // 1. Conversa sem contato identificado (sem telefone e sem nome real)
    if (!phone && !sender.name) return true

    // 2. Remetente é o próprio sistema/bot (mensagens internas)
    // Configura via CHATWOOT_IGNORE_SENDERS no .env (separado por vírgula)
    const defaultIgnore = ['pvcorretora', 'pv corretora', 'crm clow', 'clow', 'sistema', 'bot']
    const customIgnore = (process.env.CHATWOOT_IGNORE_SENDERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const internalNames = [...new Set([...defaultIgnore, ...customIgnore])]
    if (internalNames.some(n => senderName.includes(n))) return true

    // 3. Email interno da empresa
    const internalDomains = ['pvcorretora', 'pvcorretor', 'clow.pv']
    if (senderEmail && internalDomains.some(d => senderEmail.includes(d))) return true

    // 4. Lead cancelado — tem label 'cancelado', não deve aparecer no kanban
    // (mas é contabilizado no dashboard)
    if ((conv.labels || []).some(l => l.toLowerCase() === 'cancelado')) return true

    // 5. Conversa com status "resolved"
    if (conv.status === 'resolved') {
      const storeCol = store.getColumn(String(conv.id))
      // Exceção: se foi reaberta pelo T-CRM (agendado, moved etc), manter no kanban
      // O store tem a coluna atualizada mesmo que o Chatwoot ainda diga "resolved"
      const reopenedCols = new Set(['agendado','negociacao','leads','aguardando_cotacao','lancar_venda','aguardando_pagamento'])
      if (storeCol && reopenedCols.has(storeCol)) return false  // NÃO descarta
      return true  // descarta se não foi reaberto
    }
    // 5b. Marcada como resolvida no store local
    if (store.getColumn(String(conv.id)) === '__resolved__') return true

    return false
  }

  const filtered = all.filter(conv => !shouldSkip(conv))

  const map = {}
  filtered.forEach(conv => {
    const column = store.getColumn(String(conv.id)) ?? null
    const meta = store.getMeta(String(conv.id))
    const mapped = cw.mapConversation(conv, column)
    if (meta.scheduledAt) mapped.scheduledAt = meta.scheduledAt
    if (meta.paymentDueDate) mapped.paymentDueDate = meta.paymentDueDate
    if (meta.observacao) mapped.observacao = meta.observacao
    map[String(conv.id)] = mapped
  })
  // REGRA: unread_count = 0 no mapConversation — Supabase é fonte de verdade
  // Aplica unread do store local (pode ter incrementado via webhook antes do cache rebuild)
  Object.keys(map).forEach(id => {
    const localUnread = store.getUnread(id)
    // Só aplica unread do store se for > 0 (incrementos por webhooks recentes)
    // Se for 0, mantém 0 (ou seja, não "inventa" unread)
    map[id].unreadCount = localUnread
  })
  store.setCache(map)

  // Sincroniza estrutura para Supabase SEM sobrescrever unread_count
  if (typeof db !== 'undefined' && db.DB_READY && db.DB_READY()) {
    const leads = Object.values(map)
    db.upsertManyNoUnread(leads).catch(e => console.warn('Supabase sync error:', e.message))
  }
  } finally {
    fetchingConversations = null
    if (resolveFetch) resolveFetch()
  }
  return Object.values(store.getCache())
}

// ─── SYNC SUPABASE ───────────────────────────────────────────────────────────
app.post('/api/admin/sync-supabase', async (req, res) => {
  if (!db.DB_READY()) return res.status(503).json({ error: 'Supabase não conectado' })
  try {
    console.log('[Sync] Iniciando sincronização forçada...')
    const all = await getAllConversations()
    await db.upsertMany(all)
    res.json({ ok: true, synced: all.length })
    console.log(`[Sync] ✅ ${all.length} leads sincronizados`)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── STATUS ──────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => res.json({
  ok: true, chatwoot: CHATWOOT_READY, mode: CHATWOOT_READY ? 'live' : 'mock',
  connectedClients: io.engine.clientsCount,
  inbox: targetInboxId ? `ID ${targetInboxId}` : 'todas',
}))

// ─── DIAGNÓSTICO ─────────────────────────────────────────────────────────────
// Acesse http://localhost:3001/api/debug para ver o status da conexão
app.get('/api/debug', async (req, res) => {
  const result = {
    chatwoot_url: process.env.CHATWOOT_URL || 'NÃO CONFIGURADO',
    chatwoot_ready: CHATWOOT_READY,
    inbox_name_config: process.env.CHATWOOT_INBOX_NAME || 'NÃO CONFIGURADO',
    inbox_id_detected: targetInboxId || null,
    inboxes: [],
    conversations_sample: [],
    error: null,
  }

  if (!CHATWOOT_READY) {
    result.error = 'Chatwoot não configurado no .env'
    return res.json(result)
  }

  try {
    // Lista todas as inboxes disponíveis com o token atual
    const inboxes = await cw.getInboxes()
    result.inboxes = inboxes.map(i => ({
      id: i.id, name: i.name, channel_type: i.channel_type, enabled: i.working_hours_enabled
    }))

    // Tenta buscar conversas (com e sem filtro de inbox)
    const all = await cw.getConversations({ page: 1, status: 'open' })
    result.conversations_total_open = all.length
    result.conversations_sample = all.slice(0, 3).map(c => ({
      id: c.id,
      inbox_id: c.inbox_id,
      status: c.status,
      contact: c.meta?.sender?.name,
      labels: c.labels,
    }))

    if (targetInboxId) {
      const filtered = await cw.getConversations({ page: 1, status: 'open', inboxId: targetInboxId })
      result.conversations_filtered_by_inbox = filtered.length
    }
  } catch (e) {
    result.error = e.message
  }

  res.json(result)
})

// ─── KANBAN ──────────────────────────────────────────────────────────────────
app.get('/api/kanban/columns', async (req, res) => {
  try {
    const all = await getAllConversations()
    res.json(ALL_COLUMNS.map(col => ({
      id: col,
      label: col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count: all.filter(c => c.column === col).length,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Índice em memória — O(1) por coluna (evita filter O(n) em cada request)
let _colIdx = null
const _buildIdx = (map) => {
  const idx = {}
  for (const c of Object.values(map)) {
    const col = c.column || 'leads'
    if (!idx[col]) idx[col] = []
    idx[col].push(c)
  }
  // Pré-ordena cada coluna: não lidas → mais recentes
  for (const col of Object.keys(idx)) {
    idx[col].sort((a, b) => {
      const ua = a.unreadCount || 0, ub = b.unreadCount || 0
      if (ua !== ub) return ub - ua
      return new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)
    })
  }
  return idx
}
// Invalida índice sempre que o cache mudar
const _origInvalidate = store.invalidateCache.bind(store)
store.invalidateCache = () => { _colIdx = null; _origInvalidate() }

// Também invalida índice quando lastMessageAt é atualizado
const _origUpdateAt = store.updateLastMessageAt.bind(store)
store.updateLastMessageAt = (id, content, ts) => {
  _colIdx = null  // força reordenação na próxima query
  _origUpdateAt(id, content, ts)
}

app.get('/api/kanban/:column', async (req, res) => {
  try {
    const { column } = req.params
    const { page = 1, limit = 15, agentId, role } = req.query
    const pg = parseInt(page), lm = parseInt(limit)
    const offset = (pg - 1) * lm

    // ── Supabase: query direta < 50ms ─────────────────────────────────────────
    if (db.DB_READY()) {
      const assignedTo = role === 'vendedor' && agentId ? agentId : null
      const result = await db.getByColumn(column, { limit: lm, offset, assignedTo })
      if (result) {
        return res.json({
          items: result.items,
          total: result.total,
          page: pg,
          hasMore: offset + result.items.length < result.total,
          cacheReady: true,
          source: 'supabase',
        })
      }
    }

    // ── Fallback: cache em memória ────────────────────────────────────────────
    const cacheMap = store.getCache()
    if (!cacheMap) {
      if (!fetchingConversations) getAllConversations().catch(() => {})
      return res.json({ items: [], total: 0, page: pg, hasMore: false, cacheReady: false })
    }
    if (!_colIdx) _colIdx = _buildIdx(cacheMap)
    let filtered = _colIdx[column] || []
    if (role === 'vendedor' && agentId) filtered = filtered.filter(c => c.assignedTo === agentId)
    const items = filtered.slice(offset, offset + lm)
    res.json({ items, total: filtered.length, page: pg, hasMore: offset + items.length < filtered.length, cacheReady: true, source: 'memory' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/kanban/:id/move', async (req, res) => {
  try {
    const { id } = req.params
    const { column, fromColumn } = req.body
    store.setColumn(id, column)

    // Limpa metadados da coluna de origem ao sair dela
    const metaUpdates = {}
    if (fromColumn === 'aguardando_pagamento' && column !== 'aguardando_pagamento') {
      store.setMeta(id, { paymentDueDate: null, observacao: '' })
      metaUpdates.paymentDueDate = null
    }
    if (fromColumn === 'agendado' && column !== 'agendado') {
      store.setMeta(id, { scheduledAt: null, observacao: '' })
      metaUpdates.scheduledAt = null
    }

    store.invalidateCache()

    // Atualiza Supabase e Chatwoot em paralelo (background)
    Promise.all([
      db.DB_READY() ? db.moveColumn(id, column).then(() => {
        if (Object.keys(metaUpdates).length > 0) {
          return db.updateMeta(id, metaUpdates)
        }
      }) : Promise.resolve(),
      CHATWOOT_READY ? cw.setKanbanLabel(id, column).catch(e => console.warn('Label update failed:', e.message)) : Promise.resolve(),
    ]).catch(() => {})

    // Busca lead completo para enviar no evento (cache primeiro, sem latência extra)
    let leadData = null
    const cached = store.getCache()
    if (cached && cached[String(id)]) {
      leadData = { ...cached[String(id)], column }
    } else if (db.DB_READY()) {
      leadData = await db.getLeadById(id).catch(() => null)
      if (leadData) leadData = { ...leadData, column }
    }

    console.log(`📡 emit lead_moved: conv=${id} ${fromColumn || '?'} → ${column} (lead: ${leadData ? 'completo' : 'parcial'})`)
    io.emit('lead_moved', { id, column, fromColumn, lead: leadData })
    res.json({ id, column })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/kanban/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params
    const { scheduledAt, observacao } = req.body
    // Marca como 'agendado' no store E remove flag __resolved__ se existia
    store.setColumn(id, 'agendado')
    store.setMeta(id, { scheduledAt, observacao: observacao || '', status: 'open' })
    store.invalidateCache()
    // Persiste no Supabase — status:'open' reabre lead finalizado
    if (db.DB_READY()) {
      db.updateMeta(id, {
        column:      'agendado',
        status:      'open',
        scheduledAt: scheduledAt || null,
        observacao:  observacao || '',
      }).catch(() => {})
    }
    // Reabre no Chatwoot (assíncrono, não bloqueia resposta)
    if (CHATWOOT_READY) {
      cw.setKanbanLabel(id, 'agendado').catch(() => {})
      cw.reopenConversation(id).catch(() => {})
    }
    // Busca lead completo para emitir no evento
    let leadData = null
    const cached = store.getCache()
    if (cached?.[String(id)]) leadData = { ...cached[String(id)], column: 'agendado', scheduledAt, observacao }
    else if (db.DB_READY()) leadData = await db.getLeadById(id).catch(() => null)
    if (leadData) leadData = { ...leadData, column: 'agendado', scheduledAt, observacao }

    io.emit('lead_moved', { id, column: 'agendado', fromColumn: leadData?.column, lead: leadData })
    io.emit('schedule_created', { id, scheduledAt, observacao, lead: leadData })
    console.log(`[Schedule] conv=${id} agendado para ${scheduledAt}`)
    res.json({ id, column: 'agendado', scheduledAt, observacao })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Aguardando Pagamento — define data de vencimento
app.patch('/api/kanban/:id/payment', async (req, res) => {
  try {
    const { id } = req.params
    const { paymentDueDate, observacao } = req.body
    store.setColumn(id, 'aguardando_pagamento')
    store.setMeta(id, { paymentDueDate, observacao: observacao || '' })
    store.invalidateCache()
    // Persiste no Supabase
    if (db.DB_READY()) {
      db.updateMeta(id, { column: 'aguardando_pagamento', paymentDueDate: paymentDueDate || null, observacao: observacao || '' }).catch(() => {})
    }
    if (CHATWOOT_READY) cw.setKanbanLabel(id, 'aguardando_pagamento').catch(e => console.warn(e.message))
    // Busca lead completo para emitir no evento
    let payLead = null
    const payCache = store.getCache()
    if (payCache?.[String(id)]) payLead = { ...payCache[String(id)], column: 'aguardando_pagamento', paymentDueDate, observacao }
    else if (db.DB_READY()) payLead = await db.getLeadById(id).catch(() => null)
    if (payLead) payLead = { ...payLead, column: 'aguardando_pagamento', paymentDueDate, observacao }

    io.emit('lead_moved', { id, column: 'aguardando_pagamento', fromColumn: payLead?.column, lead: payLead })
    res.json({ id, column: 'aguardando_pagamento', paymentDueDate, observacao })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Finalizar conversa — usa status 'resolved' do Chatwoot (equivalente a "Resolver")
// Mantém coluna original intacta, só oculta do Kanban enquanto status=resolved
app.post('/api/kanban/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params
    // Marca como resolved no Chatwoot (fonte de verdade para reload)
    if (CHATWOOT_READY) await cw.resolveConversation(id)
    // Persiste status no Supabase (fallback quando Chatwoot não está disponível)
    if (db.DB_READY()) {
      db.updateMeta(id, { status: 'resolved' }).catch(() => {})
      db.resetUnread(id).catch(() => {})
    }
    // Limpa estado em memória imediatamente (não espera expirar TTL)
    store.resetUnread(id)
    store.setColumn(id, '__resolved__')  // marca como resolvido no store
    store.invalidateCache()
    // Notifica frontend para remover do Kanban imediatamente
    io.emit('conversation_resolved', { id })
    io.emit('unread_update', { conversationId: id, count: 0, updatedAt: new Date().toISOString() })
    console.log(`[Finalize] Conversa ${id} resolvida e persistida`)
    res.json({ id, status: 'resolved' })
  } catch (e) {
    console.error('[Finalize]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// Lista de agendamentos — usa Supabase primeiro (mais rápido), fallback para store
app.get('/api/agendamentos', async (req, res) => {
  try {
    const { agentId, role } = req.query
    if (db.DB_READY()) {
      const all = await db.getAll()
      let agendados = all.filter(c => c.column === 'agendado' && c.scheduledAt)
      if (role === 'vendedor' && agentId) agendados = agendados.filter(c => c.assignedTo === agentId)
      return res.json(agendados)
    }
    // Fallback: store em memória
    const cached = store.getCache()
    const all = cached ? Object.values(cached) : await getAllConversations()
    let agendados = all.filter(c => c.column === 'agendado' && c.scheduledAt)
      .map(c => ({ ...c, observacao: store.getMeta(c.id).observacao || '' }))
    if (role === 'vendedor' && agentId) agendados = agendados.filter(c => c.assignedTo === agentId)
    res.json(agendados)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lista de aguardando pagamento — usa Supabase primeiro
app.get('/api/pagamentos', async (req, res) => {
  try {
    if (db.DB_READY()) {
      const all = await db.getAll()
      // Filtra por coluna aguardando_pagamento E com paymentDueDate preenchido
      const pagamentos = all.filter(c =>
        c.column === 'aguardando_pagamento' && c.paymentDueDate
      )
      return res.json(pagamentos)
    }
    // Fallback: store em memória
    const cached = store.getCache()
    const all = cached ? Object.values(cached) : await getAllConversations()
    const pagamentos = all
      .map(c => {
        const meta = store.getMeta(c.id)
        return { ...c, paymentDueDate: meta.paymentDueDate || c.paymentDueDate || null, observacao: meta.observacao || c.observacao || '' }
      })
      .filter(c => c.column === 'aguardando_pagamento' && c.paymentDueDate)
    res.json(pagamentos)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── LOGIN ───────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { agentId, password } = req.body
  if (!agentId || !password) return res.status(400).json({ error: 'Informe agente e senha' })

  // Busca o agente
  let agent
  try {
    if (CHATWOOT_READY) {
      const agents = await cw.getAgents()
      const raw = agents.find(a => String(a.id) === String(agentId))
      if (!raw) return res.status(404).json({ error: 'Agente não encontrado' })
      const isSupervisor = SUPERVISORS.some(s => (raw.name || '').toLowerCase().includes(s))
      agent = {
        id: String(raw.id),
        name: raw.name,
        email: raw.email || '',
        avatar: (raw.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
        avatarUrl: raw.avatar_url || null,
        role: isSupervisor ? 'supervisor' : 'vendedor',
      }
    } else {
      const { users } = require('./data/mockData')
      const u = users.find(u => u.id === agentId)
      if (!u) return res.status(404).json({ error: 'Agente não encontrado' })
      agent = u
    }
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao buscar agente' })
  }

  // Valida senha — chave no .env: AGENT_PASS_<NOME_NORMALIZADO>
  // Normaliza: "Leandro Torres" → AGENT_PASS_LEANDRO_TORRES
  // Tenta também só o primeiro nome: AGENT_PASS_LEANDRO
  const normalize = (s) => s.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
  const nameParts = (agent.name || '').trim().split(' ')
  const keyFull = `AGENT_PASS_${normalize(agent.name)}`
  const keyFirst = `AGENT_PASS_${normalize(nameParts[0])}`
  const storedPass = process.env[keyFull] || process.env[keyFirst]

  if (!storedPass) {
    return res.status(401).json({ error: `Senha não configurada para ${agent.name}. Configure ${keyFirst} no Railway.` })
  }

  if (password !== storedPass) {
    return res.status(401).json({ error: 'Senha incorreta' })
  }

  const token = jwt.sign(
    { id: agent.id, name: agent.name, role: agent.role, email: agent.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  )
  res.json({ ok: true, agent, token })
})

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
const JWT_ENABLED = !!process.env.JWT_SECRET  // só ativo quando JWT_SECRET estiver configurado

function requireAuth(req, res, next) {
  // Se JWT não estiver configurado, passa direto (modo compatibilidade)
  if (!JWT_ENABLED) return next()

  // Rotas públicas
  if (req.path.includes('/chatwoot/webhook')) return next()
  if (req.path.includes('/push/vapid-key')) return next()

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

// Rate limit no login
app.use('/api/auth/login', loginLimiter)

// Aplica auth em todas as rotas /api/* exceto rotas públicas
app.use('/api', (req, res, next) => {
  if (!JWT_ENABLED) return next()
  const publicPaths = [
    '/status', '/auth/login', '/debug',
    '/chatwoot/webhook', '/push/vapid-key',
    '/agents',  // necessário antes do login para mostrar lista de agentes
  ]
  if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) return next()
  return requireAuth(req, res, next)
})

// ─── AGENTES ─────────────────────────────────────────────────────────────────
app.get('/api/agents', async (req, res) => {
  try {
    if (!CHATWOOT_READY) {
      // Equipe PV Corretora (usado apenas quando Chatwoot não está configurado no .env)
      return res.json([
        { id: 'u1', name: 'Leandro Torres',  email: 'leandro@pvcorretora.com.br',   avatar: 'LT', role: 'supervisor' },
        { id: 'u2', name: 'Daniel Baptista', email: 'daniel@pvcorretora.com.br',    avatar: 'DB', role: 'supervisor' },
        { id: 'u3', name: 'Safira Admin',    email: 'safira@pvcorretora.com.br',    avatar: 'SA', role: 'supervisor' },
        { id: 'u4', name: 'Wellington Silva',email: 'wellington@pvcorretora.com.br',avatar: 'WS', role: 'vendedor'   },
        { id: 'u5', name: 'Nilson Costa',    email: 'nilson@pvcorretora.com.br',    avatar: 'NC', role: 'vendedor'   },
      ])
    }

    const agents = await cw.getAgents()
    if (!agents || !agents.length) {
      return res.status(503).json({ error: 'Chatwoot não retornou agentes' })
    }
    const mapped = agents.map(a => {
      const isSupervisor = SUPERVISORS.some(s => (a.name || '').toLowerCase().includes(s))
      return {
        id: String(a.id),
        name: a.name || `Agente ${a.id}`,
        email: a.email || '',
        avatar: (a.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        avatarUrl: a.avatar_url || null,
        role: isSupervisor ? 'supervisor' : 'vendedor',
      }
    })
    res.json(mapped)
  } catch (e) {
    console.error('[Agents] Erro ao buscar do Chatwoot:', e.message)
    // Retorna lista de fallback para não quebrar o login
    res.json([
      { id: 'u1', name: 'Leandro Torres',   email: 'leandro@pvcorretora.com.br',    avatar: 'LT', role: 'supervisor' },
      { id: 'u2', name: 'Daniel Baptista',  email: 'daniel@pvcorretora.com.br',     avatar: 'DB', role: 'supervisor' },
      { id: 'u3', name: 'Safira Admin',     email: 'safira@pvcorretora.com.br',     avatar: 'SA', role: 'supervisor' },
      { id: 'u4', name: 'Wellington Silva', email: 'wellington@pvcorretora.com.br', avatar: 'WS', role: 'vendedor'   },
      { id: 'u5', name: 'Nilson Costa',     email: 'nilson@pvcorretora.com.br',     avatar: 'NC', role: 'vendedor'   },
      { id: 'u6', name: 'CRM CLOW',         email: 'admin@clow.pvcorretora.com.br', avatar: 'CC', role: 'supervisor' },
    ])
  }
})

app.post('/api/conversations/:id/assign', async (req, res) => {
  try {
    const { id } = req.params
    const { agentId } = req.body
    // Atualiza Chatwoot
    let agentName = ''
    if (CHATWOOT_READY) {
      const result = await cw.assignAgent(id, agentId)
      agentName = result?.meta?.assignee?.name || ''
    }
    // Persiste no Supabase
    if (db.DB_READY()) {
      db.updateMeta(id, {
        assignedTo: String(agentId),
        assigneeName: agentName,
      }).catch(() => {})
    }
    // Atualiza store em memória
    store.invalidateCache()
    // Notifica frontend
    io.emit('conversation_updated', { id, assignedTo: String(agentId), assigneeName: agentName })
    res.json({ ok: true, agentId, agentName })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── ETIQUETAS ───────────────────────────────────────────────────────────────
app.get('/api/account/labels', async (req, res) => {
  try {
    if (!CHATWOOT_READY) return res.json([
      { title: 'urgente', color: '#ef4444' },
      { title: 'renovacao', color: '#f59e0b' },
      { title: 'novo_cliente', color: '#10b981' },
      { title: 'vip', color: '#f97316' },
      { title: 'plano_saude', color: '#3b82f6' },
      { title: 'seguros_auto', color: '#06b6d4' },
    ])
    res.json(await cw.getAccountLabels())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/conversations/:id/labels', async (req, res) => {
  try {
    if (!CHATWOOT_READY) {
      const all = await getAllConversations()
      const conv = all.find(c => c.id === req.params.id)
      return res.json({ labels: conv?.labels || [] })
    }
    res.json({ labels: await cw.getConversationLabels(req.params.id) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/conversations/:id/labels', async (req, res) => {
  try {
    const { id } = req.params
    const { labels } = req.body  // labels livres vindas do frontend (sem crm_xxx)

    if (CHATWOOT_READY) {
      // Busca as labels atuais do Chatwoot para preservar crm_xxx e humano
      const current = await cw.getConversationLabels(id)
      // Mantém APENAS as labels crm_ de posição kanban que já estão lá
      const kanbanLabels = current.filter(l => l.startsWith('crm_'))
      // Mescla: labels kanban (posição) + novas labels livres do frontend
      const merged = [...new Set([...kanbanLabels, ...labels])]
      await cw.setConversationLabels(id, merged)
    }

    // Atualiza cache local com as labels livres
    const freeLabels = labels.filter(l => !l.startsWith('crm_'))
    const cached = store.getCache()
    if (cached && cached[id]) cached[id].labels = freeLabels
    io.emit('labels_updated', { id, labels: freeLabels })
    res.json({ ok: true, labels: freeLabels })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── MENSAGENS ───────────────────────────────────────────────────────────────
app.get('/api/messages/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params
    const { before } = req.query
    if (!CHATWOOT_READY) {
      const { generateMessages, leads } = require('./data/mockData')
      const lead = leads.find(l => l.id === leadId)
      return res.json({ messages: lead ? generateMessages(leadId, lead.name) : [], hasMore: false })
    }
    const raw = await cw.getMessages(leadId, before)
    const messages = raw.filter(m => m.message_type <= 1).map(cw.mapMessage)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    // Chatwoot retorna 20 mensagens por página — se veio 20, há mais para carregar
    const hasMore = raw.length >= 20
    res.json({ messages, hasMore })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/messages/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params
    const { content } = req.body
    if (!CHATWOOT_READY) {
      const msg = { id: `${leadId}-${Date.now()}`, sender: 'agent', content, timestamp: new Date().toISOString(), attachments: [] }
      store.updateLastMessage(leadId, content)
      return res.json(msg)
    }
    const msg = await cw.sendMessage(leadId, content)
    store.updateLastMessage(leadId, content)
    res.json(cw.mapMessage(msg))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/messages/:leadId/attachment', upload.single('file'), async (req, res) => {
  try {
    const { leadId } = req.params
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' })
    if (!CHATWOOT_READY) {
      const fileType = file.mimetype.startsWith('audio/') ? 'audio' : file.mimetype.startsWith('image/') ? 'image' : 'file'
      return res.json({ id: `${leadId}-att-${Date.now()}`, sender: 'agent', content: '', timestamp: new Date().toISOString(), attachments: [{ id: String(Date.now()), fileType, url: '', filename: file.originalname, fileSize: file.size }] })
    }
    const msg = await cw.sendAttachment(leadId, file.buffer, file.originalname, file.mimetype)
    res.json(cw.mapMessage(msg))
  } catch (e) { console.error('[Attachment]', e.message); res.status(500).json({ error: e.message }) }
})

app.post('/api/conversations/:id/read', async (req, res) => {
  const id = String(req.params.id)
  const now = new Date().toISOString()

  // Supabase — fonte de verdade
  let updatedAt = now
  if (db.DB_READY()) {
    const ts = await db.resetUnread(id).catch(() => null)
    if (ts) updatedAt = ts
  }

  // Cache memória
  store.resetUnread(id)

  // Notifica frontend com timestamp
  io.emit('unread_update', { conversationId: id, count: 0, updatedAt })

  // Chatwoot — para de enviar eventos de unread
  if (CHATWOOT_READY) cw.markConversationRead(id).catch(() => {})

  res.json({ ok: true, updatedAt })
})

// ─── CONTATOS ────────────────────────────────────────────────────────────────
app.get('/api/contacts', async (req, res) => {
  try {
    const { q = '', page = 1 } = req.query
    if (!CHATWOOT_READY) {
      const all = await getAllConversations()
      let filtered = q ? all.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q) || c.email.toLowerCase().includes(q.toLowerCase())) : all
      const limit = 20, offset = (parseInt(page) - 1) * limit
      const slice = filtered.slice(offset, offset + limit)
      return res.json({ contacts: slice.map(c => ({ ...c, conversationsCount: 1, lastActivityAt: c.createdAt })), total: filtered.length, hasMore: offset + slice.length < filtered.length })
    }
    const { contacts: raw, meta } = await cw.getContactsList({ q, page: parseInt(page) })
    res.json({ contacts: raw.map(cw.mapContact), total: meta?.count || raw.length, hasMore: raw.length >= 15 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/contacts/:contactId/conversations', async (req, res) => {
  try {
    const { contactId } = req.params
    if (!CHATWOOT_READY) {
      const all = await getAllConversations()
      const convs = all.filter(c => c.id === contactId || c.contactId === contactId)
      return res.json({ conversations: convs.map(c => ({ id: c.id, status: ['pago','sem_retorno'].includes(c.column) ? 'resolved' : 'open', createdAt: c.createdAt, lastActivityAt: c.createdAt, lastMessage: c.lastMessage, assigneeName: c.assigneeName || '', assigneeAvatar: c.assigneeAvatar || null, labels: c.labels || [], unreadCount: c.unreadCount || 0, inboxName: 'WhatsApp', asCrmLead: c })) })
    }
    const raw = await cw.getContactConversations(contactId)
    // Filtra pelo inbox alvo se configurado
    const filtered = targetInboxId ? raw.filter(c => c.inbox_id === targetInboxId) : raw
    const sorted = filtered.sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0))
    res.json({ conversations: sorted.map(cw.mapConvSummary) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── INBOX: todas as conversas de uma vez ────────────────────────────────────
app.get('/api/inbox', async (req, res) => {
  try {
    const { agentId, role } = req.query
    let all = await getAllConversations()

    // Remove conversas resolvidas da aba Conversas
    all = all.filter(c => c.status !== 'resolved')

    // Filtro por vendedor — cast numérico garante comparação correta
    if (role === 'vendedor' && agentId) {
      const aid = Number(agentId)
      all = all.filter(c => Number(c.assignedTo) === aid)
      console.log(`[Inbox] Vendedor ${agentId} → ${all.length} conversas atribuídas`)
    }

    // Ordena: não lidas → lastMessageAt mais recente
    all.sort((a, b) => {
      const ua = a.unreadCount || 0, ub = b.unreadCount || 0
      if (ua !== ub) return ub - ua
      const ta = a.lastMessageAt || a.createdAt || '2000'
      const tb = b.lastMessageAt || b.createdAt || '2000'
      return new Date(tb) - new Date(ta)
    })

    res.json({ conversations: all, total: all.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const { from, to, days } = req.query
    const now = new Date()

    // Define período (padrão: últimos 30 dias)
    let startDate = from
    let endDate   = to
    if (!startDate) {
      const d = parseInt(days) || 30
      if (d > 0) {
        const s = new Date(now)
        s.setDate(s.getDate() - d)
        startDate = s.toISOString().split('T')[0]
      }
    }
    if (!endDate) endDate = now.toISOString().split('T')[0]

    // Usa Supabase diretamente para ter contract_value e dados precisos
    let period = []
    if (db.DB_READY()) {
      const rows = await db.getDashboardStats({ start: startDate, end: endDate })
      if (rows) period = rows
    }

    // Fallback: cache em memória
    if (!period.length) {
      const all = await getAllConversations()
      period = all.filter(c => {
        if (!startDate && !endDate) return true
        const d = new Date(c.createdAt)
        if (startDate && d < new Date(startDate + 'T00:00:00')) return false
        if (endDate   && d > new Date(endDate   + 'T23:59:59')) return false
        return true
      })
    }

    const isCanceled = c => (c.labels || []).some(l => l.toLowerCase() === 'cancelado')
    const pagos = period.filter(c => c.column === 'pago')

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const totalVendido = pagos.reduce((s, c) => s + (Number(c.contractValue) || 0), 0)
    const summary = {
      totalLeads:          period.length,
      emNegociacao:        period.filter(c => c.column === 'negociacao').length,
      aguardandoPagamento: period.filter(c => c.column === 'aguardando_pagamento').length,
      pagos:               pagos.length,
      cancelados:          period.filter(isCanceled).length,
      perdidos:            period.filter(c => c.column === 'sem_retorno').length,
      totalVendido,
    }

    // ── FUNIL ────────────────────────────────────────────────────────────────
    const total = period.length || 1
    const funnelStages = [
      { stage: 'Leads',       column: 'leads',                color: '#3b82f6' },
      { stage: 'Negociação',  column: 'negociacao',           color: '#8b5cf6' },
      { stage: 'Ag. Cotação', column: 'aguardando_cotacao',   color: '#f59e0b' },
      { stage: 'Agendado',    column: 'agendado',             color: '#06b6d4' },
      { stage: 'Ag. Pgto',   column: 'aguardando_pagamento', color: '#f97316' },
      { stage: 'Pago',        column: 'pago',                 color: '#22c55e' },
      { stage: 'Sem Retorno', column: 'sem_retorno',          color: '#6b7280' },
    ]
    const funnel = funnelStages.map(s => {
      const count = period.filter(c => c.column === s.column).length
      const valor = s.column === 'pago'
        ? period.filter(c => c.column === s.column).reduce((acc, c) => acc + (Number(c.contractValue) || 0), 0)
        : null
      return { ...s, count, pct: Math.round((count / total) * 100), valor }
    })

    // ── GRÁFICO DIÁRIO (período filtrado) ─────────────────────────────────────
    const dayMap = {}
    period.forEach(c => {
      const day = (c.createdAt || '').split('T')[0]
      if (!day) return
      if (!dayMap[day]) dayMap[day] = { date: day, leads: 0, aguardando: 0, pagos: 0, cancelados: 0, valor: 0 }
      dayMap[day].leads++
      if (c.column === 'aguardando_pagamento') dayMap[day].aguardando++
      if (c.column === 'pago') { dayMap[day].pagos++; dayMap[day].valor += Number(c.contractValue) || 0 }
      if (isCanceled(c)) dayMap[day].cancelados++
    })
    const chartData = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))

    // Fallback: agrupa por semana se período > 60 dias (evita gráfico muito denso)
    const monthlyData = chartData.length > 60
      ? (() => {
          const wMap = {}
          chartData.forEach(d => {
            const dt = new Date(d.date)
            const wk = `${dt.getFullYear()}-W${String(Math.ceil(dt.getDate() / 7)).padStart(2,'0')}`
            if (!wMap[wk]) wMap[wk] = { month: d.date.slice(5,10), leads: 0, pagos: 0, aguardando: 0, valor: 0 }
            wMap[wk].leads     += d.leads
            wMap[wk].pagos     += d.pagos
            wMap[wk].aguardando += d.aguardando
            wMap[wk].valor     += d.valor
          })
          return Object.values(wMap)
        })()
      : chartData.map(d => ({ month: d.date.slice(5,10), leads: d.leads, pagos: d.pagos, aguardando: d.aguardando, valor: d.valor }))

    // ── RANKING ───────────────────────────────────────────────────────────────
    const agentMap = {}
    period.forEach(c => {
      const name = c.assigneeName || 'Sem vendedor'
      if (name === 'Sem vendedor') return
      if (!agentMap[name]) agentMap[name] = { name, leads: 0, pagos: 0, aguardando: 0, cancelados: 0, totalVendido: 0 }
      agentMap[name].leads++
      if (c.column === 'pago')                 { agentMap[name].pagos++;     agentMap[name].totalVendido += Number(c.contractValue) || 0 }
      if (c.column === 'aguardando_pagamento')   agentMap[name].aguardando++
      if (isCanceled(c))                         agentMap[name].cancelados++
    })
    const ranking = Object.values(agentMap)
      .map(a => ({ ...a, conversao: a.leads > 0 ? Math.round((a.pagos / a.leads) * 100) : 0 }))
      .sort((a, b) => b.totalVendido - a.totalVendido || b.pagos - a.pagos)

    const convRate = total > 0 ? Math.round((pagos.length / total) * 100) : 0

    res.json({ summary, funnel, monthlyData, ranking, convRate, period: { start: startDate, end: endDate } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── SEARCH ──────────────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q, column, assignee, product, agentId, role } = req.query
    const qTrim = (q || '').trim()
    if (!qTrim || qTrim.length < 2) return res.json({ results: [], total: 0 })

    const normalizePhone = (s) => (s || '').replace(/[^0-9]/g, '')
    const qPhone = normalizePhone(qTrim)
    // seenIds: dedup por conversation_id dentro de cada camada
    // phoneMap: dedup final por telefone — 1 contato = 1 resultado (conversa mais recente)
    const seenIds = new Set()
    const phoneMap = new Map()
    let results = []

    const addResult = (item) => {
      const phone = normalizePhone(item.phone || '')
      const key = phone || String(item.id)  // fallback para id se sem telefone
      const existing = phoneMap.get(key)
      if (!existing) {
        phoneMap.set(key, item)
      } else {
        // Mantém a conversa mais recente para o mesmo contato
        const dNew = new Date(item.lastMessageAt || item.updatedAt || 0).getTime()
        const dOld = new Date(existing.lastMessageAt || existing.updatedAt || 0).getTime()
        if (dNew > dOld) phoneMap.set(key, item)
      }
    }

    // ── CAMADA 1: Supabase leads — SEM filtro de status (inclui resolved/finalizados) ──
    if (db.DB_READY()) {
      try {
        const dbResults = await db.searchAll({ q: qTrim, assignedTo: role === 'vendedor' ? agentId : null })
        for (const r of (dbResults || [])) {
          const id = String(r.id)
          if (seenIds.has(id)) continue
          seenIds.add(id)
          addResult({ ...r, source: 'lead' })
        }
      } catch (e) { console.warn('[Search] Supabase error:', e.message) }
    }

    // ── CAMADA 2: Cache em memória (leads ativos) ──
    try {
      let all = await getAllConversations()
      if (role === 'vendedor' && agentId) all = all.filter(c => Number(c.assignedTo) === Number(agentId))
      const terms = qTrim.toLowerCase().split(/ +/)
      for (const c of all) {
        const id = String(c.id)
        if (seenIds.has(id)) continue
        const phoneNorm = normalizePhone(c.phone || '')
        const text = [c.name, c.phone, phoneNorm, c.lastMessage].join(' ').toLowerCase()
        const match = terms.every(t => text.includes(t)) ||
                      (qPhone.length >= 4 && phoneNorm.includes(qPhone))
        if (match) { seenIds.add(id); addResult({ ...c, source: 'lead' }) }
      }
    } catch (e) { console.warn('[Search] Cache error:', e.message) }

    // ── CAMADA 3: Chatwoot API — complementar ao Supabase ──
    // Sempre consultado, mas addResult só substitui se Chatwoot for mais recente
    if (CHATWOOT_READY) {
      try {
        const { contacts } = await cw.getContactsList({ q: qTrim, page: 1 })
        for (const contact of (contacts || []).slice(0, 10)) {
          const phone = contact.phone_number || ''
          const name  = contact.name || ''
          const phoneNorm = normalizePhone(phone)
          const convs = await cw.getContactConversations(contact.id)
          if (convs?.length) {
            // Usa a conversa mais recente desse contato
            const conv = convs.sort((a, b) => (b.last_activity_at || 0) - (a.last_activity_at || 0))[0]
            const id = String(conv.id)
            if (seenIds.has(id)) continue
            seenIds.add(id)
            const lastMsg = conv.last_non_activity_message
            addResult({
              id,
              name:          name || phone,
              phone,
              avatar:        name.slice(0, 2).toUpperCase() || '??',
              lastMessage:   lastMsg?.content || '',
              lastMessageAt: lastMsg?.created_at ? new Date(lastMsg.created_at * 1000).toISOString() : null,
              column:        null,
              status:        conv.status || 'resolved',
              assignedTo:    conv.meta?.assignee?.id || null,
              assigneeName:  conv.meta?.assignee?.name || '',
              source:        'chatwoot',
              chatwootData:  cw.mapConversation(conv, null),
            })
          } else {
            const cKey = 'c-' + contact.id
            if (!seenIds.has(cKey)) {
              seenIds.add(cKey)
              addResult({ id: cKey, name, phone, avatar: name.slice(0,2).toUpperCase() || '??', column: null, status: 'contact', source: 'contact' })
            }
          }
        }
      } catch (e) { console.warn('[Search] Chatwoot error:', e.message) }
    }

    // Monta array final do phoneMap (já deduplicado por telefone)
    results = Array.from(phoneMap.values())

    // Ordena: leads com unread → leads ativos → resolvidos/chatwoot → contatos
    const srcOrder = { lead: 0, chatwoot: 1, contact: 2 }
    results.sort((a, b) => {
      const so = (srcOrder[a.source] || 0) - (srcOrder[b.source] || 0)
      if (so !== 0) return so
      const ua = a.unreadCount || 0, ub = b.unreadCount || 0
      if (ua !== ub) return ub - ua
      return new Date(b.lastMessageAt || b.createdAt || 0) - new Date(a.lastMessageAt || a.createdAt || 0)
    })

    console.log(`[Search] "${qTrim}" → ${results.length} únicos por telefone (leads:${results.filter(r=>r.source==='lead').length} chatwoot:${results.filter(r=>r.source==='chatwoot').length})`)
    res.json({ results: results.slice(0, 20), total: results.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── AVATAR UPLOAD ───────────────────────────────────────────────────────────
const path = require('path')
const fs = require('fs')

// Multer memory storage — envia para Supabase Storage (não salva no disco)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    cb(null, allowed.includes(file.mimetype))
  }
})

app.post('/api/agents/:agentId/avatar', avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo inválido' })
  const agentId = req.params.agentId

  try {
    // Tenta Supabase Storage primeiro
    if (db.DB_READY && db.DB_READY()) {
      const { createClient } = require('@supabase/supabase-js')
      const supa = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } })

      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg'
      const filename = `agent_${agentId}${ext}`

      // Cria bucket se não existir
      await supa.storage.createBucket('avatars', { public: true }).catch(() => {})

      // Faz upload
      const { error } = await supa.storage
        .from('avatars')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        })

      if (!error) {
        const { data } = supa.storage.from('avatars').getPublicUrl(filename)
        const url = data.publicUrl
        store.setMeta(`avatar_${agentId}`, { avatarUrl: url })
        return res.json({ ok: true, url })
      }
    }

    // Fallback: base64 no store (sem Supabase Storage)
    const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    store.setMeta(`avatar_${agentId}`, { avatarUrl: b64 })
    res.json({ ok: true, url: b64 })

  } catch (e) {
    console.error('[Avatar] Erro:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/agents/:agentId/avatar', (req, res) => {
  const meta = store.getMeta(`avatar_${req.params.agentId}`)
  res.json({ url: meta?.avatarUrl || null })
})

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC })
})

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, agentId } = req.body
  if (!subscription) return res.status(400).json({ error: 'subscription required' })
  const key = agentId || 'anon'
  pushSubscriptions.set(key, subscription)
  console.log(`[Push] Agente ${key} inscrito. Total: ${pushSubscriptions.size}`)
  // Persiste no Supabase para sobreviver a redeploy
  if (db.DB_READY()) {
    db.savePushSubscription(key, subscription).catch(() => {})
  }
  res.json({ ok: true })
})

app.delete('/api/push/unsubscribe', (req, res) => {
  const { agentId, endpoint } = req.body
  if (endpoint) {
    // Remove dispositivo específico pelo endpoint
    for (const [key, entry] of pushSubscriptions) {
      if (entry.subscription?.endpoint === endpoint) {
        pushSubscriptions.delete(key)
        if (db.DB_READY()) db.deletePushSubscription?.(key).catch(() => {})
        break
      }
    }
  } else {
    // Remove todos os dispositivos do agente
    for (const [key, entry] of pushSubscriptions) {
      if (entry.agentId === String(agentId || 'anon')) pushSubscriptions.delete(key)
    }
  }
  res.json({ ok: true })
})

// Set global de dedup para notificações (webhook + polling podem detectar a mesma msg)
const notifiedMsgIds = new Set()
setInterval(() => { if (notifiedMsgIds.size > 2000) notifiedMsgIds.clear() }, 60000)

// Dedup para conversation_created — evita card duplo quando webhook dispara múltiplas vezes
// (ex: cliente envia 3 fotos simultâneas → 3 eventos para a mesma conversation_id)
const recentNewConversations = new Map() // conversationId → timestamp
setInterval(() => {
  const cutoff = Date.now() - 30000
  for (const [id, ts] of recentNewConversations) {
    if (ts < cutoff) recentNewConversations.delete(id)
  }
}, 30000)

// IDs de agentes supervisores — recebem push de todas as conversas
function isSupervisorAgent(agentId) {
  const supervisorIds = new Set(['1', '11', '12'])  // CRM CLOW, Leandro, Safira
  return supervisorIds.has(String(agentId))
}

async function sendPushToAssigned(conversationId, title, body, data = {}) {
  if (!pushSubscriptions.size) return
  const payload = JSON.stringify({
    title, body, data,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   data.tag || `conv-${conversationId}`,  // agrupa notificações da mesma conversa
    renotify: true,
  })

  // Store em memória primeiro (rápido, sem query)
  let assignedTo = null
  const cached = store.getCache()
  if (cached?.[String(conversationId)]) {
    assignedTo = cached[String(conversationId)].assignedTo
      ? String(cached[String(conversationId)].assignedTo) : null
  }
  // Fallback: meta do store
  if (!assignedTo) {
    const meta = store.getMeta(conversationId)
    assignedTo = meta?.assignedTo ? String(meta.assignedTo) : null
  }
  // Última opção: Supabase (só se não achou no cache)
  if (!assignedTo && db.DB_READY()) {
    try {
      const lead = await db.getLeadById(conversationId)
      assignedTo = lead?.assignedTo ? String(lead.assignedTo) : null
    } catch {}
  }

  let sent = 0
  const sendWithRetry = async (deviceKey, agentId, sub, retries = 2) => {
    try {
      await webpush.sendNotification(sub, payload)
      console.log(`[Push] 🔔 Enviado: agente=${agentId} device=${deviceKey.slice(0,16)}...`)
      return true
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expirada ou inválida — remove
        pushSubscriptions.delete(deviceKey)
        if (db.DB_READY()) db.deletePushSubscription?.(deviceKey).catch(() => {})
        console.warn(`[Push] Subscription expirada removida: ${deviceKey.slice(0,16)}...`)
        return false
      }
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500))
        return sendWithRetry(deviceKey, agentId, sub, retries - 1)
      }
      console.warn(`[Push] Falha após retries: ${err.message}`)
      return false
    }
  }

  const promises = []
  for (const [deviceKey, entry] of pushSubscriptions) {
    const { agentId: entryAgentId, subscription: sub } = entry
    const shouldNotify = !assignedTo || entryAgentId === assignedTo || isSupervisorAgent(entryAgentId)
    if (!shouldNotify) continue
    promises.push(sendWithRetry(deviceKey, entryAgentId, sub))
    sent++
  }
  await Promise.allSettled(promises)
  if (sent > 0) console.log(`[Push] Enviado para ${sent} dispositivo(s) (conv=${conversationId} assigned=${assignedTo || 'todos'})`)
}

// Ponto de entrada único para notificações — garante dedup entre webhook e polling
function notifyInbound(msgId, conversationId, senderName, content) {
  if (!msgId) return
  const key = String(msgId)
  if (notifiedMsgIds.has(key)) return
  notifiedMsgIds.add(key)
  console.log(`[Push] 📩 Nova msg inbound id=${msgId} conv=${conversationId}`)
  sendPushToAssigned(
    conversationId,
    `💬 ${senderName || 'Cliente'}`,
    (content || 'Nova mensagem').slice(0, 120),
    { conversationId, url: '/conversas' }
  ).catch(e => console.warn('[Push] Erro:', e.message))
}

// ─── NOTAS INTERNAS ──────────────────────────────────────────────────────────
// Notas ficam no store como metadados da conversa
app.get('/api/conversations/:id/notes', (req, res) => {
  const meta = store.getMeta(req.params.id)
  res.json({ notes: meta.notes || [] })
})

app.post('/api/conversations/:id/notes', (req, res) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' })
  const meta = store.getMeta(req.params.id)
  const notes = meta.notes || []
  const note = {
    id: Date.now().toString(),
    content: content.trim(),
    author: req.user?.name || 'Agente',
    createdAt: new Date().toISOString(),
  }
  notes.unshift(note)
  store.setMeta(req.params.id, { notes })
  io.emit('note_added', { conversationId: req.params.id, note })
  res.json({ ok: true, note })
})

app.delete('/api/conversations/:id/notes/:noteId', (req, res) => {
  const meta = store.getMeta(req.params.id)
  const notes = (meta.notes || []).filter(n => n.id !== req.params.noteId)
  store.setMeta(req.params.id, { notes })
  res.json({ ok: true })
})

// ─── TEMPLATES DE MENSAGEM ────────────────────────────────────────────────────
// Templates ficam no store global (id='_templates')
app.get('/api/templates', (req, res) => {
  const meta = store.getMeta('_templates')
  res.json({ templates: meta.list || getDefaultTemplates() })
})

app.post('/api/templates', (req, res) => {
  const { title, content } = req.body
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Título e conteúdo obrigatórios' })
  const meta = store.getMeta('_templates')
  const list = meta.list || getDefaultTemplates()
  const tpl = { id: Date.now().toString(), title: title.trim(), content: content.trim() }
  list.push(tpl)
  store.setMeta('_templates', { list })
  res.json({ ok: true, template: tpl })
})

app.delete('/api/templates/:id', (req, res) => {
  const meta = store.getMeta('_templates')
  const list = (meta.list || []).filter(t => t.id !== req.params.id)
  store.setMeta('_templates', { list })
  res.json({ ok: true })
})

function getDefaultTemplates() {
  return [
    { id: 't1', title: 'Saudação', content: 'Olá, {{nome}}! 😊 Tudo bem? Aqui é da PV Corretora. Como posso te ajudar hoje?' },
    { id: 't2', title: 'Aguardando retorno', content: 'Oi {{nome}}, tudo bem? Estou aguardando seu retorno para darmos continuidade ao seu seguro. Quando você tiver um momento?' },
    { id: 't3', title: 'Envio de cotação', content: 'Segue em anexo a cotação conforme conversamos. Qualquer dúvida estou à disposição! 👍' },
    { id: 't4', title: 'Confirmação de pagamento', content: 'Ótimo {{nome}}! Pagamento confirmado ✅ Vou já providenciar a apólice. Em breve envio mais informações!' },
    { id: 't5', title: 'Agendamento', content: 'Perfeito! Agendado para {{data}}. Qualquer coisa me chame. Até lá! 📅' },
  ]
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────
app.post('/api/conversations/:id/typing', (req, res) => {
  const { isTyping } = req.body
  io.emit('agent_typing', {
    conversationId: req.params.id,
    agentName: req.user?.name || 'Agente',
    isTyping: !!isTyping,
  })
  res.json({ ok: true })
})

// ─── WEBHOOK TEST — verifica se o URL está correto ──────────────────────────
app.get('/api/chatwoot/webhook', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook endpoint ativo. Configure este URL no Chatwoot como webhook.',
    timestamp: new Date().toISOString(),
  })
})

// ─── WEBHOOK CHATWOOT ────────────────────────────────────────────────────────
app.post('/api/chatwoot/webhook', async (req, res) => {
  console.log('[WH] 📨 Evento recebido:', req.body?.event, '— conv:', req.body?.data?.conversation?.id || req.body?.data?.id || 'n/a')
  const { event, data } = req.body
  if (!data) return res.json({ ok: true })

  // Chatwoot dispara conversation_typing_on/off quando cliente digita
  if (event === 'conversation_typing_on' || event === 'conversation_typing_off') {
    const conversationId = String(data.id || data.conversation_id)
    io.emit('contact_typing', {
      conversationId,
      isTyping: event === 'conversation_typing_on',
    })
    return res.json({ ok: true })
  }

  if (event === 'message_created') {
    const t0 = Date.now()
    const msg = cw.mapMessage(data)
    const conversationId = String(data.conversation?.id || data.conversation_id)
    const now = new Date().toISOString()
    const content = data.content || (data.attachments?.length ? '[Arquivo]' : '')
    // Filtra mensagens privadas (notas internas do Chatwoot)
    if (data.private === true || data.message_type === 2) return res.json({ ok: true })

    const mt = data.message_type
    const isInbound = mt === 0 || mt === '0' || mt === 'incoming' || mt === 'inbound'

    // ── 1. Cache local — síncrono, zero latência ──────────────────────────────
    store.updateLastMessage(conversationId, content)
    store.updateLastMessageAt(conversationId, content, now)
    _colIdx = null

    // ── 2. Socket — emite IMEDIATAMENTE, antes de qualquer I/O ───────────────
    const senderName = data.conversation?.meta?.sender?.name || data.sender?.name || ''
    io.emit('new_message', {
      conversationId,
      message: { ...msg, senderName },
      lastMessageAt: now,
      content,
      isInbound,
      senderName,
    })
    console.log(`[WH] socket new_message +${Date.now()-t0}ms conv=${conversationId} type=${isInbound?'IN':'OUT'} "${content.slice(0,30)}"`)

    if (isInbound) {
      // unread no store (síncrono) — emite imediatamente com valor local
      const unreadCount = store.incrementUnread(conversationId)
      io.emit('unread_update', { conversationId, count: unreadCount, updatedAt: now })

      // Push em background
      const contactName = data.conversation?.meta?.sender?.name || 'Cliente'
      setImmediate(() => notifyInbound(data.id || data.message_id, conversationId, contactName, content))
    }

    // ── 3. Supabase em background — não bloqueia resposta do webhook ──────────
    if (db.DB_READY()) {
      setImmediate(async () => {
        try {
          db.updateLastMessage(conversationId, content, now).catch(() => {})
          if (isInbound) {
            const result = await db.incrementUnread(conversationId).catch(() => null)
            if (result?.updated_at && result.updated_at !== now) {
              io.emit('unread_update', { conversationId, count: store.getUnread(conversationId), updatedAt: result.updated_at })
            }
          }
        } catch (e) { console.warn('[WH] Supabase background error:', e.message) }
      })
    }

    console.log(`[WH] webhook respondido em +${Date.now()-t0}ms conv=${conversationId}`)
    polling.webhookPing()  // pausa polling por 10s — evita concorrência webhook+polling
  }

  if (event === 'conversation_created') {
    const conversationId = String(data.id)
    // Filtra inbox se configurado
    if (targetInboxId && data.inbox_id !== targetInboxId) return res.json({ ok: true })
    // Dedup: ignora se já emitimos new_conversation para este conversation_id nos últimos 30s
    if (recentNewConversations.has(conversationId)) {
      console.log(`[Webhook] conversation_created DEDUP conv=${conversationId} — ignorado`)
      return res.json({ ok: true })
    }
    recentNewConversations.set(conversationId, Date.now())
    store.setColumn(conversationId, 'leads')
    store.invalidateCache()
    // Persiste no Supabase
    if (db.DB_READY()) {
      const mapped = cw.mapConversation(data, 'leads')
      db.upsertLead({ ...mapped, unreadCount: 1 }).catch(() => {})
    }
    console.log(`[Webhook] ✅ new_conversation conv=${conversationId}`)
    io.emit('new_conversation', cw.mapConversation(data, 'leads'))
  }

  // Conversa reaberta (cliente respondeu após ser finalizada)
  if (event === 'conversation_status_changed' && data.status === 'open') {
    const convId = String(data.id)
    const currentCol = store.getColumn(convId)
    // Se estava finalizada (não tinha coluna ativa), volta para leads
    if (!currentCol || currentCol === 'finalizado') {
      console.log(`[Webhook] Conversa ${convId} reaberta → leads`)
      store.setColumn(convId, 'leads')
      store.resetUnread && store.resetUnread(convId)
      store.invalidateCache()
      if (db.DB_READY()) db.updateMeta(convId, { column: 'leads' }).catch(() => {})
      io.emit('lead_moved', { id: convId, column: 'leads', fromColumn: 'finalizado' })
      io.emit('unread_update', { conversationId: convId, count: 1, updatedAt: new Date().toISOString() })
    }
  }

  if (event === 'conversation_updated') {
    const convId = String(data.id)
    const rawLabels = data.labels || []

    // Resolve coluna a partir das labels (crm_xxx tem prioridade, depois labels de posição)
    const newColumn = cw.resolveColumnFromLabels(rawLabels)
    const currentCol = store.getColumn(convId)
    const KANBAN = new Set(['lead','leads','negociacao','negociação','aguardando_cotacao',
      'agendado','lancar_venda','aguardando_pagamento','pago','fechado','sem_retorno','perdido'])
    const freeLabels = rawLabels.filter(l => !l.startsWith('crm_') && !KANBAN.has(l.toLowerCase()))

    // Salva nova coluna no store SE mudou (sincroniza Chatwoot → T-CRM)
    if (newColumn && newColumn !== currentCol) {
      store.setColumn(convId, newColumn)
      store.invalidateCache()
      // Persiste nova coluna E reabre se estava resolvido
      if (db.DB_READY()) {
        db.updateMeta(convId, { column: newColumn, status: 'open' }).catch(() => {})
      }
      // Reabre no Chatwoot se estava resolvido (label mudou = intenção de retomar)
      if (CHATWOOT_READY && data.status === 'resolved') {
        cw.reopenConversation(convId).catch(() => {})
      }
      // Busca lead completo para emitir com dados atualizados
      let leadData = null
      const cached = store.getCache()
      if (cached?.[convId]) leadData = { ...cached[convId], column: newColumn }
      io.emit('lead_moved', {
        id:         convId,
        column:     newColumn,
        fromColumn: currentCol,
        lead:       leadData,
      })
      console.log(`[Webhook] Conversa ${convId}: ${currentCol} → ${newColumn} (persistido)`)
    } else {
      store.invalidateCache()
    }

    // Se resolvida no Chatwoot → sem_retorno (exceto pago)
    if (data.status === 'resolved') {
      const col = store.getColumn(convId)
      if (col !== 'pago') {
        store.setColumn(convId, 'sem_retorno')
        store.invalidateCache()
        io.emit('lead_moved', { id: convId, column: 'sem_retorno', fromColumn: col })
      }
    }

    io.emit('conversation_updated', {
      id: convId,
      labels: freeLabels,
      column: newColumn || null,
    })
  }

  res.json({ ok: true })
})

// ─── USERS (legacy) ──────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => res.json(require('./data/mockData').users))

// ─── CRON DE AGENDAMENTOS ────────────────────────────────────────────────────
// Dedup em memória: chave = `${leadId}_${scheduledAt}`
// Limpa a cada 2h para não acumular indefinidamente
const cronNotifiedSet = new Set()
setInterval(() => cronNotifiedSet.clear(), 2 * 60 * 60 * 1000)

async function runScheduleCron() {
  if (!db.DB_READY()) return
  try {
    const due = await db.getScheduledDue()
    if (!due.length) return

    const fresh = due.filter(l => {
      const key = `${l.id}_${l.scheduledAt}`
      return !cronNotifiedSet.has(key)
    })
    if (!fresh.length) return

    console.log(`[Cron] ${fresh.length} agendamento(s) para notificar`)

    for (const lead of fresh) {
      // Marca no Set ANTES de enviar (dedup em memória)
      const key = `${lead.id}_${lead.scheduledAt}`
      cronNotifiedSet.add(key)

      const title = `🔔 Contato agora: ${lead.name}`
      const body  = lead.observacao || `Tel: ${lead.phone}`

      // Push para agente atribuído (ou todos os supervisores se não atribuído)
      await sendPushToAssigned(
        lead.id,
        title,
        body,
        { type: 'schedule', conversationId: String(lead.id), url: '/agendamento' }
      ).catch(e => console.warn('[Cron] Push error:', e.message))

      // Socket para frontend aberto (popup + som)
      io.emit('schedule_alarm', {
        lead,
        title,
        body,
      })

      console.log(`[Cron] ✅ Notificado: ${lead.name} (conv=${lead.id}) agendado ${lead.scheduledAt}`)
    }
  } catch (e) {
    console.error('[Cron] Erro no cron de agendamentos:', e.message)
  }
}

// Inicia cron após servidor estar pronto (aguarda DB)
let schedulesCronStarted = false

// ─── START ───────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   T-CRM — PV Corretora de Seguros        ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log('▶  Backend: http://localhost:' + PORT)

  if (!CHATWOOT_READY) {
    console.log('⚠️  Chatwoot NÃO configurado — rodando com dados mock')
    console.log('   Configure o arquivo backend/.env')
    return
  }

  console.log('✅ Chatwoot: ' + process.env.CHATWOOT_URL)
  console.log('✅ Supervisores: ' + SUPERVISORS.join(', '))
  console.log('🔑 Token: ' + process.env.CHATWOOT_TOKEN.slice(0,6) + '...')
  await initInboxFilter()
  console.log('\n📌 Webhook URL para configurar no Chatwoot:')
  console.log('   http://SEU-IP:' + PORT + '/api/chatwoot/webhook')
  console.log('\n🔍 Diagnóstico: http://localhost:' + PORT + '/api/debug')
  // Inicializa Supabase
  db.init()

  // Pré-aquece o cache assim que o servidor sobe
  console.log('⏳ Pré-carregando conversas...')
  getAllConversations()
    .then(async all => {
      console.log(`✅ Cache pronto: ${all.length} conversas`)
      // Sincroniza para o Supabase em background
      if (db.DB_READY()) {
        db.upsertMany(all).then(() => console.log('✅ Supabase sincronizado'))
      }
      // Inicia cron de agendamentos (60s) — notifica mesmo com app fechado
      if (!schedulesCronStarted) {
        schedulesCronStarted = true
        // Primeiro check em 30s (aguarda warmup completo)
        setTimeout(() => {
          runScheduleCron()
          setInterval(runScheduleCron, 60 * 1000)
          console.log('⏰ Cron de agendamentos ativo (60s)')
        }, 30 * 1000)
      }

      // Restaura push subscriptions do Supabase (sobrevivem a redeploy)
      if (db.DB_READY()) {
        db.loadPushSubscriptions().then(subs => {
          subs.forEach(({ agentId, subscription }) => {
            pushSubscriptions.set(agentId, subscription)
          })
          if (subs.length) console.log(`[Push] ${subs.length} subscriptions restauradas do Supabase`)
        }).catch(() => {})
      }

      // Restaura store do Supabase se necessário (protege contra redeploy Railway)
      if (db.DB_READY()) {
        await store.restoreFromSupabase(() => db.getAll()).catch(() => {})
      }

      // Inicia polling do Chatwoot (substitui webhook quando VPS não alcança Railway)
      polling.start({
        cw,
        io,
        store,
        db,
        targetInboxId,
        mapMessage: cw.mapMessage,
        mapConversation: cw.mapConversation,
        notifyInbound,  // push redundante via polling quando webhook falha
        recentNewConversations,  // dedup compartilhado webhook↔polling
      })
    })
    .catch(e => console.warn('⚠️  Pré-carga falhou:', e.message))

  // Mantém o cache sempre aquecido — atualiza a cada 50s
  // (backend TTL é 60s, então sempre haverá cache fresco)
  setInterval(() => {
    store.invalidateCache()
    getAllConversations().catch(e => console.warn('Cache refresh error:', e.message))
  }, 50 * 1000)
  console.log('')
})
