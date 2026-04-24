'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook de busca unificado — funciona de forma idêntica no desktop e mobile.
 *
 * Problemas que resolve:
 * - iOS Safari: onChange pode não disparar durante composição (autocorrect/sugestões)
 * - Android: debounce inadequado causa múltiplas chamadas durante digitação rápida
 * - Ambos: autoCorrect/autoCapitalize interferindo no valor digitado
 *
 * @param {Function} onSearch — chamada com o valor após o debounce
 * @param {number}   delay    — debounce em ms (padrão: 380ms)
 */
export function useMobileSearch(onSearch, delay = 380) {
  const [value, setValue] = useState('')
  const debounceRef = useRef(null)
  const latestValue  = useRef('')
  const inputRef     = useRef(null)

  const triggerSearch = useCallback((v) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onSearch(v), delay)
  }, [onSearch, delay])

  const handleChange = useCallback((e) => {
    const v = e.currentTarget?.value ?? e.target?.value ?? ''
    latestValue.current = v
    setValue(v)
    triggerSearch(v)
  }, [triggerSearch])

  // onInput: fallback para iOS Safari que não dispara onChange durante composição
  const handleInput = useCallback((e) => {
    const v = e.currentTarget?.value ?? e.target?.value ?? ''
    if (v !== latestValue.current) {
      latestValue.current = v
      setValue(v)
      triggerSearch(v)
    }
  }, [triggerSearch])

  const clear = useCallback(() => {
    clearTimeout(debounceRef.current)
    setValue('')
    latestValue.current = ''
    onSearch('')
  }, [onSearch])

  // Foca o input com delay para aguardar animação (especialmente no iOS)
  const focusInput = useCallback((delayMs = 80) => {
    setTimeout(() => inputRef.current?.focus(), delayMs)
  }, [])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  // Props prontas para espalhar no <input>
  const inputProps = {
    ref:             inputRef,
    value,
    onChange:        handleChange,
    onInput:         handleInput,
    autoComplete:    'off',
    autoCorrect:     'off',
    autoCapitalize:  'off',
    spellCheck:      false,
    inputMode:       'search',
    enterKeyHint:    'search',
    style:           { WebkitAppearance: 'none' },
  }

  return { value, inputProps, clear, focusInput, inputRef }
}
