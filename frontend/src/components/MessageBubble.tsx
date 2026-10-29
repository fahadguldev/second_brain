import {
  CircleNotch,
  Lightbulb,
  Pause,
  SpeakerHigh,
  WarningCircle,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
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
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-2.5"
      >
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent shadow-xs">
          <Lightbulb size={14} weight="duotone" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line/70 bg-surface/90 px-4 py-3 shadow-soft backdrop-blur-sm">
          <ThinkingDots />
          <span className="font-mono text-xs text-muted">Retrieving from memory…</span>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex items-start gap-2.5 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent shadow-xs">
          <Lightbulb size={14} weight="duotone" />
        </div>
      )}

      {/* Message Card Container */}
      <div
        className={`relative max-w-[min(44rem,88%)] rounded-2xl px-4 py-3 text-[14px] leading-relaxed transition-all sm:text-[15px] ${
          isUser
            ? 'rounded-tr-sm bg-accent text-accent-ink shadow-soft'
            : msg.error
            ? 'rounded-tl-sm border border-danger/30 bg-danger-soft text-danger'
            : 'rounded-tl-sm border border-line/70 bg-surface/90 text-ink shadow-soft backdrop-blur-sm'
        }`}
      >
        {/* Error Flag */}
        {msg.error && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            <WarningCircle size={14} weight="duotone" />
            <span>Error occurred</span>
          </p>
        )}

        {/* Message Text Content */}
        <p className="whitespace-pre-wrap">{msg.text}</p>

        {/* Assistant Rich Metadata and Sources */}
        {!isUser && !msg.error && (
          <>
            {msg.info?.sources && msg.info.sources.length > 0 && (
              <>
                <VideoRecommendations sources={msg.info.sources} />
                <SourceList sources={msg.info.sources} />
              </>
            )}

            {msg.info && <MetaRow info={msg.info} />}

            {/* Bottom Actions Bar (Voice Playback & Copy) */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5">
              <div className="flex items-center gap-2">
                {/* JSF Labs Voice Playback Trigger with Animated Waveform */}
                {onPlayVoice && (
                  <motion.button
                    type="button"
                    onClick={() => onPlayVoice(msg.id, msg.text)}
                    disabled={isVoiceLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    aria-label={
                      isPlayingVoice
                        ? 'Pause voice response'
                        : 'Play voice response with JSF Labs'
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      isPlayingVoice
                        ? 'border-accent bg-accent/15 text-accent shadow-xs'
                        : isVoiceLoading
                        ? 'cursor-wait border-accent/40 bg-accent/5 text-accent opacity-90'
                        : 'border-line/70 bg-raised/50 text-muted hover:border-accent/40 hover:text-accent'
                    }`}
                  >
                    {isVoiceLoading ? (
                      <>
                        <CircleNotch size={12} className="animate-spin text-accent" />
                        <span>Generating voice…</span>
                      </>
                    ) : isPlayingVoice ? (
                      <>
                        <Pause size={12} weight="fill" className="text-accent" />
                        <span>Pause</span>
                        <AudioWaveform isPlaying={true} barCount={4} size="sm" />
                      </>
                    ) : (
                      <>
                        <SpeakerHigh size={13} weight="bold" />
                        <span>Listen</span>
                      </>
                    )}
                  </motion.button>
                )}

                {voiceError && (
                  <span
                    className="max-w-[200px] truncate text-[10px] text-danger"
                    title={voiceError}
                  >
                    {voiceError}
                  </span>
                )}
              </div>

              {/* Copy Message Action */}
              <CopyButton text={msg.text} title="Copy response" />
            </div>
          </>
        )}

        {/* Copy for user message */}
        {isUser && (
          <div className="mt-1.5 flex justify-end">
            <CopyButton
              text={msg.text}
              title="Copy your message"
              className="border-accent-ink/20 bg-accent-ink/10 text-accent-ink hover:border-accent-ink/40 hover:text-accent-ink"
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}
