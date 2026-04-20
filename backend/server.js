require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const multer = require('multer')
const cw = require('./chatwoot')
const store = require('./store')

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
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } })
io.on('connection', s => {
  s.on('disconnect', () => {})
})

app.use(cors())
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
  for (let page = 1; page <= 5; page++) {
    const batch = await cw.getConversations({ page, status: 'open', inboxId: targetInboxId || undefined })
    if (!batch.length) break
    all.push(...batch)
    if (batch.length < 25) break
  }
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

    // 5. Conversa com status "resolved" E sem label crm_ (nunca passou pelo kanban)
    if (conv.status === 'resolved') {
      const hasKanbanLabel = (conv.labels || []).some(l => l.startsWith('crm_'))
      if (!hasKanbanLabel) return true
    }

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
  store.setCache(map)
  } finally {
    fetchingConversations = null
    if (resolveFetch) resolveFetch()
  }
  return Object.values(store.getCache())
}

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

app.get('/api/kanban/:column', async (req, res) => {
  try {
    const { column } = req.params
    const { page = 1, limit = 5, agentId, role } = req.query
    const pg = parseInt(page), lm = parseInt(limit)

    // Retorna do cache imediatamente se disponível
    let all = store.getCache()
    if (all) {
      all = Object.values(all)
    } else {
      // Cache expirado: inicia fetch em background e responde vazio (frontend vai retentar)
      if (!fetchingConversations) {
        getAllConversations().catch(e => console.warn('bg fetch error:', e.message))
      }
      // Responde com dados do store local enquanto o cache não está pronto
      // Isso evita o spinner longo
      all = []
    }

    let filtered = all.filter(c => c.column === column)
    if (role === 'vendedor' && agentId) {
      filtered = filtered.filter(c => c.assignedTo === agentId)
    }

    const offset = (pg - 1) * lm
    const items = filtered.slice(offset, offset + lm)
    res.json({ items, total: filtered.length, page: pg, hasMore: offset + items.length < filtered.length, cacheReady: !!store.getCache() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/kanban/:id/move', async (req, res) => {
  try {
    const { id } = req.params
    const { column, fromColumn } = req.body
    store.setColumn(id, column)
    store.invalidateCache()

    // Atualiza label no Chatwoot em background
    if (CHATWOOT_READY) {
      cw.setKanbanLabel(id, column)
        .then(() => {})
        .catch(e => console.warn('Label update failed:', e.message))
    }

    io.emit('lead_moved', { id, column, fromColumn })
    res.json({ id, column })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/kanban/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params
    const { scheduledAt, observacao } = req.body
    store.setColumn(id, 'agendado')
    store.setMeta(id, { scheduledAt, observacao: observacao || '' })
    store.invalidateCache()
    if (CHATWOOT_READY) cw.setKanbanLabel(id, 'agendado').catch(e => console.warn(e.message))
    io.emit('lead_moved', { id, column: 'agendado', scheduledAt })
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
    if (CHATWOOT_READY) cw.setKanbanLabel(id, 'aguardando_pagamento').catch(e => console.warn(e.message))
    io.emit('lead_moved', { id, column: 'aguardando_pagamento', paymentDueDate })
    res.json({ id, column: 'aguardando_pagamento', paymentDueDate, observacao })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lista de agendamentos (para alarme no frontend)
app.get('/api/agendamentos', async (req, res) => {
  try {
    const all = await getAllConversations()
    const agendados = all
      .filter(c => c.column === 'agendado' && c.scheduledAt)
      .map(c => {
        const meta = store.getMeta(c.id)
        return { ...c, observacao: meta.observacao || '' }
      })
    res.json(agendados)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Lista de aguardando pagamento (para página de pagamentos)
app.get('/api/pagamentos', async (req, res) => {
  try {
    const all = await getAllConversations()
    const pagamentos = all
      .filter(c => c.column === 'aguardando_pagamento')
      .map(c => {
        const meta = store.getMeta(c.id)
        return { ...c, paymentDueDate: meta.paymentDueDate || null, observacao: meta.observacao || '' }
      })
    res.json(pagamentos)
  } catch (e) { res.status(500).json({ error: e.message }) }
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
    const mapped = agents.map(a => {
      const firstName = (a.name || '').split(' ')[0].toLowerCase()
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
    console.error('[Agents]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/conversations/:id/assign', async (req, res) => {
  try {
    const { id } = req.params
    const { agentId } = req.body
    if (CHATWOOT_READY) await cw.assignAgent(id, agentId)
    store.invalidateCache()
    io.emit('conversation_updated', { id })
    res.json({ ok: true, agentId })
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
    res.json({ messages, hasMore: false })
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

app.post('/api/conversations/:id/read', (req, res) => {
  const { id } = req.params
  store.resetUnread(id)
  io.emit('unread_update', { conversationId: id, count: 0 })
  res.json({ ok: true })
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

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const { from, to } = req.query
    const all = await getAllConversations()
    const now = new Date()

    // Filtra por período se informado
    const inPeriod = (conv) => {
      if (!from && !to) return true
      const d = new Date(conv.createdAt)
      if (from && d < new Date(from + 'T00:00:00')) return false
      if (to && d > new Date(to + 'T23:59:59')) return false
      return true
    }
    const period = all.filter(inPeriod)

    // Cancelados: leads com label 'cancelado' — excluídos do kanban mas contabilizados
    const cancelados = all.filter(c => (c.labels || []).some(l => l.toLowerCase() === 'cancelado'))

    // Stats do kanban (sem cancelados)
    const stats = ALL_COLUMNS.map(col => ({
      column: col,
      label: { leads:'Leads', negociacao:'Negociação', aguardando_cotacao:'Ag. Cotação',
        agendado:'Agendado', lancar_venda:'Lançar Venda', aguardando_pagamento:'Ag. Pgto',
        pago:'Pago', sem_retorno:'Sem Retorno' }[col] || col,
      count: period.filter(c => c.column === col).length,
    }))

    // Summary
    const summary = {
      totalLeads: period.length,
      emNegociacao: period.filter(c => c.column === 'negociacao').length,
      aguardandoPagamento: period.filter(c => c.column === 'aguardando_pagamento').length,
      pagos: period.filter(c => c.column === 'pago').length,
      cancelados: cancelados.filter(inPeriod).length,
      perdidos: period.filter(c => c.column === 'sem_retorno').length,
    }

    // Gráfico mensal de leads / ag. pagamento / pagos / cancelados
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const month = d.toLocaleDateString('pt-BR', { month: 'short' })
      const ml = all.filter(c => { const cr = new Date(c.createdAt); return cr >= d && cr < next })
      return {
        month: month.charAt(0).toUpperCase() + month.slice(1),
        leads: ml.length,
        aguardando_pagamento: ml.filter(c => c.column === 'aguardando_pagamento').length,
        pagos: ml.filter(c => c.column === 'pago').length,
        cancelados: ml.filter(c => (c.labels||[]).some(l=>l.toLowerCase()==='cancelado')).length,
      }
    })

    // Ranking de vendedores
    const agentMap = {}
    period.forEach(conv => {
      const name = conv.assigneeName || 'Não atribuído'
      if (!agentMap[name]) agentMap[name] = { name, leads: 0, pagos: 0, cancelados: 0, aguardando: 0 }
      agentMap[name].leads++
      if (conv.column === 'pago') agentMap[name].pagos++
      if (conv.column === 'aguardando_pagamento') agentMap[name].aguardando++
      if ((conv.labels||[]).some(l=>l.toLowerCase()==='cancelado')) agentMap[name].cancelados++
    })
    const ranking = Object.values(agentMap)
      .filter(a => a.name !== 'Não atribuído')
      .map(a => ({
        ...a,
        conversao: a.leads > 0 ? Math.round((a.pagos / a.leads) * 100) : 0
      }))
      .sort((a, b) => b.pagos - a.pagos || b.conversao - a.conversao)

    res.json({ stats, summary, monthlyData, ranking, cancelados: cancelados.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── WEBHOOK CHATWOOT ────────────────────────────────────────────────────────
app.post('/api/chatwoot/webhook', (req, res) => {
  const { event, data } = req.body
  if (!data) return res.json({ ok: true })

  if (event === 'message_created') {
    const msg = cw.mapMessage(data)
    const conversationId = String(data.conversation?.id || data.conversation_id)
    store.invalidateCache()
    store.updateLastMessage(conversationId, data.content || (data.attachments?.length ? '[Arquivo]' : ''))
    io.emit('new_message', { conversationId, message: msg })
    if (data.message_type === 0) {
      const count = store.incrementUnread(conversationId)
      io.emit('unread_update', { conversationId, count })
    }
  }

  if (event === 'conversation_created') {
    const conversationId = String(data.id)
    // Filtra inbox se configurado
    if (targetInboxId && data.inbox_id !== targetInboxId) return res.json({ ok: true })
    store.setColumn(conversationId, 'leads')
    store.invalidateCache()
    io.emit('new_conversation', cw.mapConversation(data, 'leads'))

  }

  if (event === 'conversation_updated') {
    store.invalidateCache()
    const convId = String(data.id)
    const rawLabels = data.labels || []
    const crmLabel = rawLabels.find(l => l.startsWith('crm_'))
    const KANBAN = new Set(['lead','leads','negociacao','negociação','aguardando_cotacao',
      'agendado','lancar_venda','aguardando_pagamento','pago','fechado','sem_retorno','perdido'])
    const freeLabels = rawLabels.filter(l => !l.startsWith('crm_') && !KANBAN.has(l.toLowerCase()))

    // Se conversa foi resolvida no Chatwoot → move para sem_retorno no kanban
    // (a menos que já esteja em pago)
    if (data.status === 'resolved') {
      const currentCol = store.getColumn(convId)
      if (currentCol !== 'pago') {
        store.setColumn(convId, 'sem_retorno')
      }
      io.emit('lead_moved', { id: convId, column: store.getColumn(convId) })
    }

    io.emit('conversation_updated', {
      id: convId,
      labels: freeLabels,
      column: crmLabel ? crmLabel.replace('crm_', '') : null,
    })
  }

  res.json({ ok: true })
})

// ─── USERS (legacy) ──────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => res.json(require('./data/mockData').users))

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
  // Pré-aquece o cache assim que o servidor sobe
  console.log('⏳ Pré-carregando conversas...')
  getAllConversations()
    .then(all => console.log(`✅ Cache pronto: ${all.length} conversas`))
    .catch(e => console.warn('⚠️  Pré-carga falhou:', e.message))

  // Mantém o cache sempre aquecido — atualiza a cada 50s
  // (backend TTL é 60s, então sempre haverá cache fresco)
  setInterval(() => {
    store.invalidateCache()
    getAllConversations().catch(e => console.warn('Cache refresh error:', e.message))
  }, 50 * 1000)
  console.log('')
})
