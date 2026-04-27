// Service Worker T-CRM — v6
// badge numérico + notificação confiável + visibilitychange

const CACHE_NAME = 't-crm-sw-v7'
let _badgeCount = 0  // contador local de não lidas

// ── Push recebido (app fechado ou background) ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload = {}
  try { payload = event.data.json() }
  catch { payload = { title: 'T-CRM', body: event.data.text() } }

  const {
    title = 'T-CRM',
    body  = 'Nova mensagem',
    data  = {},
    tag,
    renotify,
    badgeCount,
  } = payload

  // Incrementa contador de badge
  if (badgeCount !== undefined) {
    _badgeCount = badgeCount
  } else {
    _badgeCount = Math.max(1, _badgeCount + 1)
  }

  // Atualiza badge com número real
  try { navigator.setAppBadge(_badgeCount) } catch {}

  const options = {
    body:               body || 'Nova mensagem recebida',
    icon:               '/icon-192.png',
    badge:              '/icon-192.png',
    image:              data.imageUrl || undefined,   // preview de imagem se for anexo
    data:               { ...data, url: data.url || '/conversas' },
    vibrate:            [200, 100, 200],
    requireInteraction: true,   // mantém visível na tela de bloqueio até o usuário interagir
    tag:                tag || `conv-${data.conversationId || 'default'}`,
    renotify:           renotify !== false,
    silent:             false,
    // Não usa actions — alguns Android escondem o body quando tem actions na lock screen
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Clique na notificação ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const { conversationId, url } = event.notification.data || {}
  const target = url || '/conversas'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Zera badge ao abrir
      _badgeCount = 0
      try { navigator.clearAppBadge() } catch {}

      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.postMessage({ type: 'open-conversation', conversationId, url: target })
          return
        }
      }
      return clients.openWindow(
        conversationId
          ? `${self.location.origin}${target}?conv=${conversationId}`
          : `${self.location.origin}${target}`
      )
    })
  )
})

// ── Mensagem do app → SW ──────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const { type, count } = event.data || {}

  if (type === 'SET_BADGE') {
    _badgeCount = count || 0
    try {
      if (_badgeCount > 0) navigator.setAppBadge(_badgeCount)
      else navigator.clearAppBadge()
    } catch {}
  }

  if (type === 'CLEAR_BADGE') {
    _badgeCount = 0
    try { navigator.clearAppBadge() } catch {}
  }

  if (type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Instalação e ativação ─────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
    ])
  )
})
