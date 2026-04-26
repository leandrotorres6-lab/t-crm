'use client'
import { useEffect, useRef } from 'react'
import { BACKEND_URL } from './config'
import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  if (typeof window === 'undefined') return null
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,       // reconecta mais rápido após queda
      reconnectionDelayMax: 3000,   // máximo 3s entre tentativas
      reconnectionAttempts: Infinity,
      timeout: 10000,
      pingInterval: 8000,           // ping a cada 8s — Railway fecha após 30s de inatividade
      pingTimeout: 10000,
    })
    // Timestamp do último evento recebido — usado no replay ao reconectar
    socket._lastEventAt = Date.now()

    socket.on('connect', () => {
      console.log('[Socket] ✅ Conectado:', socket.id)
      socket.emit('sync_request')
    })
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] ❌ Desconectado:', reason, '— lastEvent:', new Date(socket._lastEventAt).toISOString().slice(11,19))
      if (reason === 'transport close' || reason === 'transport error') {
        socket.connect()
      }
    })
    socket.on('connect_error', (e) => console.warn('[Socket] Erro:', e.message))
    socket.on('reconnect', (n) => {
      console.log(`[Socket] Reconectado após ${n} tentativa(s)`)
      socket.emit('sync_request', { since: socket._lastEventAt })
    })

    // Mobile: reconecta quando usuário volta ao app após ficar em background
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (!socket.connected) {
            console.log('[Socket] App voltou ao foco — reconectando...')
            socket.connect()
          } else {
            // Mesmo conectado, pede sync para cobrir mensagens perdidas em background
            socket.emit('sync_request', { since: socket._lastEventAt })
          }
        }
      })
    }

    // Atualiza lastEventAt em qualquer evento relevante
    const trackEvent = () => { socket._lastEventAt = Date.now() }
    socket.on('new_message',          trackEvent)
    socket.on('new_conversation',     trackEvent)
    socket.on('lead_moved',           trackEvent)
    socket.on('unread_update',        trackEvent)
    socket.on('conversation_resolved', trackEvent)

    // Replay: leads que mudaram durante desconexão
    socket.on('sync_data', (items) => {
      if (!items?.length) return
      console.log('[Sync] Replay de', items.length, 'lead(s) perdido(s) durante desconexão')
      if (typeof window === 'undefined') return
      items.forEach(item => {
        window.dispatchEvent(new CustomEvent('tcrm:lead-updated', { detail: item }))
      })
      // Atualiza lastEventAt com o mais recente do replay
      socket._lastEventAt = Date.now()
    })
  }
  return socket
}

export function useSocket(event, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const s = getSocket()
    if (!s) return
    const fn = (data) => handlerRef.current(data)
    s.on(event, fn)
    return () => s.off(event, fn)
  }, [event])
}
