// Cache de dados do kanban — persiste entre sessões via localStorage
import { persistentCache } from './persistentCache'

const TTL = 120 * 1000 // 2 minutos

export const kanbanCache = {
  key(columnId, page) { return `kanban_${columnId}_${page}` },

  get(columnId, page = 1) {
    const k = this.key(columnId, page)
    const entry = persistentCache.get(k)
    if (!entry) return null
    if (Date.now() - entry.ts > TTL) {
      persistentCache.invalidate(k)
      return null
    }
    return entry.data
  },

  set(columnId, page, data) {
    const k = this.key(columnId, page)
    persistentCache.set(k, data)
  },

  invalidate(columnId) {
    // Invalida páginas 1-3 da coluna
    for (let p = 1; p <= 3; p++) persistentCache.invalidate(this.key(columnId, p))
  },

  invalidateAll() {
    persistentCache.invalidateAll()
  },
}
