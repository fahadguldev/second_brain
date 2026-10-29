import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  ArrowUp,
  Microphone,
  Sparkle,
} from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { AudioWaveform } from './ui/AudioWaveform'
import { KeyboardBadge } from './ui/KeyboardBadge'

export interface ComposerProps {
  onSend: (text: string) => void
  disabled: boolean
}

const quickChips = [
  'Summarize key takeaway',
  'Career advice perspective',
  'Pros & cons breakdown',
]

export function Composer({ onSend, disabled }: ComposerProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const handleTranscript = useCallback((transcript: string) => {
    setValue(prev => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : ''
      return `${prev}${separator}${transcript}`.trimStart()
    })
  }, [])

  const { isListening, isSupported, toggleListening } = useVoiceInput({
    onTranscript: handleTranscript,
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    ref.current?.focus()
  }

  const handleChipClick = (chip: string) => {
    if (disabled) return
    setValue(prev => (prev ? `${prev} · ${chip}` : chip))
    ref.current?.focus()
  }

  const hasText = Boolean(value.trim())

  return (
    <div className="relative border-t border-line/70 bg-bg/85 px-4 pb-4 pt-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Quick Suggestion Chips (subtle Framer pill bar) */}
        {!hasText && !disabled && (
          <div className="mb-2 hidden items-center gap-1.5 sm:flex">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Sparkle size={11} weight="fill" className="text-accent" />
              <span>Angle:</span>
            </span>
            {quickChips.map(chip => (
              <motion.button
                key={chip}
                type="button"
                onClick={() => handleChipClick(chip)}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className="rounded-full border border-line/60 bg-surface/70 px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
              >
                {chip}
              </motion.button>
            ))}
          </div>
        )}

        {/* Composer Card Container */}
        <div
          className={`relative flex items-end gap-2 rounded-2xl border bg-surface/90 p-2 shadow-soft backdrop-blur-md transition-all ${
            isListening
              ? 'border-accent ring-2 ring-accent/25'
              : disabled
              ? 'border-line/60 opacity-70'
              : 'border-line/70 hover:border-line-strong focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15'
          }`}
        >
          {/* Text Input Area */}
          <textarea
            ref={ref}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder={
              isListening
                ? 'Listening… speak clearly into your microphone'
                : 'Ask Fahad anything from his archive…'
            }
            aria-label="Ask a question"
            disabled={disabled}
            className="max-h-44 min-h-[42px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/60 sm:text-[15px]"
          />

          {/* Voice Input Microphone Button */}
          {isSupported && (
            <div className="relative">
              {isListening && (
                <span className="pointer-events-none absolute -inset-1.5 animate-ping rounded-2xl bg-danger/25" />
              )}
              <motion.button
                type="button"
                onClick={toggleListening}
                disabled={disabled}
                whileHover={!disabled ? { scale: 1.05 } : undefined}
                whileTap={!disabled ? { scale: 0.92 } : undefined}
                aria-label={
                  isListening ? 'Stop voice input' : 'Start voice input'
                }
                title={isListening ? 'Stop recording' : 'Speak question'}
                className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all ${
                  isListening
                    ? 'bg-danger text-white shadow-lift'
                    : 'bg-raised/70 text-muted hover:bg-accent/15 hover:text-accent'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {isListening ? (
                  <AudioWaveform
                    isPlaying={true}
                    barCount={3}
                    size="sm"
                    color="bg-white"
                  />
                ) : (
                  <Microphone size={18} weight="bold" />
                )}
              </motion.button>
            </div>
          )}

          {/* Send Button */}
          <motion.button
            type="button"
            onClick={submit}
            disabled={disabled || !hasText}
            whileHover={!disabled && hasText ? { scale: 1.05 } : undefined}
            whileTap={!disabled && hasText ? { scale: 0.92 } : undefined}
            aria-label="Send question"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-sm transition-all hover:bg-accent/95 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ArrowUp size={18} weight="bold" />
          </motion.button>
        </div>

        {/* Helper Footer with Styled Shortcuts */}
        <div className="mt-2 flex items-center justify-center gap-3 text-center font-mono text-[11px] text-muted">
          {isListening ? (
            <span className="flex items-center gap-1.5 text-danger font-semibold">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-danger" />
              <span>Voice recording active · speak now</span>
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <KeyboardBadge keys={['↵ Enter']} />
                <span>to send</span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <KeyboardBadge keys={['⇧ Shift', '↵ Enter']} />
                <span>for new line</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
