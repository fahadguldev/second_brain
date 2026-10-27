import { useLayoutEffect, useRef, useState, useCallback } from 'react'
import { ArrowUp, Microphone } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useVoiceInput } from '../hooks/useVoiceInput'

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled: boolean
}) {
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
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    ref.current?.focus()
  }

  return (
    <div className="border-t border-line bg-bg px-4 pb-4 pt-3 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div
          className={`flex items-end gap-2 rounded-2xl border bg-surface p-2 shadow-soft transition-colors ${
            isListening
              ? 'border-accent ring-2 ring-accent/20'
              : disabled
              ? 'border-line'
              : 'border-line focus-within:border-accent/50'
          }`}
        >
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
              isListening ? 'Listening… speak your question' : 'Ask a question…'
            }
            aria-label="Ask a question"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted"
          />

          {isSupported && (
            <motion.button
              type="button"
              onClick={toggleListening}
              disabled={disabled}
              whileTap={!disabled ? { scale: 0.92 } : undefined}
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              title={isListening ? 'Stop recording' : 'Speak your question'}
              className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all ${
                isListening
                  ? 'bg-danger text-white shadow-lift'
                  : 'bg-raised/70 text-muted hover:bg-accent/15 hover:text-accent'
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {isListening && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-danger"></span>
                </span>
              )}
              <Microphone size={18} weight={isListening ? 'fill' : 'bold'} />
            </motion.button>
          )}

          <motion.button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            whileTap={!disabled ? { scale: 0.92 } : undefined}
            aria-label="Send message"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp size={18} weight="bold" />
          </motion.button>
        </div>
        <p className="mt-2 text-center font-mono text-[10px] tracking-tight text-muted">
          {isListening
            ? 'voice input active · speak clearly into your microphone'
            : 'enter to send · shift + enter for a new line'}
        </p>
      </div>
    </div>
  )
}
