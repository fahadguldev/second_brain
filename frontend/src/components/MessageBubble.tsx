import { useState } from 'react'
import { CaretDown, FileText, Lightbulb, WarningCircle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import type { ChatMessage } from '../types'
import { ThinkingDots } from './ThinkingDots'

function sourceLabel(item: { metadata?: { source?: { type?: string } } }): string {
  const type = item.metadata?.source?.type
  if (!type) return 'record'
  const short = type.replace(/_/g, ' ')
  return short.length > 24 ? short.slice(0, 24) + '…' : short
}

function scorePct(score?: number): string {
  if (typeof score !== 'number') return '—'
  return `${Math.round(score * 100)}%`
}

function SourceList({ sources }: { sources: NonNullable<ChatMessage['info']>['sources'] }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-line/60 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
      >
        <FileText size={12} />
        {sources.length} grounded source{sources.length > 1 ? 's' : ''}
        <CaretDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {sources.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md bg-raised/60 px-2 py-1.5 text-xs"
            >
              <span className="font-mono text-[10px] text-muted">{i + 1}</span>
              <span className="max-w-[60%] truncate">{sourceLabel(s)}</span>
              <span className="ml-auto shrink-0 rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                {scorePct(s.score)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MetaRow({ info }: { info: NonNullable<ChatMessage['info']> }) {
  const parts: string[] = []
  if (typeof info.latency === 'number') parts.push(`${info.latency.toFixed(1)}s`)
  if (info.model) parts.push(info.model)
  if (info.embeddingModel) parts.push(info.embeddingModel.replace('models/', ''))
  if (parts.length === 0) return null

  return (
    <p className="mt-3 font-mono text-[10px] tracking-tight text-muted">{parts.join(' · ')}</p>
  )
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const reduce = useReducedMotion()
  const isUser = msg.role === 'user'

  if (msg.pending) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end gap-2"
      >
        <div className="pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Lightbulb size={14} weight="duotone" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-soft">
          <ThinkingDots />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''}`}
    >
      {!isUser && (
        <div className="pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
          <Lightbulb size={14} weight="duotone" />
        </div>
      )}

      <div
        className={`max-w-[min(42rem,88%)] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          isUser
            ? 'rounded-br-md bg-accent text-accent-ink'
            : msg.error
              ? 'rounded-bl-md border border-rose-300/40 bg-rose-50/70 text-rose-900 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200'
              : 'rounded-bl-md border border-line bg-surface shadow-soft'
        }`}
      >
        {msg.error && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <WarningCircle size={13} weight="duotone" />
            Error
          </p>
        )}
        <p className="whitespace-pre-wrap">{msg.text}</p>
        {!isUser && !msg.error && (
          <>
            {msg.info?.sources && msg.info.sources.length > 0 && (
              <SourceList sources={msg.info.sources} />
            )}
            {msg.info && <MetaRow info={msg.info} />}
          </>
        )}
      </div>
    </motion.div>
  )
}