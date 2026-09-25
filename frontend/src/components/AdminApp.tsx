import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowClockwise, Check, CloudArrowUp, Database, SignOut } from '@phosphor-icons/react'
import { supabase, supabaseConfigured } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

type KnowledgeItem = {
  id: string; question?: string; content: string; source_type: string; status: string; updated_at: string
}
type Job = { id: string; knowledge_item_id: string; status: string; chunks_indexed: number; chunks_total: number; error?: string }
type AdminMessage = { id: string; role: 'user' | 'assistant'; text: string }
type AdminConversation = { id: string; title: string; user_id: string; messages: AdminMessage[] }

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) setError(error?.message || 'Could not sign in')
    else onLogin(data.session)
  }
  return <main className="grid min-h-screen place-items-center bg-bg p-4 text-ink">
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Admin portal</p>
      <h1 className="mt-2 font-display text-2xl font-bold">Sign in with Supabase</h1>
      {!supabaseConfigured && <p className="mt-3 text-sm text-rose-600">Supabase environment variables are missing.</p>}
      <input className="mt-6 w-full rounded-lg border border-line bg-bg px-3 py-2" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
      <input className="mt-3 w-full rounded-lg border border-line bg-bg px-3 py-2" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <button disabled={!supabaseConfigured} className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-ink disabled:opacity-50">Sign in</button>
    </form>
  </main>
}

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'chats' | 'migration'>('chats')
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [conversations, setConversations] = useState<AdminConversation[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const api = useCallback(async (path: string, init?: RequestInit) => {
    if (!session) throw new Error('Not signed in')
    const response = await fetch(`${API_URL}/api/admin${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${session.access_token}`, ...init?.headers },
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.detail || 'Admin request failed')
    return body
  }, [session])

  const refresh = useCallback(async () => {
    if (!session) return
    setError('')
    try {
      const [chatRows, knowledgeRows, jobRows] = await Promise.all([
        api('/conversations'), api('/knowledge'), api('/jobs'),
      ])
      setConversations(chatRows); setKnowledge(knowledgeRows); setJobs(jobRows)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load admin data') }
  }, [api, session])

  useEffect(() => { refresh() }, [refresh])
  if (loading) return <div className="grid min-h-screen place-items-center bg-bg text-muted">Loading...</div>
  if (!session) return <Login onLogin={setSession} />

  const saveChatAnswer = async (question: string, message: AdminMessage) => {
    await api('/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, content: message.text, source_type: 'chat', source_message_id: message.id }) })
    await refresh()
  }
  const updateItem = async (item: KnowledgeItem) => {
    await api(`/knowledge/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: item.question || null, content: item.content }) })
    await refresh()
  }
  const action = async (item: KnowledgeItem, name: 'approve' | 'ingest') => { await api(`/knowledge/${item.id}/${name}`, { method: 'POST' }); await refresh() }
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement
    if (!input.files?.[0]) return
    const body = new FormData(); body.append('file', input.files[0])
    await api('/uploads', { method: 'POST', body }); input.value = ''; await refresh()
  }

  return <div className="min-h-screen bg-bg text-ink">
    <header className="flex items-center justify-between border-b border-line px-6 py-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Second Brain</p><h1 className="font-display text-xl font-bold">Admin portal</h1></div>
      <div className="flex gap-2"><button onClick={refresh} className="rounded-lg border border-line p-2"><ArrowClockwise size={18} /></button><button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-line p-2"><SignOut size={18} /></button></div>
    </header>
    <nav className="mx-auto flex max-w-6xl gap-2 px-6 pt-6">
      {(['chats', 'migration'] as const).map(name => <button key={name} onClick={() => setTab(name)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === name ? 'bg-accent text-accent-ink' : 'border border-line bg-surface'}`}>{name}</button>)}
    </nav>
    <main className="mx-auto max-w-6xl p-6">
      {error && <p className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800">{error}</p>}
      {tab === 'chats' ? <div className="space-y-4">{conversations.map(conversation => <section key={conversation.id} className="rounded-xl border border-line bg-surface p-4"><h2 className="font-semibold">{conversation.title}</h2><p className="mb-3 text-xs text-muted">User {conversation.user_id}</p>{conversation.messages.map((message, index) => <div key={message.id} className="mb-2 flex items-start gap-3 rounded-lg bg-raised/60 p-3"><span className="w-16 shrink-0 text-xs font-semibold uppercase text-muted">{message.role}</span><p className="flex-1 whitespace-pre-wrap text-sm">{message.text}</p>{message.role === 'assistant' && <button onClick={() => saveChatAnswer(conversation.messages[index - 1]?.text || '', message)} className="shrink-0 rounded-md border border-line px-2 py-1 text-xs">Add to review</button>}</div>)}</section>)}</div>
      : <div>
        <form onSubmit={upload} className="mb-6 flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface p-4"><CloudArrowUp size={24} className="text-accent" /><input name="file" type="file" accept=".txt,.md,text/plain,text/markdown" required /><button className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">Upload draft</button></form>
        <div className="space-y-4">{knowledge.map((item, index) => <article key={item.id} className="rounded-xl border border-line bg-surface p-4"><div className="mb-3 flex items-center gap-2"><Database size={17} className="text-accent" /><span className="text-xs font-semibold uppercase tracking-wide">{item.source_type}</span><span className="ml-auto rounded-full bg-raised px-2 py-1 text-xs">{item.status}</span></div><input value={item.question || ''} onChange={e => setKnowledge(rows => rows.map((row, i) => i === index ? { ...row, question: e.target.value } : row))} className="mb-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" placeholder="Question or file title" /><textarea value={item.content} onChange={e => setKnowledge(rows => rows.map((row, i) => i === index ? { ...row, content: e.target.value } : row))} className="min-h-32 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm" /><div className="mt-3 flex gap-2"><button onClick={() => updateItem(item)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold">Save draft</button>{item.status === 'draft' && <button onClick={() => action(item, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink"><Check size={14} /> Approve</button>}{item.status === 'approved' && <button onClick={() => action(item, 'ingest')} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink">Embed & migrate</button>}</div></article>)}</div>
        {jobs.length > 0 && <section className="mt-8"><h2 className="mb-3 font-semibold">Recent jobs</h2>{jobs.map(job => <p key={job.id} className="mb-2 rounded-lg border border-line bg-surface p-3 text-sm">{job.status}: {job.chunks_indexed}/{job.chunks_total}{job.error ? ` — ${job.error}` : ''}</p>)}</section>}
      </div>}
    </main>
  </div>
}
