import { useState } from 'react'
import { CaretDown, FileText } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChatMessage, SourceItem } from '../../types'

function sourceMetadata(item: SourceItem) {
  return item.payload?.metadata ?? item.metadata
}

function sourceLabel(item: SourceItem): string {
  const type = sourceMetadata(item)?.source?.type
  if (!type) return 'record'
  const short = type.replace(/_/g, ' ')
  return short.length > 28 ? short.slice(0, 28) + '…' : short
}

function scorePct(score?: number): string {
  if (typeof score !== 'number') return '—'
  return `${Math.round(score * 100)}%`
}

export function SourceList({
  sources,
}: {
  sources: NonNullable<ChatMessage['info']>['sources']
}) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-3 border-t border-line/60 pt-2.5">
      <motion.button
        type="button"
        onClick={() => setOpen(o => !o)}
        whileHover={{ x: 2 }}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
      >
        <FileText size={12} weight="bold" />
        <span>
          {sources.length} grounded source{sources.length > 1 ? 's' : ''}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="inline-block"
        >
          <CaretDown size={12} weight="bold" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 space-y-1.5 overflow-hidden"
          >
            {sources.map((s, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-2 rounded-lg border border-line/50 bg-raised/50 px-2.5 py-1.5 text-xs text-ink/90 transition-colors hover:border-line"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-surface font-mono text-[9px] font-bold text-muted">
                  {i + 1}
                </span>
                <span className="max-w-[65%] truncate text-[11px] font-medium">
                  {sourceLabel(s)}
                </span>
                <span className="ml-auto shrink-0 rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                  {scorePct(s.score)}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
