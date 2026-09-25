import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantInfo, ChatMessage } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom)
    })

    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [scrollToBottom])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isThinking) return

    const userMessage: ChatMessage = { id: makeId(), role: 'user', text: trimmed }
    setMessages(prev => [...prev, userMessage])
    setIsThinking(true)

    try {
      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })

      const data = await res.json()
      const answer: string = typeof data.answer === 'string' ? data.answer : ''

      const info: AssistantInfo = {
        latency: typeof data.latency === 'number' ? data.latency : undefined,
        model: typeof data.model === 'string' ? data.model : undefined,
        embeddingModel:
          typeof data.embedding_model === 'string' ? data.embedding_model : undefined,
        sources: Array.isArray(data.sources) ? data.sources : [],
      }

      const isError = res.ok ? answer.trim().startsWith('Error:') : true

      setMessages(prev => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: isError
            ? 'Something went wrong while generating a response. Please try again.'
            : answer,
          error: isError,
          info,
        },
      ])
    } catch (err) {
      console.error('API error:', err)
      setMessages(prev => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: 'Could not reach the knowledge backend. Please try again.',
          error: true,
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }, [isThinking])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, isThinking, sendMessage, scrollRef, clear }
}
