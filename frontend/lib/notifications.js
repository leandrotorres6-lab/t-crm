'use client'

// ─── Utilitário central de notificações do T-CRM ─────────────────────────────
// Usado por AppContext, NotificationAlarm e páginas de pagamento/agendamento

/**
 * Solicita permissão de notificação ao usuário.
 * Retorna true se concedida, false caso contrário.
 */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

/**
 * Exibe uma notificação do sistema operacional.
 * Funciona em foreground e background (via SW se disponível).
 */
export function showNotification(title, body, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const opts = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: false,
    silent: false,
    ...options,
  }

  try {
    // Prefere usar Service Worker (funciona em background e mobile PWA)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, opts).catch(() => {
          // Fallback para Notification API direta
          new Notification(title, opts)
        })
      }).catch(() => {
        new Notification(title, opts)
      })
    } else {
      new Notification(title, opts)
    }
  } catch (e) {
    console.warn('[Notif]', e.message)
  }
}

/**
 * Toca um beep via Web Audio API (sem arquivo externo).
 * type: 'message' | 'lead' | 'alarm'
 */
export function playSound(type = 'message') {
  try {
    if (typeof window === 'undefined') return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'alarm') {
      // Três beeps crescentes para alarme de agendamento/pagamento
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.30)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.55)
    } else if (type === 'lead') {
      // Dois beeps para novo lead
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.40)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.40)
    } else {
      // Um beep para mensagem
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.10)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.30)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.30)
    }
  } catch {}
}
