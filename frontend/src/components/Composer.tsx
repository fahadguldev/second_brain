import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp } from '@phosphor-icons/react'
import { motion } from 'motion/react'

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled: boolean
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

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
            disabled ? 'border-line' : 'border-line focus-within:border-accent/50'
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
            placeholder="Ask a question…"
            aria-label="Ask a question"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted"
          />
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
          enter to send · shift + enter for a new line
        </p>
      </div>
    </div>
  )
}