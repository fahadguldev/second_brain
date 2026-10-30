import {
  CircleNotch,
  Pause,
  SpeakerHigh,
  WarningCircle,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../types'
import { ThinkingDots } from './ThinkingDots'
import { AudioWaveform } from './ui/AudioWaveform'
import { CopyButton } from './ui/CopyButton'
import { MetaRow } from './chat/MetaRow'
import { SourceList } from './chat/SourceList'
import { VideoRecommendations } from './chat/VideoRecommendations'

export interface MessageBubbleProps {
  msg: ChatMessage
  onPlayVoice?: (messageId: string, text: string) => void
  isPlayingVoice?: boolean
  isVoiceLoading?: boolean
  voiceError?: string | null
}

export function MessageBubble({
  msg,
  onPlayVoice,
  isPlayingVoice = false,
  isVoiceLoading = false,
  voiceError = null,
}: MessageBubbleProps) {
  const reduce = useReducedMotion()
  const isUser = msg.role === 'user'

  if (msg.pending) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 py-2 text-muted"
      >
        <ThinkingDots />
        <span className="font-mono text-xs">Retrieving knowledge…</span>
      </motion.div>
    )
  }

  // User Message
  if (isUser) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="group flex justify-end py-1.5"
      >
        <div className="flex max-w-[85%] items-end gap-2">
          <div className="rounded-2xl rounded-tr-xs border border-white/10 bg-raised px-4 py-2.5 text-[14px] leading-relaxed text-ink shadow-xs sm:text-[15px]">
            <p className="whitespace-pre-wrap">{msg.text}</p>
          </div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={msg.text} title="Copy" />
          </div>
        </div>
      </motion.div>
    )
  }

  // Assistant Message (Clean, calm, uncluttered reading canvas)
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="group flex w-full flex-col py-3"
    >
      {/* Error state */}
      {msg.error && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-danger">
          <WarningCircle size={14} weight="duotone" />
          <span>Error retrieving response</span>
        </div>
      )}

      {/* Main Response Typography */}
      <div className="text-[15px] leading-relaxed text-ink/90 sm:text-[15.5px]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
            em: ({ children }) => <em className="italic text-ink/90">{children}</em>,
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0 text-ink/85">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0 text-ink/85">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed marker:text-muted">{children}</li>,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent-soft transition-colors"
              >
                {children}
              </a>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className
              return isInline ? (
                <code
                  className="rounded bg-raised px-1.5 py-0.5 font-mono text-[13px] text-accent border border-line"
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-[13px] text-ink">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            },
            blockquote: ({ children }) => (
              <blockquote className="my-3 border-l-2 border-accent/40 pl-3 italic text-muted">
                {children}
              </blockquote>
            ),
          }}
        >
          {msg.text}
        </ReactMarkdown>
      </div>

      {/* Embedded Sources & Media */}
      {msg.info?.sources && msg.info.sources.length > 0 && (
        <>
          <VideoRecommendations sources={msg.info.sources} />
          <SourceList sources={msg.info.sources} />
        </>
      )}

      {/* Quiet Bottom Action Bar */}
      <div className="mt-3 flex items-center gap-3 text-muted">
        {onPlayVoice && (
          <button
            type="button"
            onClick={() => onPlayVoice(msg.id, msg.text)}
            disabled={isVoiceLoading}
            title={
              isPlayingVoice
                ? 'Pause audio playback'
                : "Listen to response in creator's voice (ElevenLabs)"
            }
            aria-label={
              isPlayingVoice ? 'Pause voice' : 'Listen to response'
            }
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              isPlayingVoice
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {isVoiceLoading ? (
              <>
                <CircleNotch size={12} className="animate-spin text-accent" />
                <span className="text-[11px]">Synthesizing…</span>
              </>
            ) : isPlayingVoice ? (
              <>
                <Pause size={12} weight="fill" className="text-accent" />
                <span className="text-[11px]">Pause</span>
                <AudioWaveform isPlaying={true} barCount={4} size="sm" />
              </>
            ) : (
              <>
                <SpeakerHigh size={12} weight="bold" />
                <span className="text-[11px]">Listen</span>
              </>
            )}
          </button>
        )}

        <CopyButton text={msg.text} title="Copy response" />

        {msg.info && <MetaRow info={msg.info} />}

        {voiceError && (
          <span className="max-w-[200px] truncate text-[10px] text-danger" title={voiceError}>
            {voiceError}
          </span>
        )}
      </div>
    </motion.div>
  )
}
