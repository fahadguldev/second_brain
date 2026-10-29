import { ArrowRight, Sparkle } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

const starterQuestions = [
  'Job karni chahiye ya MS computer science?',
  'Python ML ya JavaScript web development?',
  'Does a university degree really matter for software engineers?',
  'What are the most common AWS production mistakes to avoid?',
]

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const reduce = useReducedMotion()

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center py-12 sm:py-20">
      {/* Framer Ambient Electric Aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 h-72 w-72 rounded-full bg-accent/12 blur-[100px]"
      />

      {/* Hero Badge & Heading */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 text-center"
      >
        <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-raised/80 px-3 py-1 text-[11px] font-medium text-muted backdrop-blur-md">
          <Sparkle size={12} weight="fill" className="text-accent" />
          <span>Fahad Gul Archive</span>
        </div>

        <h1 className="text-balance font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          What would you like to know?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          Ask anything across career growth, tech stack decisions, cloud architecture, and startup lessons.
        </p>
      </motion.div>

      {/* Suggestion Cards */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mt-10 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {starterQuestions.map((question, i) => (
          <motion.button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: 0.1 + i * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface/60 p-4 text-left shadow-xs backdrop-blur-md transition-all hover:border-white/20 hover:bg-surface hover:shadow-soft"
          >
            <span className="text-[13px] font-medium leading-snug text-ink/90 group-hover:text-ink">
              {question}
            </span>
            <ArrowRight
              size={14}
              className="shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent"
            />
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
