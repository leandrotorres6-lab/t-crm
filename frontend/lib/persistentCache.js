// Cache persistente — salva no localStorage e restaura instantaneamente ao abrir
// Combina com cache em memória para máxima velocidade

const MEMORY = {}  // cache em memória (mais rápido)

export const persistentCache = {
  get(key) {
    // 1. Tenta memória primeiro (instantâneo)
    if (MEMORY[key]) return MEMORY[key]
    // 2. Tenta localStorage (persiste entre sessões)
    try {
      const raw = localStorage.getItem(`tcrm_cache_${key}`)
      if (raw) {
        const entry = JSON.parse(raw)
        MEMORY[key] = entry  // promove para memória
        return entry
      }
    } catch {}
    return null
  },

  set(key, data) {
    const entry = { data, ts: Date.now() }
    MEMORY[key] = entry
    try {
      localStorage.setItem(`tcrm_cache_${key}`, JSON.stringify(entry))
    } catch {}
  },

  isStale(key, ttlMs = 60000) {
    const entry = this.get(key)
    if (!entry) return true
    return Date.now() - entry.ts > ttlMs
  },

  invalidate(key) {
    delete MEMORY[key]
    try { localStorage.removeItem(`tcrm_cache_${key}`) } catch {}
  },

  invalidateAll() {
    Object.keys(MEMORY).forEach(k => delete MEMORY[k])
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('tcrm_cache_'))
        .forEach(k => localStorage.removeItem(k))
    } catch {}
  }
}
