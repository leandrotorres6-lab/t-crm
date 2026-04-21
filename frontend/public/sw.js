// Service Worker — T-CRM Push Notifications
self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: data.data || {},
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'Abrir conversa' },
        { action: 'dismiss', title: 'Dispensar' }
      ]
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const data = event.notification.data || {}
  const conversationId = data.conversationId
  // URL de deep link para a conversa
  const url = `${self.location.origin}/conversas`

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Se já tem uma aba aberta, foca e navega
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.postMessage({ type: 'open-conversation', conversationId, url })
          return
        }
      }
      // Senão abre nova aba
      return clients.openWindow(url)
    })
  )
})

// Ativa imediatamente sem esperar refresh
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()))
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
