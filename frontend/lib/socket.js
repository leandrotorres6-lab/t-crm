'use client'
import { useEffect, useRef } from 'react'
import { BACKEND_URL } from './config'
import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    })
    socket.on('connect', () => console.log('[Socket] Conectado'))
    socket.on('disconnect', () => console.log('[Socket] Desconectado'))
    socket.on('connect_error', (e) => console.warn('[Socket] Erro:', e.message))
  }
  return socket
}

export function useSocket(event, handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    const s = getSocket()
    const fn = (data) => handlerRef.current(data)
    s.on(event, fn)
    return () => s.off(event, fn)
  }, [event])
}
