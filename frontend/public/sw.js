// Service Worker — T-CRM Push Notifications
// Versão: 2.0 — badge + agrupamento + background sync

const CACHE_NAME = 't-crm-sw-v4'

// ── Push recebido (app fechado ou em background) ──────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return

  let payload = {}
  try { payload = event.data.json() }
  catch { payload = { title: 'T-CRM', body: event.data.text() } }

  const { title = 'T-CRM', body = 'Nova mensagem', data = {}, tag, renotify } = payload

  // Atualiza badge do ícone do app (Android + iOS 16.4+ PWA)
  if (self.navigator?.setAppBadge) {
    self.navigator.setAppBadge().catch(() => {})
  }

  const options = {
    body,
    icon:             '/icon-192.png',
    badge:            '/icon-192.png',
    data:             { ...data, url: data.url || '/conversas' },
    vibrate:          [200, 100, 200, 100, 200],
    requireInteraction: true,
    tag:              tag || `conv-${data.conversationId || 'default'}`,
    renotify:         renotify !== false,  // toca som mesmo se já existe notificação com mesma tag
    actions: [
      { action: 'open',    title: '💬 Abrir' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
    // Silent: false garante som no Android
    silent: false,
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Clique na notificação ────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const { conversationId, url } = event.notification.data || {}
  const target = url || '/conversas'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Limpa badge ao abrir
      if (self.navigator?.clearAppBadge) {
        self.navigator.clearAppBadge().catch(() => {})
      }

      // Foca aba existente do T-CRM
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          if (conversationId) {
            client.postMessage({ type: 'open-conversation', conversationId, url: target })
          }
          return
        }
      }
      // Abre nova aba
      return clients.openWindow(
        conversationId
          ? `${self.location.origin}${target}?conv=${conversationId}`
          : `${self.location.origin}${target}`
      )
    })
  )
})

// ── Mensagem do app → SW (badge manual) ──────────────────────────────────────
self.addEventListener('message', event => {
  const { type, count } = event.data || {}

  if (type === 'SET_BADGE') {
    if (count > 0) {
      self.navigator?.setAppBadge?.(count).catch(() => {})
    } else {
      self.navigator?.clearAppBadge?.().catch(() => {})
    }
  }

  if (type === 'CLEAR_BADGE') {
    self.navigator?.clearAppBadge?.().catch(() => {})
  }

  if (type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Instalação e ativação ────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove caches antigos
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
    ])
  )
})
