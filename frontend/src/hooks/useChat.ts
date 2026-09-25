import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantInfo, ChatMessage, Conversation } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const request = (path: string, init?: RequestInit) => fetch(`${API_URL}${path}`, {
  ...init,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json', ...init?.headers },
})

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeMessage(item: any): ChatMessage {
  return {
    id: item.id,
    role: item.role,
    text: item.text,
    createdAt: item.created_at,
    info: item.info ? {
      latency: item.info.latency,
      model: item.info.model,
      embeddingModel: item.info.embedding_model,
      sources: item.info.sources || [],
    } : undefined,
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isThinking, setIsThinking] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  const refreshConversations = useCallback(async () => {
    const res = await request('/api/conversations')
    if (!res.ok) throw new Error('Could not load conversations')
    const items: Conversation[] = await res.json()
    setConversations(items)
    return items
  }, [])

  const selectConversation = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const res = await request(`/api/conversations/${id}/messages`)
      if (!res.ok) throw new Error('Could not load messages')
      setMessages((await res.json()).map(normalizeMessage))
      setActiveConversationId(id)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshConversations()
      .then(items => items[0] ? selectConversation(items[0].id) : setIsLoading(false))
      .catch(() => setIsLoading(false))
  }, [refreshConversations, selectConversation])

  useEffect(scrollToBottom, [messages, scrollToBottom])

  const newConversation = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isThinking) return
    const optimisticId = makeId()
    setMessages(prev => [...prev, { id: optimisticId, role: 'user', text: trimmed }])
    setIsThinking(true)
    try {
      const res = await request('/api/ask', {
        method: 'POST',
        body: JSON.stringify({ question: trimmed, conversation_id: activeConversationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Request failed')
      const info: AssistantInfo = {
        latency: data.latency, model: data.model,
        embeddingModel: data.embedding_model, sources: data.sources || [],
      }
      setMessages(prev => [
        ...prev.map(message => message.id === optimisticId
          ? { ...message, id: data.user_message_id } : message),
        { id: data.assistant_message_id, role: 'assistant', text: data.answer, info },
      ])
      setActiveConversationId(data.conversation_id)
      await refreshConversations()
    } catch (error) {
      console.error('API error:', error)
      setMessages(prev => [...prev, {
        id: makeId(), role: 'assistant', error: true,
        text: 'Could not generate a response. Please try again.',
      }])
    } finally {
      setIsThinking(false)
    }
  }, [activeConversationId, isThinking, refreshConversations])

  return {
    messages, conversations, activeConversationId, isThinking, isLoading,
    sendMessage, selectConversation, newConversation, scrollRef,
  }
}
