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
    if (el) el.scrollTop = el.scrollHeight
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
    const assistantId = makeId()
    setMessages(prev => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', text: '', pending: true },
    ])
    setIsThinking(true)

    try {
      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      })

      if (!res.ok || !res.body) throw new Error(`Streaming request failed: ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let info: AssistantInfo = {}

      const handleEvent = (line: string) => {
        if (!line.trim()) return
        const event = JSON.parse(line)

        if (event.type === 'metadata') {
          info = {
            latency: typeof event.latency === 'number' ? event.latency : undefined,
            model: typeof event.model === 'string' ? event.model : undefined,
            embeddingModel:
              typeof event.embedding_model === 'string' ? event.embedding_model : undefined,
            sources: Array.isArray(event.sources) ? event.sources : [],
          }
          return
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Streaming failed')
        }

        setMessages(prev => prev.map(message => {
          if (message.id !== assistantId) return message
          return {
            ...message,
            pending: false,
            text: event.type === 'delta'
              ? message.text + (typeof event.text === 'string' ? event.text : '')
              : message.text,
            info,
          }
        }))
      }

      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(handleEvent)
        if (done) break
      }

      if (buffer.trim()) handleEvent(buffer)
    } catch (err) {
      console.error('API error:', err)
      setMessages(prev => prev.map(message => (
        message.id === assistantId
          ? {
              ...message,
              pending: false,
              text: 'Could not generate a response. Please try again.',
              error: true,
            }
          : message
      )))
    } finally {
      setIsThinking(false)
    }
  }, [isThinking])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, isThinking, sendMessage, scrollRef, clear }
}
