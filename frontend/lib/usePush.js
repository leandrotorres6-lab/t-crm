'use client'
import { useEffect, useState } from 'react'
import { api } from './api'

export function usePush(agentId) {
  const [supported,   setSupported]   = useState(false)
  const [permission,  setPermission]  = useState('default')
  const [subscribed,  setSubscribed]  = useState(false)
  const [loading,     setLoading]     = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok = 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (ok) setPermission(Notification.permission)
  }, [])

  const subscribe = async () => {
    if (!supported || loading) return
    setLoading(true)
    try {
      // Registra e aguarda SW ativo
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      await navigator.serviceWorker.ready

      // Força atualização do SW se houver versão nova
      reg.update().catch(() => {})

      const { publicKey } = await api.getPushKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:    true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      // Envia subscription + endpoint para o backend (identifica dispositivo)
      await api.subscribePush(sub.toJSON(), agentId)
      setSubscribed(true)
      setPermission('granted')
    } catch (err) {
      console.error('[Push] Subscribe error:', err)
      if (err.name === 'NotAllowedError') setPermission('denied')
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      let endpoint = null
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) { endpoint = sub.endpoint; await sub.unsubscribe() }
      }
      // Passa endpoint para o backend identificar e remover o dispositivo certo
      await api.unsubscribePush(agentId, endpoint)
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }

  // Verifica assinatura existente ao inicializar
  useEffect(() => {
    if (!supported || !agentId) return
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          setSubscribed(true)
          // Só re-envia se o endpoint mudou desde o último registro
          const lastEndpoint = sessionStorage.getItem(`tcrm_push_ep_${agentId}`)
          if (lastEndpoint !== sub.endpoint) {
            api.subscribePush(sub.toJSON(), agentId)
              .then(() => sessionStorage.setItem(`tcrm_push_ep_${agentId}`, sub.endpoint))
              .catch(() => {})
          }
        }
      })
    }).catch(() => {})
  }, [supported, agentId])

  return { supported, permission, subscribed, loading, subscribe, unsubscribe }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}
