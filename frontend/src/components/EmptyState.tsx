import {
  ArrowUpRight,
  Brain,
  Code,
  GraduationCap,
  Sparkle,
  TrendUp,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { KeyboardBadge } from './ui/KeyboardBadge'

interface SuggestionItem {
  prompt: string
  category: string
  icon: typeof Brain
}

const suggestions: SuggestionItem[] = [
  {
    prompt: 'Job karni chahiye ya MS karna chahiye computer science?',
    category: 'Career & Growth',
    icon: TrendUp,
  },
  {
    prompt: 'Python ML ya JavaScript web development — which is better to start?',
    category: 'Tech Stack Decisions',
    icon: Code,
  },
  {
    prompt: 'Does university degree really matter for software engineers?',
    category: 'Education & Paths',
    icon: GraduationCap,
  },
  {
    prompt: 'What are the most common AWS production mistakes to avoid?',
    category: 'Cloud & Infrastructure',
    icon: Sparkle,
  },
]

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const reduce = useReducedMotion()
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center py-8 sm:py-14">
      {/* Framer-style Ambient Background Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 h-64 w-64 rounded-full bg-accent/15 blur-3xl"
      />

      {/* Hero Badge and Heading */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full text-center"
      >
        <motion.div
          whileHover={{ scale: 1.05, rotate: 3 }}
          transition={{ type: 'spring', stiffness: 350, damping: 20 }}
          className="mx-auto mb-4 grid h-13 w-13 place-items-center rounded-2xl border border-line/80 bg-surface/80 text-accent shadow-soft backdrop-blur-md"
        >
          <Brain size={28} weight="duotone" />
        </motion.div>

        <h1 className="text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Start with a messy question.
        </h1>
        <p className="mx-auto mt-2.5 max-w-md text-[14px] leading-relaxed text-muted">
          Search the shape of Fahad&apos;s real-world archive — notes, audio
          transcripts, career insights, and architecture lessons.
        </p>
      </motion.div>

      {/* Suggestion Cards Grid with Framer Springs */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {suggestions.map((item, i) => {
          const Icon = item.icon
          return (
            <motion.button
              key={item.prompt}
              type="button"
              onClick={() => onPick(item.prompt)}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.12 + i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/70 bg-surface/80 p-4 text-left shadow-xs backdrop-blur-sm transition-all hover:border-accent/50 hover:bg-surface hover:shadow-soft"
            >
              {/* Category chip & arrow */}
              <div className="flex items-center justify-between text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-raised/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted group-hover:text-accent">
                  <Icon size={12} weight="bold" />
                  <span>{item.category}</span>
                </span>
                <ArrowUpRight
                  size={15}
                  weight="bold"
                  className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
                />
              </div>

              {/* Prompt Text */}
              <p className="mt-3 text-[13px] font-medium leading-snug text-ink/90 group-hover:text-accent">
                {item.prompt}
              </p>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Keyboard Hint Pill */}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="mt-6 flex items-center gap-2 text-[11px] text-muted"
      >
        <span>Tip: Press</span>
        <KeyboardBadge keys={[isMac ? '⌘' : 'Ctrl', 'K']} />
        <span>to jump straight to composer</span>
      </motion.div>
    </div>
  )
}
