import { BACKEND_URL } from './config'

const API_URL = BACKEND_URL + '/api'

// ── Auth token ─────────────────────────────────────────────────────────────
export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('tcrm_token')
}
export function setAuthToken(token) {
  if (typeof window !== 'undefined') localStorage.setItem('tcrm_token', token)
}
export function clearAuthToken() {
  if (typeof window !== 'undefined') localStorage.removeItem('tcrm_token')
}

async function fetchJSON(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { headers, ...options })

  if (res.status === 401) {
    clearAuthToken()
    if (typeof window !== 'undefined') window.location.reload()
    throw new Error('Sessão expirada')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.data = data
    throw err
  }
  return res.json()
}

function authHeaders() {
  const token = getToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

export const api = {
  getColumns: () => fetchJSON('/kanban/columns'),
  getColumnLeads: (col, page = 1, agentId, role) =>
    fetchJSON(`/kanban/${col}?page=${page}&limit=15${agentId ? `&agentId=${agentId}` : ''}${role ? `&role=${role}` : ''}`),
  moveLead: (id, column, fromColumn) => fetchJSON(`/kanban/${id}/move`, { method: 'PATCH', body: JSON.stringify({ column, fromColumn }) }),
  scheduleLead: (id, scheduledAt, observacao) => fetchJSON(`/kanban/${id}/schedule`, { method: 'PATCH', body: JSON.stringify({ scheduledAt, observacao }) }),

  getMessages: (leadId, before) => fetchJSON(`/messages/${leadId}${before ? `?before=${before}` : ''}`),
  sendMessage: (leadId, content) => fetchJSON(`/messages/${leadId}`, { method: 'POST', body: JSON.stringify({ content }) }),
  sendAttachment: (leadId, formData) => fetch(`${API_URL}/messages/${leadId}/attachment`, { method: 'POST', headers: authHeaders(), body: formData }).then(r => r.json()),

  getAgents: () => fetchJSON('/agents'),
  assignAgent: (conversationId, agentId) => fetchJSON(`/conversations/${conversationId}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),

  getAccountLabels: () => fetchJSON('/account/labels'),
  getConversationLabels: (id) => fetchJSON(`/conversations/${id}/labels`),
  setConversationLabels: (id, labels) => fetchJSON(`/conversations/${id}/labels`, { method: 'POST', body: JSON.stringify({ labels }) }),
  markAsRead: (id) => fetchJSON(`/conversations/${id}/read`, { method: 'POST' }),

  getContacts: (page = 1, search = '') => fetchJSON(`/contacts?page=${page}&search=${encodeURIComponent(search)}`),
  getContactConversations: (contactId) => fetchJSON(`/contacts/${contactId}/conversations`),

  getScheduled: (agentId, role) => fetchJSON(`/agendamentos${agentId ? `?agentId=${agentId}&role=${role}` : ''}`),
  getPayments: (from, to) => fetchJSON(`/pagamentos${from ? `?from=${from}&to=${to}` : ''}`),
  updatePaymentDate: (id, date) => fetchJSON(`/kanban/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentDueDate: date }) }),

  getInbox: (agentId, role) => fetchJSON(`/inbox${agentId ? `?agentId=${agentId}&role=${role}` : ''}`),
  getDashboard: (days = 0) => {
    if (days > 0) {
      const to = new Date().toISOString().split('T')[0]
      const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
      return fetchJSON(`/dashboard?from=${from}&to=${to}`)
    }
    return fetchJSON('/dashboard')
  },
  search: (params) => fetchJSON(`/search?${params}`),

  // Avatar
  uploadAvatar: (agentId, file) => {
    const form = new FormData()
    form.append('avatar', file)
    return fetch(`${API_URL}/agents/${agentId}/avatar`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }).then(r => r.json())
  },
  getAgentAvatar: (agentId) => fetchJSON(`/agents/${agentId}/avatar`),

  // Notas
  getNotes: (id) => fetchJSON(`/conversations/${id}/notes`),
  addNote: (id, content) => fetchJSON(`/conversations/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (id, noteId) => fetchJSON(`/conversations/${id}/notes/${noteId}`, { method: 'DELETE' }),

  // Templates
  getTemplates: () => fetchJSON('/templates'),
  createTemplate: (title, content) => fetchJSON('/templates', { method: 'POST', body: JSON.stringify({ title, content }) }),
  deleteTemplate: (id) => fetchJSON(`/templates/${id}`, { method: 'DELETE' }),

  // Typing
  sendTyping: (id, isTyping) => fetchJSON(`/conversations/${id}/typing`, { method: 'POST', body: JSON.stringify({ isTyping }) }),

  // Push
  getPushKey: () => fetchJSON('/push/vapid-key'),
  subscribePush: (subscription, agentId) => fetchJSON('/push/subscribe', {
    method: 'POST', body: JSON.stringify({ subscription, agentId })
  }),
  unsubscribePush: (agentId) => fetchJSON('/push/unsubscribe', {
    method: 'DELETE', body: JSON.stringify({ agentId })
  }),

  login: (agentId, password) => fetchJSON('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ agentId, password })
  }),
  getUsers: () => fetchJSON('/users'),
}
