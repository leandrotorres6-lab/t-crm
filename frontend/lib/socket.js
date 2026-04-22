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
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      // Mobile: aumenta ping interval para reduzir tráfego de fundo
      pingInterval: 25000,
      pingTimeout: 20000,
    })
    socket.on('connect', () => console.log('[Socket] ✅ Conectado ao backend'))
    socket.on('disconnect', (reason) => console.warn('[Socket] ❌ Desconectado:', reason))
    socket.on('connect_error', (e) => console.warn('[Socket] Erro de conexão:', e.message))
    socket.on('reconnect', (n) => console.log(`[Socket] Reconectado após ${n} tentativas`))
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
