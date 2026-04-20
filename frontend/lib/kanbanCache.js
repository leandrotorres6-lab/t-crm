// Cache de dados do kanban no lado do cliente
// Persiste enquanto a aba do navegador estiver aberta (module-level = singleton)
// Evita refetch desnecessário ao navegar entre menus

const _cache = {
  columns: {},   // { 'leads_1': { data, ts } }
  TTL: 90 * 1000, // 90 segundos
}

export const kanbanCache = {
  key(columnId, page) { return `${columnId}_${page}` },

  get(columnId, page = 1) {
    const k = this.key(columnId, page)
    const entry = _cache.columns[k]
    if (!entry) return null
    if (Date.now() - entry.ts > _cache.TTL) {
      delete _cache.columns[k]
      return null
    }
    return entry.data
  },

  set(columnId, page, data) {
    const k = this.key(columnId, page)
    _cache.columns[k] = { data, ts: Date.now() }
  },

  // Invalida apenas uma coluna (ao mover lead de/para ela)
  invalidate(columnId) {
    Object.keys(_cache.columns).forEach(k => {
      if (k.startsWith(columnId + '_')) delete _cache.columns[k]
    })
  },

  // Invalida tudo (refresh manual)
  invalidateAll() {
    _cache.columns = {}
  },
}
