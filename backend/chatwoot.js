// Chatwoot REST API wrapper — T-CRM
const BASE = () => `${process.env.CHATWOOT_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}`
const TOKEN = () => process.env.CHATWOOT_TOKEN

async function cw(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${BASE()}${path}`, {
      headers: { 'api_access_token': TOKEN(), 'Content-Type': 'application/json', ...options.headers },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`Chatwoot ${res.status}: ${await res.text()}`)
    return res.json()
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

async function cwForm(path, formData) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      headers: { 'api_access_token': TOKEN() },
      signal: controller.signal,
      body: formData,
    })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`Chatwoot upload ${res.status}: ${await res.text()}`)
    return res.json()
  } catch (e) {
    clearTimeout(timeout)
    throw e
  }
}

// ─── Conversas ───────────────────────────────────────────────────────────────

async function getConversations({ page = 1, status = 'open', inboxId } = {}) {
  let url = `/conversations?page=${page}&status=${status}&sort=last_activity_at`
  if (inboxId) url += `&inbox_id=${inboxId}`
  const data = await cw(url)
  return data?.data?.payload || []
}

async function getConversation(id) { return cw(`/conversations/${id}`) }

// ─── Mensagens ───────────────────────────────────────────────────────────────

async function getMessages(conversationId, before) {
  const url = before
    ? `/conversations/${conversationId}/messages?before=${before}`
    : `/conversations/${conversationId}/messages`
  const data = await cw(url)
  return data?.payload || []
}

async function sendMessage(conversationId, content) {
  return cw(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, message_type: 'outgoing', private: false }),
  })
}

async function sendAttachment(conversationId, buffer, filename, mimeType, caption = '') {
  const formData = new FormData()
  formData.append('attachments[]', new Blob([buffer], { type: mimeType }), filename)
  formData.append('message_type', 'outgoing')
  formData.append('private', 'false')
  if (caption) formData.append('content', caption)
  return cwForm(`/conversations/${conversationId}/messages`, formData)
}

// ─── Agentes ─────────────────────────────────────────────────────────────────

async function getAgents() {
  const data = await cw('/agents')
  return data || []
}

async function assignAgent(conversationId, agentId) {
  return cw(`/conversations/${conversationId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ assignee_id: agentId }),
  })
}

// ─── Inboxes ─────────────────────────────────────────────────────────────────

async function getInboxes() {
  const data = await cw('/inboxes')
  return data?.payload || []
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

async function getAccountLabels() {
  const data = await cw('/labels')
  return data?.payload || []
}

async function getConversationLabels(conversationId) {
  const data = await cw(`/conversations/${conversationId}/labels`)
  return data?.payload || []
}

async function setConversationLabels(conversationId, labels) {
  return cw(`/conversations/${conversationId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  })
}

// Mapa de labels do Chatwoot → colunas do T-CRM
// Aceita qualquer variação: underscores, hifens, acentos, etc.
// Mapa completo: label do Chatwoot → coluna do kanban T-CRM
// Inclui variações com/sem acento, underscores, hifens
const LABEL_TO_COLUMN = {
  // Leads
  'lead': 'leads', 'leads': 'leads',

  // Negociação
  'negociacao': 'negociacao', 'negociação': 'negociacao', 'em_negociacao': 'negociacao',
  'em_negociação': 'negociacao',

  // Aguardando Cotação
  'aguardando_cotacao': 'aguardando_cotacao',
  'aguardando_cotação': 'aguardando_cotacao',
  'aguardando-cotacao': 'aguardando_cotacao',
  'cotacao': 'aguardando_cotacao', 'cotação': 'aguardando_cotacao',

  // Agendado
  'agendado': 'agendado', 'agendamento': 'agendado',

  // Aguardando Documentação (label real da PV Corretora)
  'aguardando_documentacao': 'aguardando_cotacao',
  'aguardando_documentação': 'aguardando_cotacao',
  'aguardando documentacao': 'aguardando_cotacao',
  'documentacao': 'aguardando_cotacao',

  // Lançar Venda
  'lancar_venda': 'lancar_venda', 'lançar_venda': 'lancar_venda',
  'lancar-venda': 'lancar_venda', 'lançar-venda': 'lancar_venda',
  'venda': 'lancar_venda',

  // Aguardando Pagamento
  'aguardando_pagamento': 'aguardando_pagamento',
  'aguardando-pagamento': 'aguardando_pagamento',
  'aguardando pagamento': 'aguardando_pagamento',
  'pagamento': 'aguardando_pagamento',

  // Pago
  'pago': 'pago', 'pago_confirmado': 'pago', 'fechado': 'pago',

  // Sem Retorno
  'sem_retorno': 'sem_retorno', 'sem-retorno': 'sem_retorno',
  'sem retorno': 'sem_retorno', 'perdido': 'sem_retorno', 'inativo': 'sem_retorno',
}

function resolveColumn(labels, fallback = 'leads') {
  // Prioridade 1: label crm_ explícita (definida pelo próprio T-CRM)
  const crmLabel = labels.find(l => l.startsWith('crm_'))
  if (crmLabel) return crmLabel.replace('crm_', '')
  // Prioridade 2: label que mapeia para uma coluna conhecida
  for (const label of labels) {
    const mapped = LABEL_TO_COLUMN[label.toLowerCase().trim()]
    if (mapped) return mapped
  }
  return fallback
}

async function setKanbanLabel(conversationId, column) {
  const current = await getConversationLabels(conversationId)
  // Filtra: remove labels crm_ antigas e labels de posição kanban
  // PRESERVA SEMPRE: humano (desativa bot) e outras labels funcionais
  const cleaned = current.filter(l => {
    if (l.startsWith('crm_')) return false
    if (LABEL_TO_COLUMN[l.toLowerCase().trim()]) return false
    return true  // humano, urgente, vip, etc. — nunca remover
  })
  // Garante que 'humano' não seja perdido (belt-and-suspenders)
  const hadHumano = current.some(l => l.toLowerCase() === 'humano')
  const newLabels = [...cleaned, `crm_${column}`]
  if (hadHumano && !newLabels.some(l => l.toLowerCase() === 'humano')) {
    newLabels.push('humano')
  }
  return setConversationLabels(conversationId, newLabels)
}

// ─── Contatos ────────────────────────────────────────────────────────────────

async function getContactsList({ q = '', page = 1 } = {}) {
  function extract(data) {
    const p = data?.payload ?? data
    if (Array.isArray(p)) return { contacts: p, meta: data?.meta || {} }
    if (Array.isArray(p?.contacts)) return { contacts: p.contacts, meta: p.meta || data?.meta || {} }
    if (Array.isArray(p?.payload)) return { contacts: p.payload, meta: data?.meta || {} }
    return { contacts: [], meta: data?.meta || {} }
  }
  if (q && q.trim()) {
    return extract(await cw(`/contacts/search?q=${encodeURIComponent(q.trim())}&page=${page}&include_contacts=true`))
  }
  return extract(await cw(`/contacts?page=${page}&sort=last_activity_at`))
}

async function getContactConversations(contactId) {
  const data = await cw(`/contacts/${contactId}/conversations`)
  return data?.payload || []
}

// ─── Mapeamentos ─────────────────────────────────────────────────────────────

function mapConversation(conv, columnOverride) {
  const sender = conv.meta?.sender || {}
  const assignee = conv.meta?.assignee || conv.assignee || {}
  const lastMsg = conv.last_non_activity_message
  const rawLabels = conv.labels || []
  // Labels visíveis: excluir crm_ e labels de posição kanban (leads, negociacao, etc.)
  // Manter apenas labels funcionais como 'humano', 'urgente', 'vip', etc.
  // Labels internas do sistema que não devem aparecer como chips visuais
  const INTERNAL_LABELS = new Set(['bot', 'crm', 'sistema', 'auto'])
  const chatwootLabels = rawLabels.filter(l => {
    if (l.startsWith('crm_')) return false
    if (LABEL_TO_COLUMN[l.toLowerCase().trim()]) return false
    if (INTERNAL_LABELS.has(l.toLowerCase().trim())) return false
    return true
  })
  const column = columnOverride ?? resolveColumn(rawLabels)
  return {
    id: String(conv.id),
    chatwootId: conv.id,
    name: sender.name || `Contato #${conv.id}`,
    phone: sender.phone_number || '',
    email: sender.email || '',
    avatar: (sender.name || 'C').slice(0, 2).toUpperCase(),
    column,
    assignedTo: assignee.id ? String(assignee.id) : null,
    assigneeName: assignee.name || '',
    assigneeAvatar: assignee.name ? assignee.name.slice(0, 2).toUpperCase() : null,
    lastMessage: lastMsg?.content || (lastMsg?.attachments?.length ? '[Arquivo]' : ''),
    // Usa last_activity_at do Chatwoot como fonte primária (mais confiável)
    // É atualizado a cada msg enviada/recebida
    lastMessageAt: conv.last_activity_at
      ? new Date(conv.last_activity_at * 1000).toISOString()
      : lastMsg?.created_at
        ? new Date(lastMsg.created_at * 1000).toISOString()
        : conv.created_at ? new Date(conv.created_at * 1000).toISOString() : new Date().toISOString(),
    createdAt: conv.created_at ? new Date(conv.created_at * 1000).toISOString() : new Date().toISOString(),
    product: detectProduct(lastMsg?.content || ''),
    unreadCount: conv.unread_count || 0,
    labels: chatwootLabels,
    status: conv.status,
    contactId: sender.id ? String(sender.id) : null,
    inboxId: conv.inbox_id || null,
  }
}

function mapMessage(msg) {
  const attachments = (msg.attachments || []).map(att => ({
    id: String(att.id || Math.random()),
    fileType: att.file_type || 'file',
    url: att.data_url || att.data?.url || '',
    thumbUrl: att.thumb_url || '',
    filename: att.file?.path?.split('/').pop() || att.file?.filename || 'arquivo',
    fileSize: att.file_size || att.file?.size || 0,
    extension: att.extension || '',
  }))
  const senderName = msg.sender?.name || ''
  return {
    id: String(msg.id),
    chatwootId: msg.id,
    sender: msg.message_type === 0 ? 'lead' : msg.message_type === 2 ? 'activity' : 'agent',
    content: msg.content || '',
    timestamp: msg.created_at ? new Date(msg.created_at * 1000).toISOString() : new Date().toISOString(),
    type: msg.message_type,
    attachments,
    authorName: senderName,
    authorAvatar: senderName ? senderName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '',
    authorAvatarUrl: msg.sender?.avatar_url || null,
  }
}

function mapContact(contact) {
  const name = contact.name || `Contato #${contact.id}`
  return {
    id: String(contact.id), chatwootId: contact.id, name,
    phone: contact.phone_number || '', email: contact.email || '',
    avatar: name.slice(0, 2).toUpperCase(), avatarUrl: contact.avatar_url || null,
    location: contact.location || '', lastActivityAt: contact.last_activity_at || null,
    conversationsCount: contact.conversations_count || 0, createdAt: contact.created_at || null,
  }
}

function mapConvSummary(conv) {
  const lastMsg = conv.last_non_activity_message
  const assignee = conv.meta?.assignee || conv.assignee || {}
  return {
    id: String(conv.id), status: conv.status,
    createdAt: conv.created_at ? new Date(conv.created_at * 1000).toISOString() : null,
    lastActivityAt: conv.last_activity_at ? new Date(conv.last_activity_at * 1000).toISOString() : null,
    lastMessage: lastMsg?.content || '',
    assigneeName: assignee.name || '', assigneeAvatar: assignee.name ? assignee.name.slice(0, 2).toUpperCase() : null,
    labels: (conv.labels || []).filter(l => {
      if (l.startsWith('crm_')) return false
      if (LABEL_TO_COLUMN[l.toLowerCase().trim()]) return false
      return true
    }),
    unreadCount: conv.unread_count || 0,
    inboxName: conv.meta?.channel || '',
    asCrmLead: mapConversation(conv),
  }
}

function detectProduct(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('vida')) return 'Seguro de Vida'
  if (t.includes('saúde') || t.includes('saude') || t.includes('plano')) return 'Plano de Saúde'
  if (t.includes('auto') || t.includes('carro') || t.includes('veículo')) return 'Seguro Auto'
  if (t.includes('resid') || t.includes('casa') || t.includes('aparta')) return 'Seguro Residencial'
  if (t.includes('empresa') || t.includes('empresarial')) return 'Seguro Empresarial'
  return 'Seguro'
}

module.exports = {
  resolveColumnFromLabels: resolveColumn,
  getConversations, getConversation,
  getMessages, sendMessage, sendAttachment,
  getAgents, assignAgent, getInboxes,
  getAccountLabels, getConversationLabels, setConversationLabels, setKanbanLabel,
  getContactsList, getContactConversations,
  mapConversation, mapMessage, mapContact, mapConvSummary,
}
