import { API_URL } from './config'

async function fetchJSON(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.data = data
    throw err
  }
  return res.json()
}

export const api = {
  getColumns: () => fetchJSON('/kanban/columns'),
  getColumnLeads: (col, page = 1, agentId, role) =>
    fetchJSON(`/kanban/${col}?page=${page}&limit=15${agentId ? `&agentId=${agentId}` : ''}${role ? `&role=${role}` : ''}`),
  moveLead: (id, column, fromColumn) => fetchJSON(`/kanban/${id}/move`, { method: 'PATCH', body: JSON.stringify({ column, fromColumn }) }),
  scheduleLead: (id, scheduledAt, observacao) => fetchJSON(`/kanban/${id}/schedule`, { method: 'PATCH', body: JSON.stringify({ scheduledAt, observacao }) }),

  getMessages: (leadId, before) => fetchJSON(`/messages/${leadId}${before ? `?before=${before}` : ''}`),
  sendMessage: (leadId, content) => fetchJSON(`/messages/${leadId}`, { method: 'POST', body: JSON.stringify({ content }) }),
  sendAttachment: (leadId, formData) => fetch(`${API_URL}/messages/${leadId}/attachment`, { method: 'POST', body: formData }).then(r => r.json()),

  getAgents: () => fetchJSON('/agents'),
  assignAgent: (conversationId, agentId) => fetchJSON(`/conversations/${conversationId}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),

  getAccountLabels: () => fetchJSON('/account/labels'),
  getConversationLabels: (id) => fetchJSON(`/conversations/${id}/labels`),
  setConversationLabels: (id, labels) => fetchJSON(`/conversations/${id}/labels`, { method: 'POST', body: JSON.stringify({ labels }) }),

  getContacts: (q = '', page = 1) => fetchJSON(`/contacts?q=${encodeURIComponent(q)}&page=${page}`),
  getContactConversations: (contactId) => fetchJSON(`/contacts/${contactId}/conversations`),

  getAgendamentos: () => fetchJSON('/agendamentos'),
  setPaymentDue: (id, paymentDueDate, observacao) => fetchJSON(`/kanban/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ paymentDueDate, observacao }) }),
  getPagamentos: () => fetchJSON('/pagamentos'),

  getDashboard: () => fetchJSON('/dashboard'),
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
  markRead: (id) => fetchJSON(`/conversations/${id}/read`, { method: 'POST' }),
}
