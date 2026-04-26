// ─── Supabase DB Layer ────────────────────────────────────────────────────────
// Substitui o store.json como fonte de verdade para os leads do kanban
// O store.json continua existindo para metadados (agendamentos, pagamentos, notas)

let createClient = null
let supabase = null
let DB_READY = false

function init() {
  const SUPABASE_URL = process.env.SB_URL || process.env.SUPABASE_URL || ''
  const SUPABASE_KEY = process.env.SB_KEY || process.env.SUPABASE_SERVICE_KEY || ''

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('⚠️  Supabase não configurado — usando store.json como fallback')
    return false
  }
  try {
    // Import lazy para não quebrar build
    if (!createClient) {
      createClient = require('@supabase/supabase-js').createClient
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    })
    DB_READY = true
    console.log('✅ Supabase conectado:', SUPABASE_URL)
    return true
  } catch (e) {
    console.error('❌ Supabase erro:', e.message)
    return false
  }
}

// ── Mapeamento: objeto interno → linha do banco ──────────────────────────────
function toRow(lead) {
  return {
    id: String(lead.id),
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    avatar: lead.avatar || '',
    kanban_column: lead.column || 'leads',
    last_message: lead.lastMessage || '',
    last_message_at: lead.lastMessageAt || lead.createdAt || null,
    created_at: lead.createdAt || null,
    unread_count: lead.unreadCount || 0,
    assigned_to: lead.assignedTo || null,
    assignee_name: lead.assigneeName || '',
    product: lead.product || '',
    labels: lead.labels || [],
    status: lead.status || 'open',
    inbox_id: lead.inboxId || null,
    contact_id: lead.contactId || null,
    scheduled_at: lead.scheduledAt || null,
    payment_due_date: lead.paymentDueDate || null,
    observacao: lead.observacao || '',
    updated_at: new Date().toISOString(),
  }
}

// ── Mapeamento: linha do banco → objeto interno ──────────────────────────────
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    avatar: row.avatar,
    column: row.kanban_column,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,  // timestamp de referência para conflitos
    unreadCount: row.unread_count || 0,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name,
    product: row.product,
    labels: row.labels || [],
    status: row.status,
    inboxId: row.inbox_id,
    contactId: row.contact_id,
    scheduledAt: row.scheduled_at,
    scheduleNotifiedAt: row.schedule_notified_at,
    paymentDueDate: row.payment_due_date,
    observacao: row.observacao,
    contractValue: row.contract_value || null,
  }
}

// ── Upsert: cria ou atualiza um lead ─────────────────────────────────────────
async function upsertLead(lead) {
  if (!DB_READY) return null
  const { error } = await supabase
    .from('leads')
    .upsert(toRow(lead), { onConflict: 'id' })
  if (error) console.error('[DB] upsert error:', error.message)
  return !error
}

// ── Update parcial de metadados (schedule/payment sem sobrescrever outros campos) ──
async function updateMeta(id, fields) {
  if (!DB_READY) return
  const row = {}
  if (fields.column !== undefined)         row.kanban_column     = fields.column
  if (fields.scheduledAt !== undefined)    row.scheduled_at      = fields.scheduledAt
  if (fields.paymentDueDate !== undefined) row.payment_due_date  = fields.paymentDueDate
  if (fields.observacao !== undefined)     row.observacao        = fields.observacao
  if (fields.contractValue !== undefined)  row.contract_value    = fields.contractValue
  if (fields.status !== undefined)         row.status            = fields.status
  if (fields.assignedTo !== undefined)     row.assigned_to       = fields.assignedTo ? Number(fields.assignedTo) : null
  if (fields.assigneeName !== undefined)   row.assignee_name     = fields.assigneeName
  row.updated_at = new Date().toISOString()
  const { error } = await supabase.from('leads').update(row).eq('id', String(id))
  if (error) console.error('[DB] updateMeta error:', error.message)
}

// ── Upsert em lote (sincronização inicial) ────────────────────────────────────
async function upsertMany(leads) {
  if (!DB_READY || !leads.length) return
  const rows = leads.map(toRow)
  // Divide em chunks de 100 para não exceder limite da API
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase
      .from('leads')
      .upsert(chunk, { onConflict: 'id' })
    if (error) console.error('[DB] upsertMany error:', error.message)
  }
  console.log(`[DB] Sincronizados ${leads.length} leads`)
}

// ── Query por coluna (kanban) ─────────────────────────────────────────────────
async function getByColumn(kanbanColumn, { limit = 15, offset = 0, assignedTo = null } = {}) {
  if (!DB_READY) return null

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('kanban_column', kanbanColumn)
    .neq('status', 'resolved')
    .order('unread_count', { ascending: false })
    .order('last_message_at', { ascending: false, nullsLast: true })
    .range(offset, offset + limit - 1)

  if (assignedTo) query = query.eq('assigned_to', Number(assignedTo))

  const { data, error, count } = await query

  if (error) {
    // "Requested range not satisfiable" = offset além do total — retorna vazio, não erro
    if (error.message.includes('range not satisfiable') || error.code === 'PGRST103') {
      return { items: [], total: 0 }
    }
    console.error('[DB] getByColumn error:', error.message)
    return null
  }
  return { items: (data || []).map(fromRow), total: count || 0 }
}

// ── Contagem por coluna ───────────────────────────────────────────────────────
async function getColumnCounts() {
  if (!DB_READY) return null
  const { data, error } = await supabase
    .from('leads')
    .select('kanban_column')
    .eq('status', 'open')

  if (error) { console.error('[DB] getColumnCounts error:', error.message); return null }
  const counts = {}
  for (const row of data || []) {
    counts[row.kanban_column] = (counts[row.kanban_column] || 0) + 1
  }
  return counts
}

// ── Atualiza coluna (mover lead) ──────────────────────────────────────────────
async function moveColumn(id, kanbanColumn) {
  if (!DB_READY) return
  const { error } = await supabase
    .from('leads')
    .update({ kanban_column: kanbanColumn, updated_at: new Date().toISOString() })
    .eq('id', String(id))
  if (error) console.error('[DB] moveColumn error:', error.message)
}

// ── Atualiza última mensagem ──────────────────────────────────────────────────
async function updateLastMessage(id, content, ts) {
  if (!DB_READY) return
  const { error } = await supabase
    .from('leads')
    .update({
      last_message: content,
      last_message_at: ts || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', String(id))
  if (error) console.error('[DB] updateLastMessage error:', error.message)
}

// ── Incrementa não lidas ──────────────────────────────────────────────────────
async function incrementUnread(id) {
  if (!DB_READY) return
  const now = new Date().toISOString()
  // Fallback atômico: lê, incrementa, salva com updated_at
  const { data: row } = await supabase
    .from('leads').select('unread_count').eq('id', String(id)).single()
  if (row) {
    const { error } = await supabase.from('leads')
      .update({ unread_count: (row.unread_count || 0) + 1, updated_at: now })
      .eq('id', String(id))
    if (error) console.error('[DB] incrementUnread error:', error.message)
    return { unread_count: (row.unread_count || 0) + 1, updated_at: now }
  }
}

// ── Zera não lidas ────────────────────────────────────────────────────────────
async function resetUnread(id) {
  if (!DB_READY) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('leads')
    .update({ unread_count: 0, updated_at: now })
    .eq('id', String(id))
  if (error) console.error('[DB] resetUnread error:', error.message)
  return now  // retorna timestamp para o caller emitir via socket
}

// ── Busca textual ─────────────────────────────────────────────────────────────
// Busca SEM filtro de status — inclui leads resolvidos/finalizados (para busca global)
async function searchAll({ q, assignedTo } = {}) {
  if (!DB_READY) return []
  const qPhone = (q || '').replace(/[^0-9]/g, '')
  let query = supabase.from('leads').select('*').limit(20)
  if (assignedTo) query = query.eq('assigned_to', Number(assignedTo))
  if (q && q.trim().length >= 2) {
    const orParts = [`name.ilike.%${q}%`, `phone.ilike.%${q}%`]
    if (qPhone.length >= 4) orParts.push(`phone.ilike.%${qPhone}%`)
    query = query.or(orParts.join(','))
  }
  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) { console.error('[DB] searchAll error:', error.message); return [] }
  return (data || []).map(fromRow)
}

async function search({ q, kanbanColumn, assigneeName, product, assignedTo } = {}) {
  if (!DB_READY) return null
  let query = supabase.from('leads').select('*').eq('status', 'open')

  if (kanbanColumn) query = query.eq('kanban_column', kanbanColumn)
  if (assignedTo) query = query.eq('assigned_to', Number(assignedTo))
  if (assigneeName) query = query.ilike('assignee_name', `%${assigneeName}%`)
  if (product) query = query.ilike('product', `%${product}%`)
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,last_message.ilike.%${q}%`)
  }

  query = query
    .order('unread_count', { ascending: false })
    .order('last_message_at', { ascending: false, nullsLast: true })
    .limit(50)

  const { data, error } = await query
  if (error) { console.error('[DB] search error:', error.message); return null }
  return (data || []).map(fromRow)
}

// ── Todos os leads (para dashboard/inbox) ────────────────────────────────────
async function getAll({ assignedTo = null } = {}) {
  if (!DB_READY) return null
  let query = supabase.from('leads').select('*').eq('status', 'open')
  if (assignedTo) query = query.eq('assigned_to', Number(assignedTo))
  query = query
    .order('unread_count', { ascending: false })
    .order('last_message_at', { ascending: false, nullsLast: true })
  const { data, error } = await query
  if (error) { console.error('[DB] getAll error:', error.message); return null }
  return (data || []).map(fromRow)
}

// Upsert sem sobrescrever unread_count (usado na sincronização periódica)
async function upsertManyNoUnread(leads) {
  if (!DB_READY || !leads.length) return
  const rows = leads.map(lead => {
    const r = toRow(lead)
    delete r.unread_count  // não sobrescreve — Supabase mantém o valor atual
    return r
  })
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { error } = await supabase
      .from('leads')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
    if (error) console.error('[DB] upsertManyNoUnread error:', error.message)
  }
}

// ── Push Subscriptions ───────────────────────────────────────────────────────
async function savePushSubscription(agentId, subscription) {
  if (!DB_READY) return
  // device_key = hash curto do endpoint — identifica dispositivo único por agente
  const deviceKey = String(agentId) + '_' + subscription.endpoint.slice(-32).replace(/[^a-zA-Z0-9]/g, '')
  const { error } = await supabase.from('push_subscriptions')
    .upsert({
      agent_id:   String(agentId),
      device_key: deviceKey,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString()
    }, { onConflict: 'device_key' })  // uniqueness por dispositivo, não por agente
  if (error) console.error('[DB] savePushSubscription error:', error.message)
}

async function getLeadById(id) {
  if (!DB_READY) return null
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', String(id))
    .single()
  if (error || !data) return null
  return fromRow(data)
}

// Busca agendamentos que devem disparar agora (janela ±5min, não notificados ainda)
async function getScheduledDue() {
  if (!DB_READY) return []
  const now   = new Date()
  const start = new Date(now.getTime() - 5 * 60 * 1000).toISOString()  // 5 min atrás
  const end   = new Date(now.getTime() + 60 * 1000).toISOString()      // 1 min à frente
  // Busca leads com scheduled_at dentro da janela
  // Não depende de coluna schedule_notified_at — dedup feito no cron via Set em memória
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
  if (error) { console.error('[DB] getScheduledDue error:', error.message); return [] }
  return (data || []).map(fromRow)
}

// Stub mantido por compatibilidade — dedup agora é feito pelo cron em memória
async function markScheduleNotified(id) {
  // dedup via Set no cron — não precisa de coluna no banco
}

// ── Timeline de ações por lead ────────────────────────────────────────────────
async function logAction(leadId, { agentName, action, fromCol, toCol, detail = '' } = {}) {
  if (!DB_READY) return
  await supabase.from('lead_timeline').insert({
    lead_id:    String(leadId),
    agent_name: agentName || 'Sistema',
    action,
    from_col:   fromCol || null,
    to_col:     toCol   || null,
    detail:     detail  || '',
    created_at: new Date().toISOString(),
  }).catch(() => {})  // silencioso — não quebra nada se tabela não existir ainda
}

async function getTimeline(leadId) {
  if (!DB_READY) return []
  const { data, error } = await supabase
    .from('lead_timeline')
    .select('*')
    .eq('lead_id', String(leadId))
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return []
  return data || []
}

// Dashboard: agrega dados direto do Supabase por período (mais preciso que cache)
async function getDashboardStats({ start, end } = {}) {
  if (!DB_READY) return null
  let query = supabase.from('leads').select('*')
  if (start) query = query.gte('created_at', start + 'T00:00:00')
  if (end)   query = query.lte('created_at', end + 'T23:59:59')
  const { data, error } = await query
  if (error) { console.error('[DB] getDashboardStats error:', error.message); return null }
  return (data || []).map(fromRow)
}

async function deletePushSubscription(agentId) {
  if (!DB_READY) return
  // Deleta assinatura específica do dispositivo, não todas do agente
  await supabase.from('push_subscriptions').delete().eq('device_key', String(agentId))
}

async function loadPushSubscriptions() {
  if (!DB_READY) return []
  const { data, error } = await supabase.from('push_subscriptions').select('agent_id, subscription')
  if (error || !data) return []
  return data.map(r => {
    try { return { agentId: r.agent_id, subscription: JSON.parse(r.subscription) } }
    catch { return null }
  }).filter(Boolean)
}

// ── Timeline de ações por lead ───────────────────────────────────────────────
async function logAction(leadId, { agentName, action, fromCol, toCol, detail } = {}) {
  if (!DB_READY) return
  supabase.from('lead_actions').insert({
    lead_id:    String(leadId),
    agent_name: agentName || 'Sistema',
    action:     action    || 'moved',
    from_col:   fromCol   || null,
    to_col:     toCol     || null,
    detail:     detail    || null,
    created_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error && !error.message.includes('does not exist')) {
      console.warn('[DB] logAction error:', error.message)
    }
  })
}

async function getActions(leadId) {
  if (!DB_READY) return []
  const { data, error } = await supabase
    .from('lead_actions')
    .select('*')
    .eq('lead_id', String(leadId))
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return []
  return data || []
}

module.exports = { init, DB_READY: () => DB_READY, _supabase: () => supabase, logAction, getTimeline, upsertLead, upsertMany, upsertManyNoUnread, getByColumn, getColumnCounts, moveColumn, updateLastMessage, incrementUnread, resetUnread, search, searchAll, getAll, getLeadById, fromRow, toRow, savePushSubscription, loadPushSubscriptions, deletePushSubscription, updateMeta, getScheduledDue, markScheduleNotified, getDashboardStats }
