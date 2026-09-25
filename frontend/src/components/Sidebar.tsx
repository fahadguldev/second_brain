import {
  CaretRight,
  Database,
  Note,
  Stack,
  Timer,
  Plus,
  ChatCircle,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { BrandBlock } from './BrandMark'
import type { Conversation } from '../types'

const streams = [
  { name: 'tiktok', desc: 'DMs & comments' },
  { name: 'youtube', desc: 'Comment replies' },
  { name: 'linkedin', desc: 'Posts & replies' },
  { name: 'blog', desc: 'Technical notes' },
]

export function Sidebar({
  turnCount,
  onSuggest,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: {
  turnCount: number
  onSuggest: (text: string) => void
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
}) {
  const reduce = useReducedMotion()

  const items = [
    { key: 'records', icon: Database, value: '3,058', label: 'records' },
    { key: 'streams', icon: Stack, value: '4', label: 'streams' },
    { key: 'turns', icon: Timer, value: String(turnCount), label: 'turns' },
  ]

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col border-r border-line bg-bg p-5"
    >
      <BrandBlock />

      <p className="mt-5 text-sm leading-relaxed text-muted">
        Ask across notes, transcriptions, career advice, AWS lessons, and saved
        questions. Answers are grounded in your own archive.
      </p>

      <button
        onClick={onNewConversation}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-ink"
      >
        <Plus size={16} weight="bold" /> New conversation
      </button>

      {conversations.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">History</p>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {conversations.map(conversation => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  activeConversationId === conversation.id ? 'bg-accent/10 text-accent' : 'hover:bg-raised'
                }`}
              >
                <ChatCircle size={14} className="shrink-0" />
                <span className="truncate">{conversation.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2">
        {items.map(item => (
          <div
            key={item.key}
            className="rounded-lg border border-line bg-surface p-3"
          >
            <item.icon size={16} weight="duotone" className="text-accent" />
            <p className="mt-2 font-display text-xl font-bold leading-none tracking-tight">
              {item.value}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Ask through
        </p>
        <ul className="mt-3 space-y-2">
          {streams.map(stream => (
            <li key={stream.name} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-sm font-medium">{stream.name}</span>
              <span className="ml-auto text-xs text-muted">{stream.desc}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Try asking
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {[
            'job krni chaiye ya ms karna chahiye computer science?',
            'python ml ya javascript web development better?',
            'university matters for software engineer?',
          ].map(prompt => (
            <button
              key={prompt}
              onClick={() => onSuggest(prompt)}
              className="group inline-flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-[13px] leading-snug transition-colors hover:border-accent/40 hover:bg-accent/5"
            >
              <CaretRight
                size={14}
                className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-accent"
              />
              <span>{prompt}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-xl border border-line bg-raised/60 p-4">
          <div className="flex items-center gap-2">
            <Note size={16} weight="duotone" className="text-accent" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Working mode
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Grounded answers from your own material, with the source shown for
            every reply.
          </p>
        </div>
      </div>
    </motion.aside>
  )
}
