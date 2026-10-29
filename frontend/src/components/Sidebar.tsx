import { useState, useMemo } from 'react'
import {
  CaretRight,
  ChatCircle,
  MagnifyingGlass,
  Note,
  Plus,
  Timer,
  X,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { BrandBlock } from './BrandMark'
import type { Conversation } from '../types'

const streams = [
  { name: 'tiktok', desc: 'DMs & comments', color: 'bg-accent' },
  { name: 'youtube', desc: 'Comment replies', color: 'bg-red-500' },
  { name: 'linkedin', desc: 'Posts & replies', color: 'bg-blue-500' },
  { name: 'blog', desc: 'Technical notes', color: 'bg-emerald-500' },
]

export interface SidebarProps {
  turnCount: number
  onSuggest: (text: string) => void
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
}

export function Sidebar({
  turnCount,
  onSuggest,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: SidebarProps) {
  const reduce = useReducedMotion()
  const [filterQuery, setFilterQuery] = useState('')

  const filteredConversations = useMemo(() => {
    if (!filterQuery.trim()) return conversations
    const q = filterQuery.toLowerCase()
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, filterQuery])

  const stats = [
    {
      key: 'chats',
      icon: ChatCircle,
      value: String(conversations.length),
      label: 'chats',
    },
    {
      key: 'turns',
      icon: Timer,
      value: String(turnCount),
      label: 'turns',
    },
  ]

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col border-r border-line/70 bg-bg/95 p-5 backdrop-blur-md"
    >
      {/* Brand Identity */}
      <BrandBlock />

      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        Ask across notes, transcriptions, career advice, AWS lessons, and saved
        questions. Answers are grounded in your archive.
      </p>

      {/* New Conversation Button */}
      <motion.button
        type="button"
        onClick={onNewConversation}
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-ink shadow-soft transition-all hover:bg-accent/95 hover:shadow-lift"
      >
        <Plus size={16} weight="bold" />
        <span>New conversation</span>
      </motion.button>

      {/* Conversation History with Filter */}
      {conversations.length > 0 && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              History
            </p>
            <span className="font-mono text-[10px] text-muted">
              {filteredConversations.length} of {conversations.length}
            </span>
          </div>

          {/* Quick Filter Search Box */}
          {conversations.length > 3 && (
            <div className="relative mt-2">
              <MagnifyingGlass
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                placeholder="Filter history…"
                className="w-full rounded-lg border border-line bg-surface/70 py-1.5 pl-7 pr-7 text-xs text-ink placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>
          )}

          {/* List with Animated Active Highlight Pill */}
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredConversations.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted">
                No matching conversations
              </p>
            ) : (
              filteredConversations.map(conversation => {
                const isActive = activeConversationId === conversation.id
                return (
                  <motion.button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    whileHover={{ x: 2 }}
                    className={`relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      isActive
                        ? 'font-semibold text-accent'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeConversationIndicator"
                        className="absolute inset-0 rounded-lg border border-accent/30 bg-accent/10"
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    <ChatCircle
                      size={14}
                      weight={isActive ? 'fill' : 'regular'}
                      className="relative z-10 shrink-0"
                    />
                    <span className="relative z-10 truncate">
                      {conversation.title}
                    </span>
                  </motion.button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {stats.map(item => (
          <motion.div
            key={item.key}
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="rounded-xl border border-line/70 bg-surface/70 p-3 shadow-xs"
          >
            <item.icon size={16} weight="duotone" className="text-accent" />
            <p className="mt-1.5 font-display text-lg font-bold leading-none tracking-tight">
              {item.value}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {item.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Ask Through Knowledge Streams */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Ask through
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {streams.map(stream => (
            <li
              key={stream.name}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-raised/40"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${stream.color}`} />
              <span className="font-medium capitalize">{stream.name}</span>
              <span className="ml-auto text-[11px] text-muted">
                {stream.desc}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Try Asking Quick Starters */}
      <div className="mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Try asking
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {[
            'Job karni chahiye ya MS karna chahiye?',
            'Python ML ya JavaScript web dev?',
            'University matters for software engineer?',
          ].map(prompt => (
            <motion.button
              key={prompt}
              type="button"
              onClick={() => onSuggest(prompt)}
              whileHover={{ x: 3 }}
              whileTap={{ scale: 0.98 }}
              className="group inline-flex items-start gap-2 rounded-xl border border-line/70 bg-surface/60 px-2.5 py-2 text-left text-xs leading-snug transition-all hover:border-accent/40 hover:bg-accent/5"
            >
              <CaretRight
                size={13}
                className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-accent"
              />
              <span className="line-clamp-2 text-ink/90 group-hover:text-accent">
                {prompt}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Grounded Archive Mode Footer Card */}
      <div className="mt-auto pt-4">
        <div className="rounded-xl border border-line/70 bg-raised/40 p-3">
          <div className="flex items-center gap-1.5">
            <Note size={14} weight="duotone" className="text-accent" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Grounded mode
            </p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Directly cited answers from Fahad&apos;s personal knowledge base.
          </p>
        </div>
      </div>
    </motion.aside>
  )
}
