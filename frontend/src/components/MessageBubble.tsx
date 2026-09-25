import { useEffect, useMemo, useState } from 'react'
import { CaretDown, FileText, Lightbulb, Play, WarningCircle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import type { ChatMessage, SourceItem } from '../types'
import { ThinkingDots } from './ThinkingDots'

function sourceMetadata(item: SourceItem) {
  return item.payload?.metadata ?? item.metadata
}

function sourceLabel(item: SourceItem): string {
  const type = sourceMetadata(item)?.source?.type
  if (!type) return 'record'
  const short = type.replace(/_/g, ' ')
  return short.length > 24 ? short.slice(0, 24) + '…' : short
}

function scorePct(score?: number): string {
  if (typeof score !== 'number') return '—'
  return `${Math.round(score * 100)}%`
}

interface VideoPreview {
  url: string
  title: string
  thumbnail: string
}

function VideoRecommendations({ sources }: { sources: SourceItem[] }) {
  const videoUrls = useMemo(
    () => Array.from(new Set(
      sources
        .map(source => sourceMetadata(source)?.source?.url)
        .filter((url): url is string => Boolean(url)),
    )),
    [sources],
  )
  const [videos, setVideos] = useState<VideoPreview[]>([])

  useEffect(() => {
    let cancelled = false

    Promise.all(
      videoUrls.slice(0, 3).map(async url => {
        if (!url.includes('tiktok.com/')) return null
        try {
          const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
          if (!response.ok) return null
          const data = await response.json()
          if (!data.thumbnail_url) return null
          return {
            url,
            title: data.title || 'Watch the related video',
            thumbnail: data.thumbnail_url,
          } satisfies VideoPreview
        } catch {
          return null
        }
      }),
    ).then(results => {
      if (!cancelled) {
        setVideos(results.filter((video): video is VideoPreview => video !== null))
      }
    })

    return () => {
      cancelled = true
    }
  }, [videoUrls])

  if (videos.length === 0) return null

  return (
    <section className="mt-4 border-t border-line/60 pt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        For more details you can watch this video
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {videos.map(video => (
          <a
            key={video.url}
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="group overflow-hidden rounded-lg border border-line bg-raised/50 transition-colors hover:border-accent/50"
          >
            <div className="relative aspect-video max-h-40 overflow-hidden bg-raised">
              <img
                src={video.thumbnail}
                alt="Related video thumbnail"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/20">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white shadow-lg">
                  <Play size={18} weight="fill" />
                </span>
              </span>
            </div>
            <p className="line-clamp-2 px-3 py-2 text-xs font-medium leading-relaxed">
              {video.title}
            </p>
          </a>
        ))}
      </div>
    </section>
  )
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
              <>
                <VideoRecommendations sources={msg.info.sources} />
                <SourceList sources={msg.info.sources} />
              </>
            )}
            {msg.info && <MetaRow info={msg.info} />}
          </>
        )}
      </div>
    </motion.div>
  )
}
