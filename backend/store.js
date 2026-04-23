// Store local simples que persiste as atribuições de colunas do kanban
// Isso não polui o Chatwoot e sobrevive a reinicializações do servidor

const fs = require('fs')
const path = require('path')

const STORE_FILE = path.join(__dirname, 'store.json')

let state = {
  columns: {},
  meta: {},
  cache: {},
  cacheAt: 0,
  unread: {},   // conversationId → count de msgs não lidas
}

// Carrega do arquivo
function load() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'))
      state.columns = saved.columns || {}
      state.meta = saved.meta || {}
      console.log(`📂 Store carregado: ${Object.keys(state.columns).length} leads`)
    }
  } catch (e) {
    console.error('Erro ao carregar store:', e.message)
  }
}

// Salva no arquivo (debounced)
let saveTimeout = null
function save() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify({
        columns: state.columns,
        meta: state.meta,
      }, null, 2))
    } catch (e) {
      console.error('Erro ao salvar store:', e.message)
    }
  }, 500)
}

const store = {
  // Retorna coluna se foi explicitamente definida, undefined se nunca foi movido
  getColumn(conversationId) {
    return state.columns[String(conversationId)]  // undefined = nunca foi movido
  },

  // Define coluna do lead
  setColumn(conversationId, column) {
    state.columns[String(conversationId)] = column
    save()
  },

  // Salva metadados extras (produto, notas)
  setMeta(conversationId, data) {
    state.meta[String(conversationId)] = {
      ...(state.meta[String(conversationId)] || {}),
      ...data,
    }
    save()
  },

  getMeta(conversationId) {
    return state.meta[String(conversationId)] || {}
  },

  // Retorna todos os IDs de uma coluna
  getByColumn(column) {
    return Object.entries(state.columns)
      .filter(([, col]) => col === column)
      .map(([id]) => id)
  },

  // Cache de conversas (evita hammering na API do Chatwoot)
  getCache() {
    if (Date.now() - state.cacheAt > 180000) return null // 3min TTL
    return state.cache
  },

  setCache(data) {
    state.cache = data
    state.cacheAt = Date.now()
  },

  invalidateCache() {
    state.cacheAt = 0
  },

  // Atualiza lastMessageAt no cache (para ordenação correta)
  updateLastMessageAt(conversationId, content, timestamp) {
    const id = String(conversationId)
    const ts = timestamp || new Date().toISOString()
    if (state.cache[id]) {
      if (content) state.cache[id].lastMessage = content
      state.cache[id].lastMessageAt = ts
    }
    // _colIdx será null → próxima query reconstrói índice já ordenado
  },

  // Atualiza última mensagem no cache
  updateLastMessage(conversationId, content) {
    const id = String(conversationId)
    if (state.cache[id]) {
      state.cache[id].lastMessage = content
    }
  },

  // Unread count
  incrementUnread(conversationId) {
    const id = String(conversationId)
    state.unread[id] = (state.unread[id] || 0) + 1
    // Atualiza no cache também
    if (state.cache[id]) state.cache[id].unreadCount = state.unread[id]
    return state.unread[id]
  },

  getUnread(conversationId) {
    return state.unread[String(conversationId)] || 0
  },

  resetUnread(conversationId) {
    const id = String(conversationId)
    state.unread[id] = 0
    if (state.cache[id]) state.cache[id].unreadCount = 0
  },
}

load()

// Restaura colunas do Supabase se store.json estiver vazio (ex: após redeploy Railway)
store.restoreFromSupabase = async (supabaseGetAll) => {
  if (Object.keys(state.columns).length > 0) return  // já tem dados locais
  try {
    const leads = await supabaseGetAll()
    if (!leads?.length) return
    let restored = 0
    leads.forEach(l => {
      if (l.id && l.column) {
        state.columns[String(l.id)] = l.column
        if (l.scheduledAt || l.paymentDueDate || l.observacao) {
          state.meta[String(l.id)] = {
            scheduledAt: l.scheduledAt || null,
            paymentDueDate: l.paymentDueDate || null,
            observacao: l.observacao || '',
          }
        }
        restored++
      }
    })
    console.log(`📂 Store restaurado do Supabase: ${restored} leads`)
  } catch (e) {
    console.warn('[Store] Falha ao restaurar do Supabase:', e.message)
  }
}

// Expõe state interno para o server.js verificar quais IDs têm unread registrado
store._state = () => state

module.exports = store
