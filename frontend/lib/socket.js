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
    socket.on('connect', () => {
      console.log('[Socket] ✅ Conectado:', socket.id)
      // Solicita snapshot de unread + mensagens perdidas durante desconexão
      socket.emit('sync_request')
    })
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] ❌ Desconectado:', reason)
      // 'transport close' = Railway fechou a conexão — reconecta imediatamente
      if (reason === 'transport close' || reason === 'transport error') {
        socket.connect()
      }
    })
    socket.on('connect_error', (e) => console.warn('[Socket] Erro:', e.message))
    socket.on('reconnect', (n) => {
      console.log(`[Socket] Reconectado após ${n} tentativa(s)`)
      socket.emit('sync_request')  // re-sincroniza unread após reconexão
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
