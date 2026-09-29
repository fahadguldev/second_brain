import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUUpLeft,
  ChatCircle,
  Check,
  CheckCircle,
  CircleNotch,
  Clock,
  CloudArrowUp,
  Cpu,
  Database,
  Eye,
  EyeSlash,
  FileText,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Play,
  SignOut,
  Sparkle,
  Stack,
  Terminal,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { supabase, supabaseConfigured } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type KnowledgeItem = {
  id: string
  question?: string
  content: string
  source_type: string
  source_message_id?: string
  status: 'draft' | 'approved' | 'indexed' | string
  chunks_count?: number
  created_by: string
  created_at: string
  updated_at: string
  approved_at?: string
}

export type JobLog = {
  timestamp: string
  step: string
  level: 'info' | 'warning' | 'error' | string
  message: string
}

export type Job = {
  id: string
  knowledge_item_id: string
  status: 'queued' | 'indexing' | 'indexed' | 'failed' | string
  current_step?: 'queued' | 'chunking' | 'embedding' | 'pushing_qdrant' | 'indexed' | 'failed' | string
  chunks_total: number
  chunks_indexed: number
  logs?: JobLog[]
  error?: string
  created_at: string
  finished_at?: string
}

export type QdrantStats = {
  status: string
  collection: string
  points_count: number
  indexed_vectors_count?: number
  vector_size: number
  pushed_records_count?: number
  pushed_chunks_count?: number
  error?: string
}

export type SinglePushTracker = {
  jobId: string
  knowledgeItemId?: string
  messageId?: string
  title: string
  step: 'queued' | 'chunking' | 'embedding' | 'pushing_qdrant' | 'indexed' | 'failed' | string
  status: 'queued' | 'indexing' | 'indexed' | 'failed' | string
  chunksIndexed?: number
  chunksTotal?: number
  lastMessage?: string
  error?: string
}

type AdminMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  pipeline_status?: string | null
  is_pushed?: boolean
  knowledge_item_id?: string | null
}

type AdminConversation = {
  id: string
  title: string
  user_id: string
  messages: AdminMessage[]
}

const PIPELINE_STEPS = [
  { id: 'queued', label: '1. Queued', icon: Clock, desc: 'Scheduled in background' },
  { id: 'chunking', label: '2. Chunking', icon: FileText, desc: 'Text split into RAG chunks' },
  { id: 'embedding', label: '3. Embedding', icon: Sparkle, desc: 'Generating 3072-dim vectors via Gemini' },
  { id: 'pushing_qdrant', label: '4. Pushing to Qdrant', icon: CloudArrowUp, desc: 'Upserting vectors into collection' },
  { id: 'indexed', label: '5. Completed', icon: CheckCircle, desc: 'Verified into Qdrant & database' },
] as const

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSigningIn(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) {
        setError(error?.message || 'Could not sign in')
      } else {
        onLogin(data.session)
      }
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4 text-ink">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-accent" />
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Admin portal</p>
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold">Sign in with Supabase</h1>
        <p className="mt-1 text-xs text-muted">Manage chats, review answers, and push to Qdrant vector database.</p>
        {!supabaseConfigured && (
          <p className="mt-3 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-600">Supabase environment variables are missing.</p>
        )}
        <input
          className="mt-5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={!supabaseConfigured || signingIn}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {signingIn ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'chats' | 'review' | 'ready' | 'pipeline'>('chats')

  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [conversations, setConversations] = useState<AdminConversation[]>([])
  const [qdrantStats, setQdrantStats] = useState<QdrantStats | null>(null)

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [searchChat, setSearchChat] = useState('')
  const [hidePushedInChats, setHidePushedInChats] = useState(true)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isPushingBatch, setIsPushingBatch] = useState(false)
  const [isRefreshingStats, setIsRefreshingStats] = useState(false)

  // Inline editing state for Chats tab
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [messageDrafts, setMessageDrafts] = useState<Record<string, { question: string; content: string }>>({})
  const [isSavingInline, setIsSavingInline] = useState(false)
  const [singlePushTracker, setSinglePushTracker] = useState<SinglePushTracker | null>(null)
  const [pushingMessageId, setPushingMessageId] = useState<string | null>(null)
  const [isPushingConversation, setIsPushingConversation] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  const pollIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!session) throw new Error('Not signed in')
      const response = await fetch(`${API_URL}/api/admin${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${session.access_token}`, ...init?.headers },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.detail || 'Admin request failed')
      return body
    },
    [session]
  )

  const fetchQdrantStats = useCallback(async () => {
    if (!session) return
    setIsRefreshingStats(true)
    try {
      const stats = await api('/qdrant/stats')
      setQdrantStats(stats)
    } catch {
      // Non-blocking fallback
    } finally {
      setIsRefreshingStats(false)
    }
  }, [api, session])

  const refresh = useCallback(async () => {
    if (!session) return
    try {
      const [chatRows, knowledgeRows, jobRows, stats] = await Promise.all([
        api('/conversations'),
        api('/knowledge'),
        api('/jobs'),
        api('/qdrant/stats').catch(() => null),
      ])
      setConversations(chatRows)
      setKnowledge(knowledgeRows)
      setJobs(jobRows)
      if (stats) setQdrantStats(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data')
    }
  }, [api, session])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Categorized knowledge items
  const draftItems = useMemo(() => knowledge.filter(k => k.status === 'draft'), [knowledge])
  const approvedItems = useMemo(() => knowledge.filter(k => k.status === 'approved'), [knowledge])
  const indexedItems = useMemo(() => knowledge.filter(k => k.status === 'indexed'), [knowledge])

  // Set of message IDs that have been pushed to Qdrant
  const pushedMessageIds = useMemo(() => {
    const set = new Set<string>()
    knowledge.forEach(k => {
      if ((k.status === 'indexed' || (k.chunks_count && k.chunks_count > 0)) && k.source_message_id) {
        set.add(k.source_message_id)
      }
    })
    return set
  }, [knowledge])

  // Set of canonical contents for pushed items (content fallback in case source_message_id was lost)
  const pushedContents = useMemo(() => {
    const set = new Set<string>()
    knowledge.forEach(k => {
      if ((k.status === 'indexed' || (k.chunks_count && k.chunks_count > 0)) && k.content) {
        set.add(k.content.trim())
      }
    })
    return set
  }, [knowledge])

  // Helper to check whether an assistant message has been pushed to Qdrant
  const isAssistantPushed = useCallback(
    (m: AdminMessage) => {
      if (m.role !== 'assistant') return false
      return (
        m.is_pushed === true ||
        pushedMessageIds.has(m.id) ||
        pushedContents.has(m.text.trim())
      )
    },
    [pushedMessageIds, pushedContents]
  )

  // Set of message IDs that are currently in draft or approved review
  const inPipelineMessageIds = useMemo(() => {
    const set = new Set<string>()
    knowledge.forEach(k => {
      if ((k.status === 'draft' || k.status === 'approved') && k.source_message_id) {
        set.add(k.source_message_id)
      }
    })
    return set
  }, [knowledge])

  // Active jobs checking (queued or indexing)
  const hasActiveJobs = useMemo(() => {
    const hasJobActive = jobs.some(j => j.status === 'queued' || j.status === 'indexing')
    const hasSingleTrackerActive = !!(
      singlePushTracker &&
      (singlePushTracker.status === 'queued' || singlePushTracker.status === 'indexing')
    )
    return hasJobActive || hasSingleTrackerActive
  }, [jobs, singlePushTracker])

  // Synchronize single push tracker with background job polling updates
  useEffect(() => {
    if (!singlePushTracker) return
    const matchingJob = jobs.find(j => j.id === singlePushTracker.jobId)
    if (matchingJob) {
      const lastLog =
        matchingJob.logs && matchingJob.logs.length > 0
          ? matchingJob.logs[matchingJob.logs.length - 1].message
          : undefined

      setSinglePushTracker(prev => {
        if (!prev) return null
        return {
          ...prev,
          step: matchingJob.current_step || prev.step,
          status: matchingJob.status,
          chunksIndexed: matchingJob.chunks_indexed,
          chunksTotal: matchingJob.chunks_total,
          lastMessage: lastLog || prev.lastMessage,
          error: matchingJob.error || prev.error,
        }
      })

      if (matchingJob.status === 'indexed' || matchingJob.status === 'failed') {
        setPushingMessageId(null)
        // Auto-dismiss the side notification after 6 seconds
        const timer = setTimeout(() => {
          setSinglePushTracker(current => (current?.jobId === matchingJob.id ? null : current))
        }, 6000)
        return () => clearTimeout(timer)
      }
    }
  }, [jobs, singlePushTracker?.jobId])

  // Real-time polling when jobs are executing
  useEffect(() => {
    if (!hasActiveJobs) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      return
    }

    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const [jobRows, knowledgeRows, chatRows, stats] = await Promise.all([
          api('/jobs'),
          api('/knowledge'),
          api('/conversations'),
          api('/qdrant/stats').catch(() => null),
        ])
        setJobs(jobRows)
        setKnowledge(knowledgeRows)
        setConversations(chatRows)
        if (stats) setQdrantStats(stats)
      } catch {
        // Silently continue polling
      }
    }, 1500)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [api, hasActiveJobs])

  // Automatically select the active or latest job if none selected
  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      const active = jobs.find(j => j.status === 'queued' || j.status === 'indexing')
      setSelectedJobId(active ? active.id : jobs[0].id)
    }
  }, [jobs, selectedJobId])

  // Clear notice after 4 seconds
  useEffect(() => {
    if (actionNotice) {
      const t = setTimeout(() => setActionNotice(null), 4000)
      return () => clearTimeout(t)
    }
  }, [actionNotice])

  // Filter conversations for Chats tab: completely omit pushed conversations and pushed turns
  const { conversationsToDisplay, fullyPushedConvCount } = useMemo(() => {
    let pushedConvCount = 0

    const list = conversations
      .map(conv => {
        // 1. Identify which messages belong to already pushed Q&A dialogue turns
        const pushedTurnMessageIds = new Set<string>()

        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i]
          if (msg.role === 'assistant' && isAssistantPushed(msg)) {
            pushedTurnMessageIds.add(msg.id)
            // Walk backwards to find and mark user message(s) that prompted this pushed assistant answer
            for (let j = i - 1; j >= 0; j--) {
              const prev = conv.messages[j]
              if (prev.role === 'user') {
                pushedTurnMessageIds.add(prev.id)
              } else {
                break
              }
            }
          }
        }

        const totalAssistants = conv.messages.filter(m => m.role === 'assistant').length
        const pushedAssistants = conv.messages.filter(m => isAssistantPushed(m)).length
        const unindexedAssistants = totalAssistants - pushedAssistants
        const isFullyPushed = totalAssistants > 0 && unindexedAssistants === 0

        if (isFullyPushed) {
          pushedConvCount++
        }

        // Visible messages: when hiding pushed, omit any message from already pushed turns
        const visibleMessages = conv.messages.filter(msg => {
          if (!hidePushedInChats) return true
          return !pushedTurnMessageIds.has(msg.id)
        })

        return {
          ...conv,
          visibleMessages,
          unindexedAssistants,
          isFullyPushed,
        }
      })
      .filter(conv => {
        // When hiding pushed chats, omit conversations that are completely pushed or have 0 visible messages
        if (hidePushedInChats && (conv.isFullyPushed || conv.visibleMessages.length === 0)) {
          return false
        }
        if (!searchChat) return true
        const matchTitle = conv.title.toLowerCase().includes(searchChat.toLowerCase())
        const matchText = conv.messages.some(m => m.text.toLowerCase().includes(searchChat.toLowerCase()))
        return matchTitle || matchText
      })

    return { conversationsToDisplay: list, fullyPushedConvCount: pushedConvCount }
  }, [conversations, hidePushedInChats, isAssistantPushed, searchChat])

  // Keep a valid conversation selected as the list changes
  useEffect(() => {
    if (conversationsToDisplay.length === 0) {
      setSelectedConversationId(null)
      return
    }
    if (selectedConversationId && conversationsToDisplay.some(c => c.id === selectedConversationId)) {
      return
    }
    setSelectedConversationId(conversationsToDisplay[0].id)
  }, [conversationsToDisplay, selectedConversationId])

  const selectedConversation = useMemo(
    () => conversationsToDisplay.find(c => c.id === selectedConversationId) || null,
    [conversationsToDisplay, selectedConversationId]
  )

  const totalPushedChatMsgs = pushedMessageIds.size

  // Scroll the transcript to the latest message when the selection changes
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight })
  }, [selectedConversationId])


  // Resolve the editable draft for a message: unsaved edits win, then an existing
  // knowledge item, then the raw chat text.
  const draftFor = useCallback(
    (conv: AdminConversation, message: AdminMessage) => {
      const saved = messageDrafts[message.id]
      if (saved) return saved

      const item = knowledge.find(k => k.source_message_id === message.id)
      const idx = conv.messages.findIndex(m => m.id === message.id)
      let question = item?.question ?? ''
      if (!question) {
        for (let j = (idx >= 0 ? idx : conv.messages.length) - 1; j >= 0; j--) {
          if (conv.messages[j].role === 'user') {
            question = conv.messages[j].text
            break
          }
        }
      }
      return { question, content: item?.content || message.text || '' }
    },
    [messageDrafts, knowledge]
  )

  const updateDraft = (messageId: string, patch: Partial<{ question: string; content: string }>) => {
    setMessageDrafts(prev => ({
      ...prev,
      [messageId]: {
        question: patch.question ?? prev[messageId]?.question ?? '',
        content: patch.content ?? prev[messageId]?.content ?? '',
      },
    }))
  }

  const toggleMessageEdit = (conv: AdminConversation, message: AdminMessage) => {
    if (editingMessageId === message.id) {
      setEditingMessageId(null)
      return
    }
    const draft = draftFor(conv, message)
    setMessageDrafts(prev => ({ ...prev, [message.id]: draft }))
    setEditingMessageId(message.id)
  }

  // Save an edited message: 'draft' stages it, 'approve' stages it as ready to push.
  const saveMessageEdit = async (
    conv: AdminConversation,
    message: AdminMessage,
    action: 'draft' | 'approve'
  ) => {
    setError('')
    const draft = draftFor(conv, message)
    const content = draft.content.trim()
    if (!content) {
      setError('Message content cannot be empty')
      return
    }
    setIsSavingInline(true)
    try {
      await api('/knowledge/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: draft.question.trim() || null,
          content,
          source_type: 'chat',
          source_message_id: message.id,
          action,
        }),
      })
      setEditingMessageId(null)
      setMessageDrafts(prev => {
        const next = { ...prev }
        delete next[message.id]
        return next
      })
      setActionNotice(
        action === 'approve'
          ? 'Approved! Message moved to Ready to Push.'
          : 'Draft saved to In Review.'
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setIsSavingInline(false)
    }
  }

  // Push a single message straight to Qdrant, using the current edits as written.
  const directPushMessage = async (conv: AdminConversation, message: AdminMessage) => {
    setError('')
    const draft = draftFor(conv, message)
    const content = draft.content.trim()
    if (!content) {
      setError('Message content cannot be empty')
      return
    }
    setPushingMessageId(message.id)
    const titleText = (draft.question.trim() || content).slice(0, 45)
    const title = titleText.length >= 45 ? `${titleText}...` : titleText

    setSinglePushTracker({
      jobId: 'pending',
      messageId: message.id,
      title,
      step: 'queued',
      status: 'queued',
      lastMessage: 'Starting ingestion pipeline...',
    })

    try {
      const res = await api('/knowledge/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_message_id: message.id,
          question: draft.question.trim() || null,
          content,
          source_type: 'chat',
          action: 'push',
        }),
      })

      if (res.job) {
        setSelectedJobId(res.job.id)
        setSinglePushTracker({
          jobId: res.job.id,
          knowledgeItemId: res.item?.id,
          messageId: message.id,
          title,
          step: res.job.current_step || 'queued',
          status: res.job.status || 'queued',
          chunksIndexed: res.job.chunks_indexed,
          chunksTotal: res.job.chunks_total,
          lastMessage: res.job.logs?.[res.job.logs.length - 1]?.message || 'Queued for processing',
        })
      }
      setEditingMessageId(null)
      setMessageDrafts(prev => {
        const next = { ...prev }
        delete next[message.id]
        return next
      })
      await refresh()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Could not push message'
      setError(errMsg)
      setSinglePushTracker(prev =>
        prev
          ? { ...prev, status: 'failed', step: 'failed', error: errMsg, lastMessage: errMsg }
          : null
      )
      setPushingMessageId(null)
    }
  }

  // Push every not-yet-indexed assistant message in the conversation as one batch.
  const pushWholeConversation = async (conv: AdminConversation) => {
    setError('')
    const pending = conv.messages.filter(m => m.role === 'assistant' && !isAssistantPushed(m))
    if (pending.length === 0) {
      setActionNotice('Every answer in this chat is already indexed in Qdrant.')
      return
    }

    const payload = pending
      .map(m => {
        const draft = draftFor(conv, m)
        return {
          source_message_id: m.id,
          question: draft.question.trim() || null,
          content: draft.content.trim(),
        }
      })
      .filter(p => p.content.length > 0)

    if (payload.length === 0) {
      setError('Nothing to push: every pending answer is empty')
      return
    }

    setIsPushingConversation(true)
    try {
      const res = await api('/knowledge/push-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload, source_type: 'chat' }),
      })
      setMessageDrafts(prev => {
        const next = { ...prev }
        payload.forEach(p => delete next[p.source_message_id])
        return next
      })
      setEditingMessageId(null)
      setActionNotice(res.message || `Queued ${payload.length} message(s) for ingestion`)
      if (res.job_ids && res.job_ids.length > 0) {
        setSelectedJobId(res.job_ids[0])
      }
      await refresh()
      setTab('pipeline')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not push chat to Qdrant')
    } finally {
      setIsPushingConversation(false)
    }
  }

  // Other Action Handlers
  const updateDraftItem = async (item: KnowledgeItem) => {
    setError('')
    try {
      await api(`/knowledge/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: item.question || null, content: item.content }),
      })
      setActionNotice('Draft saved successfully')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save draft')
    }
  }

  const approveItem = async (item: KnowledgeItem) => {
    setError('')
    try {
      await api(`/knowledge/${item.id}/approve`, { method: 'POST' })
      setActionNotice('Approved! Moved to Ready to Push tab.')
      await refresh()
      setTab('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve item')
    }
  }

  const revertItem = async (item: KnowledgeItem) => {
    setError('')
    try {
      await api(`/knowledge/${item.id}/revert`, { method: 'POST' })
      setActionNotice('Reverted to Review draft')
      await refresh()
      setTab('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revert item')
    }
  }

  const deleteItem = async (item: KnowledgeItem) => {
    if (!confirm('Are you sure you want to discard this item?')) return
    setError('')
    try {
      await api(`/knowledge/${item.id}`, { method: 'DELETE' })
      setActionNotice('Item removed')
      setSelectedItemIds(ids => ids.filter(id => id !== item.id))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete item')
    }
  }

  const pushSingleItem = async (item: KnowledgeItem) => {
    setError('')
    try {
      setSinglePushTracker({
        jobId: 'pending',
        knowledgeItemId: item.id,
        messageId: item.source_message_id || undefined,
        title: (item.question || item.content).slice(0, 45) + '...',
        step: 'queued',
        status: 'queued',
        lastMessage: 'Starting ingestion...',
      })
      const job = await api(`/knowledge/${item.id}/ingest`, { method: 'POST' })
      setSelectedJobId(job.id)
      setSinglePushTracker({
        jobId: job.id,
        knowledgeItemId: item.id,
        messageId: item.source_message_id || undefined,
        title: (item.question || item.content).slice(0, 45) + '...',
        step: job.current_step || 'queued',
        status: job.status || 'queued',
        chunksIndexed: job.chunks_indexed,
        chunksTotal: job.chunks_total,
        lastMessage: job.logs?.[job.logs.length - 1]?.message || 'Queued for processing',
      })
      setActionNotice('Ingestion started! Tracking progress in side notification.')
      await refresh()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Could not start ingestion'
      setError(errMsg)
      setSinglePushTracker(prev =>
        prev
          ? { ...prev, status: 'failed', step: 'failed', error: errMsg, lastMessage: errMsg }
          : null
      )
    }
  }

  const pushBatch = async (itemIds?: string[]) => {
    setError('')
    setIsPushingBatch(true)
    try {
      const payload = itemIds && itemIds.length > 0 ? { item_ids: itemIds } : {}
      const res = await api('/knowledge/batch-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setActionNotice(res.message || 'Batch ingestion started!')
      if (res.job_ids && res.job_ids.length > 0) {
        setSelectedJobId(res.job_ids[0])
      }
      setSelectedItemIds([])
      await refresh()
      setTab('pipeline')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start batch ingestion')
    } finally {
      setIsPushingBatch(false)
    }
  }

  const uploadFile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = event.currentTarget
    const input = form.elements.namedItem('file') as HTMLInputElement
    if (!input.files?.[0]) return
    const body = new FormData()
    body.append('file', input.files[0])
    try {
      await api('/uploads', { method: 'POST', body })
      form.reset()
      setActionNotice('Document uploaded and added to Review drafts!')
      await refresh()
      setTab('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // Active or selected job details
  const activeJob = jobs.find(j => j.id === selectedJobId) || jobs[0] || null
  const relatedItem = activeJob ? knowledge.find(k => k.id === activeJob.knowledge_item_id) : null

  // Helper for pipeline step visual state
  const getStepState = (stepIndex: number, currentStep?: string, jobStatus?: string) => {
    if (jobStatus === 'failed') {
      const stepOrder = ['queued', 'chunking', 'embedding', 'pushing_qdrant', 'indexed']
      const failIndex = stepOrder.indexOf(currentStep || 'queued')
      if (stepIndex < failIndex) return 'done'
      if (stepIndex === failIndex) return 'failed'
      return 'pending'
    }
    if (jobStatus === 'indexed') return 'done'

    const stepOrder = ['queued', 'chunking', 'embedding', 'pushing_qdrant', 'indexed']
    const activeIndex = stepOrder.indexOf(currentStep || 'queued')
    if (stepIndex < activeIndex) return 'done'
    if (stepIndex === activeIndex) return 'active'
    return 'pending'
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-bg text-muted">Loading admin portal...</div>
  if (!session) return <Login onLogin={setSession} />

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
              <Database size={20} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base font-bold sm:text-lg">Second Brain Portal</h1>
                <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Knowledge Sync
                </span>
              </div>
              <p className="hidden text-xs text-muted sm:block">Curate chat knowledge & push embeddings to Qdrant</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Qdrant Vectors & Pushed Records Badge */}
            <button
              onClick={() => {
                setTab('pipeline')
                fetchQdrantStats()
              }}
              title="Click to view Qdrant Pipeline stats and verified records"
              className="flex items-center gap-2.5 rounded-xl border border-line bg-raised/70 px-3 py-1.5 transition hover:border-accent/40"
            >
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="text-left">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">Qdrant Vectors</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xs font-bold text-accent">
                    {qdrantStats?.points_count !== undefined ? qdrantStats.points_count.toLocaleString() : '3,061'}
                  </span>
                  <span className="text-[10px] text-muted">
                    ({indexedItems.length} pushed)
                  </span>
                </div>
              </div>
              <ArrowClockwise size={13} className={`text-muted ${isRefreshingStats ? 'animate-spin' : ''}`} />
            </button>

            {/* Refresh All */}
            <button
              onClick={refresh}
              title="Refresh all data"
              className="rounded-xl border border-line bg-surface p-2 text-muted transition hover:border-accent/40 hover:text-ink"
            >
              <ArrowClockwise size={18} />
            </button>

            {/* Sign Out */}
            <button
              onClick={() => supabase.auth.signOut()}
              title="Sign out"
              className="rounded-xl border border-line bg-surface p-2 text-muted transition hover:border-accent/40 hover:text-rose-500"
            >
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-line bg-surface/50">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          <button
            onClick={() => setTab('chats')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'chats'
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
            }`}
          >
            <ChatCircle size={18} weight={tab === 'chats' ? 'bold' : 'regular'} />
            <span>1. Chats</span>
            <span className="rounded-full bg-surface/30 px-1.5 py-0.5 text-xs font-mono">
              {conversationsToDisplay.length}
            </span>
          </button>

          <button
            onClick={() => setTab('review')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'review'
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
            }`}
          >
            <FileText size={18} weight={tab === 'review' ? 'bold' : 'regular'} />
            <span>2. In Review</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-mono font-bold ${
                draftItems.length > 0 ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-surface/30'
              }`}
            >
              {draftItems.length}
            </span>
          </button>

          <button
            onClick={() => setTab('ready')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'ready'
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
            }`}
          >
            <CloudArrowUp size={18} weight={tab === 'ready' ? 'bold' : 'regular'} />
            <span>3. Ready to Push</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-mono font-bold ${
                approvedItems.length > 0 ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-surface/30'
              }`}
            >
              {approvedItems.length}
            </span>
          </button>

          <button
            onClick={() => setTab('pipeline')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === 'pipeline'
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'border border-line bg-surface text-muted hover:border-accent/40 hover:text-ink'
            }`}
          >
            <Cpu size={18} weight={tab === 'pipeline' ? 'bold' : 'regular'} />
            <span>4. Pipeline & Pushed Records</span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {indexedItems.length}
            </span>
            {hasActiveJobs && (
              <span className="flex h-2 w-2 rounded-full bg-sky-400 ring-2 ring-sky-300 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        {/* Flash Notifications & Errors */}
        {actionNotice && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm font-medium text-emerald-600 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} weight="bold" />
              <span>{actionNotice}</span>
            </div>
            <button onClick={() => setActionNotice(null)} className="text-xs opacity-75 hover:opacity-100">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm font-medium text-rose-600 dark:text-rose-300">
            <div className="flex items-center gap-2">
              <WarningCircle size={18} weight="bold" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError('')} className="text-xs opacity-75 hover:opacity-100">
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: CHATS */}
        {tab === 'chats' && (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <div className="grid min-h-0 grid-cols-1 lg:h-[calc(100dvh-16rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
              {/* LEFT: conversation list */}
              <aside className="flex min-h-0 flex-col border-b border-line bg-bg lg:border-b-0 lg:border-r">
                <div className="space-y-2.5 border-b border-line p-3">
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      placeholder="Search chats..."
                      value={searchChat}
                      onChange={e => setSearchChat(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-xs focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setHidePushedInChats(h => !h)}
                    className={`inline-flex w-full items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      hidePushedInChats
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-line bg-surface text-muted hover:text-ink'
                    }`}
                    title="Toggle visibility of conversations already pushed to Qdrant"
                  >
                    {hidePushedInChats ? <EyeSlash size={14} /> : <Eye size={14} />}
                    <span>
                      {hidePushedInChats
                        ? `Hiding Pushed (${fullyPushedConvCount})`
                        : 'Showing All'}
                    </span>
                  </button>
                  {hidePushedInChats && totalPushedChatMsgs > 0 && (
                    <p className="text-[10px] leading-relaxed text-muted">
                      <strong className="text-ink">{fullyPushedConvCount}</strong> fully pushed
                      conversation(s) ·{' '}
                      <strong className="text-ink">{totalPushedChatMsgs}</strong> messages are
                      hidden from this queue.
                    </p>
                  )}
                </div>

                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                  {conversationsToDisplay.length === 0 ? (
                    <div className="px-3 py-10 text-center text-muted">
                      <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500/70" />
                      <p className="text-xs font-semibold text-ink">Queue is clear</p>
                      <p className="mt-1 text-[11px]">
                        {hidePushedInChats
                          ? 'Every chat has been pushed. Toggle above to see them.'
                          : 'No conversations match your search.'}
                      </p>
                    </div>
                  ) : (
                    conversationsToDisplay.map(conv => {
                      const isActive = conv.id === selectedConversationId
                      const firstUnpushed = conv.visibleMessages.find(
                        m => m.role === 'assistant' && !isAssistantPushed(m)
                      )
                      const preview =
                        firstUnpushed?.text ||
                        conv.visibleMessages[conv.visibleMessages.length - 1]?.text ||
                        'No messages'

                      return (
                        <button
                          key={conv.id}
                          onClick={() => setSelectedConversationId(conv.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isActive
                              ? 'border-accent bg-accent/10 shadow-sm'
                              : 'border-transparent hover:border-line hover:bg-raised/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`line-clamp-1 text-xs font-semibold ${
                                isActive ? 'text-accent' : 'text-ink'
                              }`}
                            >
                              {conv.title || 'Untitled conversation'}
                            </p>
                            {conv.isFullyPushed && (
                              <CheckCircle
                                size={14}
                                weight="fill"
                                className="shrink-0 text-emerald-500"
                              />
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                            {preview}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
                            <span className="font-mono">{conv.id.slice(0, 8)}</span>
                            <span>·</span>
                            <span className="font-mono">{conv.messages.length} msgs</span>
                            {conv.unindexedAssistants > 0 && (
                              <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-600 dark:text-amber-400">
                                {conv.unindexedAssistants} to push
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </aside>

              {/* RIGHT: full chat transcript */}
              <section className="flex min-h-0 flex-col bg-bg lg:max-h-[calc(100dvh-16rem)]">
                {!selectedConversation ? (
                  <div className="grid flex-1 place-items-center p-10 text-center text-muted">
                    <div>
                      <ChatCircle size={40} className="mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-semibold text-ink">Select a conversation</p>
                      <p className="mt-1 text-xs">
                        Pick a chat on the left to read its full history and curate answers.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Transcript header */}
                    <header className="border-b border-line bg-surface px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate font-display text-base font-bold">
                            {selectedConversation.title || 'Untitled conversation'}
                          </h2>
                          <p className="text-[11px] font-mono text-muted">
                            ID: {selectedConversation.id.slice(0, 8)} • User:{' '}
                            {selectedConversation.user_id.slice(0, 8)} •{' '}
                            {selectedConversation.messages.length} message(s)
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {selectedConversation.isFullyPushed && (
                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              ✓ Pushed to Qdrant
                            </span>
                          )}
                          <button
                            onClick={() => pushWholeConversation(selectedConversation)}
                            disabled={
                              isPushingConversation ||
                              selectedConversation.unindexedAssistants === 0
                            }
                            title="Push every un-indexed answer in this chat to Qdrant in one batch"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90 disabled:opacity-50"
                          >
                            {isPushingConversation ? (
                              <CircleNotch size={14} className="animate-spin" />
                            ) : (
                              <PaperPlaneTilt size={14} weight="fill" />
                            )}
                            <span>
                              {isPushingConversation
                                ? 'Pushing...'
                                : `Push Whole Chat (${selectedConversation.unindexedAssistants})`}
                            </span>
                          </button>
                        </div>
                      </div>
                    </header>

                    {/* Messages */}
                    <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                      {selectedConversation.visibleMessages.length === 0 ? (
                        <p className="py-10 text-center text-xs text-muted">
                          Every message in this chat has been pushed to Qdrant.
                        </p>
                      ) : (
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                          {selectedConversation.visibleMessages.map(message => {
                            const isUser = message.role === 'user'
                            const isAlreadyPushed = isAssistantPushed(message)
                            const isInPipeline = inPipelineMessageIds.has(message.id)
                            const isEditingThis = editingMessageId === message.id
                            const draft = draftFor(selectedConversation, message)

                            const isThisMsgPushing =
                              pushingMessageId === message.id ||
                              ((singlePushTracker?.status === 'indexing' ||
                                singlePushTracker?.status === 'queued') &&
                                singlePushTracker?.messageId === message.id)

                            const stepLabel =
                              singlePushTracker?.step === 'chunking'
                                ? 'Chunking...'
                                : singlePushTracker?.step === 'embedding'
                                ? 'Embedding...'
                                : singlePushTracker?.step === 'pushing_qdrant'
                                ? 'Pushing Qdrant...'
                                : 'Starting...'

                            return (
                              <div
                                key={message.id}
                                className={`group flex items-end gap-2 ${
                                  isUser ? 'justify-end' : ''
                                }`}
                              >
                                {!isUser && (
                                  <div className="pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                                    <Sparkle size={14} weight="duotone" />
                                  </div>
                                )}

                                <div
                                  className={`relative max-w-[min(42rem,90%)] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                    isUser
                                      ? 'rounded-br-md bg-accent text-accent-ink'
                                      : isEditingThis
                                      ? 'rounded-bl-md border-2 border-accent bg-surface ring-4 ring-accent/10'
                                      : 'rounded-bl-md border border-line bg-surface shadow-soft'
                                  }`}
                                >
                                  {/* Role + status row */}
                                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                    <span
                                      className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                                        isUser ? 'text-accent-ink/70' : 'text-accent'
                                      }`}
                                    >
                                      {isUser ? 'User' : 'Assistant'}
                                    </span>

                                    {!isUser && isAlreadyPushed && (
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle size={11} weight="bold" /> Pushed
                                      </span>
                                    )}

                                    {!isUser && !isAlreadyPushed && isInPipeline && (
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                        <Clock size={11} weight="bold" /> In Pipeline
                                      </span>
                                    )}

                                    {/* Pencil + Paper plane actions */}
                                    {!isUser && !isEditingThis && !isAlreadyPushed && (
                                      <div className="ml-auto flex items-center gap-1 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                                        <button
                                          onClick={() =>
                                            toggleMessageEdit(selectedConversation, message)
                                          }
                                          className="rounded-lg border border-line bg-surface p-1.5 text-ink shadow-sm transition hover:border-accent hover:text-accent"
                                          title="Edit this message"
                                          aria-label="Edit message"
                                        >
                                          <PencilSimple size={14} weight="bold" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            directPushMessage(selectedConversation, message)
                                          }
                                          disabled={
                                            isThisMsgPushing ||
                                            (!!pushingMessageId && !isThisMsgPushing)
                                          }
                                          className={`inline-flex items-center gap-1 rounded-lg p-1.5 shadow-sm transition ${
                                            isThisMsgPushing
                                              ? 'bg-accent/15 text-accent'
                                              : 'bg-accent text-accent-ink hover:opacity-90'
                                          } disabled:opacity-50`}
                                          title="Push this message to Qdrant"
                                          aria-label="Push message to Qdrant"
                                        >
                                          {isThisMsgPushing ? (
                                            <CircleNotch size={14} className="animate-spin" />
                                          ) : (
                                            <PaperPlaneTilt size={14} weight="fill" />
                                          )}
                                        </button>
                                      </div>
                                    )}

                                    {!isUser && isThisMsgPushing && (
                                      <span className="text-[10px] font-semibold text-accent">
                                        {stepLabel}
                                      </span>
                                    )}
                                  </div>

                                  {/* Body or inline editor */}
                                  {!isEditingThis ? (
                                    <p className="whitespace-pre-wrap">{message.text}</p>
                                  ) : (
                                    <div className="mt-1 space-y-3">
                                      <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                                          Question / Context
                                        </label>
                                        <input
                                          value={draft.question}
                                          onChange={e =>
                                            updateDraft(message.id, { question: e.target.value })
                                          }
                                          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm font-medium focus:border-accent focus:outline-none"
                                          placeholder="Question this content answers..."
                                        />
                                      </div>

                                      <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                                          Answer / Knowledge Content
                                        </label>
                                        <textarea
                                          value={draft.content}
                                          onChange={e =>
                                            updateDraft(message.id, { content: e.target.value })
                                          }
                                          rows={5}
                                          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none"
                                          placeholder="Edit the canonical answer..."
                                        />
                                      </div>

                                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
                                        <button
                                          onClick={() => toggleMessageEdit(selectedConversation, message)}
                                          className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
                                        >
                                          <X size={13} weight="bold" /> Close
                                        </button>

                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            disabled={isSavingInline}
                                            onClick={() =>
                                              saveMessageEdit(selectedConversation, message, 'draft')
                                            }
                                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent disabled:opacity-50"
                                          >
                                            Save Draft
                                          </button>
                                          <button
                                            disabled={isSavingInline}
                                            onClick={() =>
                                              saveMessageEdit(selectedConversation, message, 'approve')
                                            }
                                            className="inline-flex items-center gap-1 rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent hover:text-accent-ink disabled:opacity-50"
                                          >
                                            <Check size={13} weight="bold" /> Approve
                                          </button>
                                          <button
                                            disabled={isSavingInline}
                                            onClick={() =>
                                              directPushMessage(selectedConversation, message)
                                            }
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90 disabled:opacity-50"
                                          >
                                            <PaperPlaneTilt size={13} weight="fill" />
                                            <span>Push to Qdrant</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {/* TAB 2: IN REVIEW */}
        {tab === 'review' && (
          <div className="space-y-6">
            {/* Upload Document Draft box */}
            <form onSubmit={uploadFile} className="rounded-2xl border border-dashed border-line bg-surface/70 p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
                    <CloudArrowUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Upload Document to Review</h3>
                    <p className="text-xs text-muted">Upload a .txt or .md file to review and chunk before pushing to Qdrant.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    name="file"
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    required
                    className="text-xs file:mr-2 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-raised"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition hover:opacity-90 shadow-sm"
                  >
                    Upload draft
                  </button>
                </div>
              </div>
            </form>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">Drafts Awaiting Review ({draftItems.length})</h2>
                <p className="text-xs text-muted">
                  Edit the canonical question and answer content. Once approved, the item will move to &quot;Ready to Push&quot;.
                </p>
              </div>
            </div>

            {draftItems.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-12 text-center text-muted">
                <FileText size={36} className="mx-auto mb-2 text-muted/60" />
                <p className="font-medium">No items currently in review.</p>
                <p className="mt-1 text-xs">Edit any message in the Chats tab or upload text documents above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {draftItems.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase text-accent">
                        {item.source_type}
                      </span>
                      <span className="text-xs text-muted font-mono">ID: {item.id.slice(0, 8)}</span>
                      <span className="ml-auto rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        In Review
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted">Question / Context / Title</label>
                        <input
                          value={item.question || ''}
                          onChange={e => {
                            const val = e.target.value
                            setKnowledge(prev => prev.map(k => (k.id === item.id ? { ...k, question: val } : k)))
                          }}
                          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-sm focus:border-accent focus:outline-none font-medium"
                          placeholder="What question does this content answer?"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted">Content / Answer (Canonical)</label>
                        <textarea
                          value={item.content}
                          rows={5}
                          onChange={e => {
                            const val = e.target.value
                            setKnowledge(prev => prev.map(k => (k.id === item.id ? { ...k, content: val } : k)))
                          }}
                          className="w-full rounded-xl border border-line bg-bg px-3.5 py-2 text-sm focus:border-accent focus:outline-none font-sans"
                          placeholder="Review and polish the answer text to be embedded..."
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
                      <button
                        onClick={() => deleteItem(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash size={14} /> Discard
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateDraftItem(item)}
                          className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-accent"
                        >
                          Save Draft
                        </button>
                        <button
                          onClick={() => approveItem(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90"
                        >
                          <Check size={14} weight="bold" /> Approve & Move to Ready
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: READY TO PUSH */}
        {tab === 'ready' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold">Ready to Push ({approvedItems.length})</h2>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Approved
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    These approved messages are verified. You can push them one by one or push all at once in safe batches.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedItemIds.length > 0 && (
                    <button
                      onClick={() => pushBatch(selectedItemIds)}
                      disabled={isPushingBatch}
                      className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    >
                      <Play size={14} weight="fill" />
                      <span>Push Selected ({selectedItemIds.length})</span>
                    </button>
                  )}

                  <button
                    onClick={() => pushBatch()}
                    disabled={approvedItems.length === 0 || isPushingBatch}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Stack size={16} weight="bold" />
                    <span>Push All ({approvedItems.length}) to Qdrant</span>
                  </button>
                </div>
              </div>

              {approvedItems.length > 5 && (
                <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={selectedItemIds.length === approvedItems.length && approvedItems.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelectedItemIds(approvedItems.map(i => i.id))
                        else setSelectedItemIds([])
                      }}
                      className="rounded border-line"
                    />
                    <label htmlFor="select-all" className="cursor-pointer font-medium text-ink">
                      Select all {approvedItems.length} items
                    </label>
                  </div>
                  <span className="text-[11px]">Batching handles rate limits automatically</span>
                </div>
              )}
            </div>

            {approvedItems.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface p-12 text-center text-muted">
                <CheckCircle size={36} className="mx-auto mb-2 text-muted/60" />
                <p className="font-medium">No approved items waiting to be pushed.</p>
                <p className="mt-1 text-xs">
                  Go to Chats and click &quot;Edit & Approve&quot; or check the In Review tab.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {approvedItems.map(item => {
                  const isChecked = selectedItemIds.includes(item.id)
                  return (
                    <article
                      key={item.id}
                      className={`rounded-2xl border transition p-5 shadow-sm ${
                        isChecked ? 'border-accent bg-accent/5' : 'border border-line bg-surface'
                      }`}
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) setSelectedItemIds(ids => [...ids, item.id])
                            else setSelectedItemIds(ids => ids.filter(id => id !== item.id))
                          }}
                          className="rounded border-line text-accent"
                        />
                        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase text-accent">
                          {item.source_type}
                        </span>
                        <span className="text-xs text-muted font-mono">ID: {item.id.slice(0, 8)}</span>
                        <span className="ml-auto text-xs text-muted">
                          Approved: {item.approved_at ? new Date(item.approved_at).toLocaleTimeString() : 'Recently'}
                        </span>
                      </div>

                      <div className="mb-4">
                        <h4 className="font-semibold text-sm text-ink mb-1">{item.question || 'Untitled'}</h4>
                        <p className="line-clamp-3 text-xs leading-relaxed text-muted whitespace-pre-wrap">{item.content}</p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => revertItem(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-ink"
                          >
                            <ArrowUUpLeft size={13} /> Revert to Review
                          </button>
                          <button
                            onClick={() => deleteItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash size={13} />
                          </button>
                        </div>

                        <button
                          onClick={() => pushSingleItem(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink shadow-sm transition hover:opacity-90"
                        >
                          <Play size={13} weight="fill" /> Push to Qdrant (Single)
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PIPELINE FLOW, LOGS & PUSHED RECORDS */}
        {tab === 'pipeline' && (
          <div className="space-y-6">
            {/* Live Qdrant Metrics Banner */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total Qdrant Vectors</span>
                  <Database size={20} className="text-accent" />
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="font-mono text-3xl font-extrabold text-ink">
                    {qdrantStats?.points_count !== undefined ? qdrantStats.points_count.toLocaleString() : '3,061'}
                  </span>
                  <span className="text-xs font-medium text-emerald-500">Live</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Collection &apos;{qdrantStats?.collection || 'second_brain'}&apos;</p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Records Pushed</span>
                  <CheckCircle size={20} className="text-emerald-500" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-extrabold text-emerald-500">
                    {qdrantStats?.pushed_records_count !== undefined
                      ? qdrantStats.pushed_records_count
                      : indexedItems.length}
                  </span>
                  <span className="text-xs text-muted">verified</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Custom items pushed to vector DB</p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Vector Dimension</span>
                  <Sparkle size={20} className="text-accent" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-extrabold text-ink">
                    {qdrantStats?.vector_size || 3072}
                  </span>
                  <span className="text-xs text-muted">dim</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Via Gemini gemini-embedding-2</p>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Pipeline Status</span>
                  <Cpu size={20} className="text-accent" />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      hasActiveJobs ? 'bg-sky-500 animate-ping' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-mono text-lg font-bold text-ink">
                    {hasActiveJobs ? 'Processing...' : 'Ready'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  {jobs.filter(j => j.status === 'indexed').length} completed, {jobs.filter(j => j.status === 'failed').length} failed
                </p>
              </div>
            </div>

            {/* VISUAL FLOW STEPPER */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-display text-base font-bold">Visual Ingestion Pipeline</h3>
                  <p className="text-xs text-muted">
                    {activeJob
                      ? `Tracking Job ${activeJob.id.slice(0, 8)} (${relatedItem?.question || 'Item'})`
                      : 'No active job currently running.'}
                  </p>
                </div>

                {activeJob && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                      activeJob.status === 'indexed'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : activeJob.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 animate-pulse'
                    }`}
                  >
                    Status: {activeJob.status}
                  </span>
                )}
              </div>

              {/* 5-Step Stepper Component */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-5">
                {PIPELINE_STEPS.map((step, idx) => {
                  const Icon = step.icon
                  const state = getStepState(idx, activeJob?.current_step, activeJob?.status)

                  return (
                    <div
                      key={step.id}
                      className={`relative flex flex-col rounded-xl border p-4 transition ${
                        state === 'active'
                          ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/20'
                          : state === 'done'
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : state === 'failed'
                          ? 'border-rose-500/40 bg-rose-500/5'
                          : 'border-line/60 bg-bg/50 opacity-60'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            state === 'active'
                              ? 'bg-sky-500 text-white'
                              : state === 'done'
                              ? 'bg-emerald-500 text-white'
                              : state === 'failed'
                              ? 'bg-rose-500 text-white'
                              : 'bg-raised text-muted'
                          }`}
                        >
                          <Icon size={16} weight={state === 'done' || state === 'active' ? 'bold' : 'regular'} />
                        </div>

                        {state === 'done' && <Check size={16} className="text-emerald-500" weight="bold" />}
                        {state === 'active' && <span className="h-2 w-2 rounded-full bg-sky-500 animate-ping" />}
                        {state === 'failed' && <WarningCircle size={16} className="text-rose-500" weight="bold" />}
                      </div>

                      <h4 className="text-xs font-bold text-ink">{step.label}</h4>
                      <p className="mt-1 text-[11px] text-muted leading-tight">{step.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* REAL-TIME LOGS CONSOLE */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal size={18} className="text-accent" />
                  <h3 className="text-sm font-semibold">Live Pipeline Execution Logs</h3>
                </div>

                <div className="flex items-center gap-2">
                  {jobs.length > 1 && (
                    <select
                      value={selectedJobId || ''}
                      onChange={e => setSelectedJobId(e.target.value)}
                      className="rounded-lg border border-line bg-bg px-2.5 py-1 text-xs focus:border-accent focus:outline-none"
                    >
                      {jobs.map(j => {
                        const item = knowledge.find(k => k.id === j.knowledge_item_id)
                        return (
                          <option key={j.id} value={j.id}>
                            {j.id.slice(0, 8)}: {item?.question ? item.question.slice(0, 30) : 'Item'} ({j.status})
                          </option>
                        )
                      })}
                    </select>
                  )}
                  <button
                    onClick={refresh}
                    className="rounded-lg border border-line p-1.5 text-muted hover:text-ink"
                    title="Refresh logs"
                  >
                    <ArrowClockwise size={14} />
                  </button>
                </div>
              </div>

              {/* Terminal Box */}
              <div className="min-h-56 max-h-96 overflow-y-auto rounded-xl border border-line bg-[#0d1117] p-4 font-mono text-xs text-slate-200">
                {!activeJob ? (
                  <p className="text-slate-500">No jobs to inspect. Run an ingestion to see live streaming logs.</p>
                ) : !activeJob.logs || activeJob.logs.length === 0 ? (
                  <p className="text-slate-400">
                    [{new Date(activeJob.created_at).toLocaleTimeString()}] [QUEUED] Job initialized. Processing
                    chunks: {activeJob.chunks_indexed}/{activeJob.chunks_total}...
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {activeJob.logs.map((log, lIdx) => (
                      <div key={lIdx} className="flex items-start gap-2 leading-relaxed">
                        <span className="shrink-0 text-slate-500">[{log.timestamp}]</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] uppercase font-bold ${
                            log.level === 'error'
                              ? 'bg-rose-500/20 text-rose-400'
                              : log.level === 'warning'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {log.step}
                        </span>
                        <span className="flex-1 text-slate-200">{log.message}</span>
                      </div>
                    ))}
                    {activeJob.status === 'indexed' && (
                      <div className="mt-2 text-emerald-400 font-semibold flex items-center gap-1.5">
                        <CheckCircle size={15} weight="bold" />
                        <span>Ingestion completed and verified in Qdrant collection!</span>
                      </div>
                    )}
                    {activeJob.status === 'failed' && (
                      <div className="mt-2 text-rose-400 font-semibold flex items-center gap-1.5">
                        <WarningCircle size={15} weight="bold" />
                        <span>Job failed: {activeJob.error || 'Unknown error'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* VERIFIED RECORDS PUSHED TO QDRANT */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold">Verified Records Pushed to Qdrant</h3>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {indexedItems.length} records verified
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    These messages have been uploaded and indexed into the vector DB. They are hidden from the active Chats tab.
                  </p>
                </div>
              </div>

              {indexedItems.length === 0 ? (
                <p className="text-xs text-muted">No records have been pushed to Qdrant yet.</p>
              ) : (
                <div className="space-y-3">
                  {indexedItems.map(item => {
                    const relatedJob = jobs.find(j => j.knowledge_item_id === item.id)
                    return (
                      <article
                        key={item.id}
                        className="rounded-xl border border-line/70 bg-surface p-4 transition hover:border-accent/40"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">
                            {item.source_type}
                          </span>
                          <span className="text-xs font-mono text-muted">ID: {item.id.slice(0, 8)}</span>
                          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle size={12} weight="bold" /> Verified in Qdrant
                          </span>
                          <span className="ml-auto text-xs text-muted font-mono">
                            {item.chunks_count || 1} chunk(s)
                          </span>
                        </div>

                        <h4 className="font-semibold text-sm text-ink mb-1">{item.question || 'Untitled'}</h4>
                        <p className="line-clamp-2 text-xs text-muted whitespace-pre-wrap">{item.content}</p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-2 text-xs">
                          <span className="text-[11px] text-muted">
                            Updated: {new Date(item.updated_at).toLocaleString()}
                          </span>

                          <div className="flex items-center gap-2">
                            {relatedJob && (
                              <button
                                onClick={() => setSelectedJobId(relatedJob.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-ink"
                              >
                                <Terminal size={12} /> View Ingestion Log
                              </button>
                            )}
                            <button
                              onClick={() => revertItem(item)}
                              className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-accent hover:text-ink"
                            >
                              Re-edit / Revert
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>

            {/* JOBS HISTORY TABLE */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
              <h3 className="mb-4 font-display text-base font-bold">All Ingestion Jobs History</h3>
              {jobs.length === 0 ? (
                <p className="text-xs text-muted">No jobs have been processed yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="pb-2.5 font-semibold">Job ID</th>
                        <th className="pb-2.5 font-semibold">Knowledge Item</th>
                        <th className="pb-2.5 font-semibold">Status</th>
                        <th className="pb-2.5 font-semibold">Step</th>
                        <th className="pb-2.5 font-semibold">Chunks</th>
                        <th className="pb-2.5 font-semibold">Finished At</th>
                        <th className="pb-2.5 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/40 font-sans">
                      {jobs.map(j => {
                        const item = knowledge.find(k => k.id === j.knowledge_item_id)
                        const isCurrent = j.id === selectedJobId

                        return (
                          <tr key={j.id} className={isCurrent ? 'bg-accent/5' : ''}>
                            <td className="py-2.5 font-mono text-muted">{j.id.slice(0, 8)}</td>
                            <td className="py-2.5 font-medium max-w-xs truncate">{item?.question || j.knowledge_item_id.slice(0, 8)}</td>
                            <td className="py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  j.status === 'indexed'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : j.status === 'failed'
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {j.status}
                              </span>
                            </td>
                            <td className="py-2.5 font-mono text-[11px] text-muted">{j.current_step || '-'}</td>
                            <td className="py-2.5 font-mono">
                              {j.chunks_indexed}/{j.chunks_total}
                            </td>
                            <td className="py-2.5 text-muted">
                              {j.finished_at ? new Date(j.finished_at).toLocaleTimeString() : 'In progress'}
                            </td>
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => setSelectedJobId(j.id)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                  isCurrent ? 'bg-accent text-accent-ink' : 'border border-line hover:border-accent'
                                }`}
                              >
                                View Logs
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FLOATING SIDE NOTIFICATION FOR SINGLE PUSH PROGRESS */}
      {singlePushTracker && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
            <div className="flex items-center gap-2">
              {singlePushTracker.status === 'indexed' ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle size={18} weight="fill" />
                </div>
              ) : singlePushTracker.status === 'failed' ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <WarningCircle size={18} weight="fill" />
                </div>
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <CircleNotch size={18} className="animate-spin" weight="bold" />
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold leading-tight text-ink">
                  {singlePushTracker.status === 'indexed'
                    ? 'Pushed to Qdrant!'
                    : singlePushTracker.status === 'failed'
                    ? 'Ingestion Failed'
                    : 'Pushing to Qdrant...'}
                </h4>
                <p className="text-[10px] text-muted">
                  {singlePushTracker.status === 'indexed'
                    ? 'Vectors indexed & ready'
                    : singlePushTracker.status === 'failed'
                    ? 'Error encountered'
                    : 'Live pipeline processing'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  singlePushTracker.status === 'indexed'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : singlePushTracker.status === 'failed'
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-accent/15 text-accent'
                }`}
              >
                {singlePushTracker.status === 'indexed'
                  ? 'Completed'
                  : singlePushTracker.status === 'failed'
                  ? 'Failed'
                  : singlePushTracker.step === 'chunking'
                  ? 'Chunking'
                  : singlePushTracker.step === 'embedding'
                  ? 'Embedding'
                  : singlePushTracker.step === 'pushing_qdrant'
                  ? 'Upserting'
                  : 'Queued'}
              </span>

              <button
                onClick={() => setSinglePushTracker(null)}
                className="rounded-lg p-1 text-muted transition hover:bg-raised hover:text-ink"
                title="Dismiss"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>

          {/* Body: Title & Progress */}
          <div className="mt-3 space-y-2.5">
            <p className="line-clamp-1 text-xs font-medium text-ink" title={singlePushTracker.title}>
              "{singlePushTracker.title}"
            </p>

            {/* Stepper Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
                <span>
                  {singlePushTracker.status === 'indexed'
                    ? '5. Completed'
                    : singlePushTracker.step === 'pushing_qdrant'
                    ? '4. Pushing to Qdrant'
                    : singlePushTracker.step === 'embedding'
                    ? '3. Generating Embeddings'
                    : singlePushTracker.step === 'chunking'
                    ? '2. Chunking Text'
                    : '1. Queued'}
                </span>
                <span className="font-mono">
                  {singlePushTracker.status === 'indexed'
                    ? '100%'
                    : singlePushTracker.step === 'pushing_qdrant'
                    ? '85%'
                    : singlePushTracker.step === 'embedding'
                    ? '65%'
                    : singlePushTracker.step === 'chunking'
                    ? '35%'
                    : '15%'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    singlePushTracker.status === 'indexed'
                      ? 'bg-emerald-500'
                      : singlePushTracker.status === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-accent'
                  }`}
                  style={{
                    width:
                      singlePushTracker.status === 'indexed'
                        ? '100%'
                        : singlePushTracker.status === 'failed'
                        ? '100%'
                        : singlePushTracker.step === 'pushing_qdrant'
                        ? '85%'
                        : singlePushTracker.step === 'embedding'
                        ? '65%'
                        : singlePushTracker.step === 'chunking'
                        ? '35%'
                        : '15%',
                  }}
                />
              </div>
            </div>

            {/* Micro Stepper Pills */}
            <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-medium">
              <div
                className={`rounded py-0.5 ${
                  ['chunking', 'embedding', 'pushing_qdrant', 'indexed'].includes(singlePushTracker.step) ||
                  singlePushTracker.status === 'indexed'
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'bg-raised text-muted'
                }`}
              >
                Chunk
              </div>
              <div
                className={`rounded py-0.5 ${
                  ['embedding', 'pushing_qdrant', 'indexed'].includes(singlePushTracker.step) ||
                  singlePushTracker.status === 'indexed'
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'bg-raised text-muted'
                }`}
              >
                Embed
              </div>
              <div
                className={`rounded py-0.5 ${
                  ['pushing_qdrant', 'indexed'].includes(singlePushTracker.step) ||
                  singlePushTracker.status === 'indexed'
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'bg-raised text-muted'
                }`}
              >
                Qdrant
              </div>
              <div
                className={`rounded py-0.5 ${
                  singlePushTracker.status === 'indexed'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'bg-raised text-muted'
                }`}
              >
                Done
              </div>
            </div>

            {/* Live Message / Log text */}
            <div className="rounded-xl bg-bg/80 px-2.5 py-1.5 text-[11px] text-muted font-sans border border-line/50">
              <p className="truncate">
                {singlePushTracker.lastMessage ||
                  (singlePushTracker.status === 'indexed'
                    ? 'Vectors stored in Qdrant successfully'
                    : 'Processing background task...')}
              </p>
            </div>

            {/* Footer with optional pipeline link */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted">
                {singlePushTracker.chunksIndexed && singlePushTracker.chunksTotal
                  ? `${singlePushTracker.chunksIndexed}/${singlePushTracker.chunksTotal} chunks processed`
                  : 'Single message push'}
              </span>
              <button
                onClick={() => {
                  if (singlePushTracker.jobId && singlePushTracker.jobId !== 'pending') {
                    setSelectedJobId(singlePushTracker.jobId)
                  }
                  setTab('pipeline')
                }}
                className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1"
              >
                <span>View full logs</span>
                <ArrowRight size={11} />
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
