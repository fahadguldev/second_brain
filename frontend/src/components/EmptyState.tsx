import { Keyboard } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

const suggestions = [
  'What should I focus on next in my career?',
  'Is university important for software engineers?',
  'Job karni chahiye ya MS karna chahiye?',
  'Python ML ya JavaScript web development?',
]

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const reduce = useReducedMotion()

  return (
    <div className="mx-auto grid w-full max-w-2xl place-items-center py-10">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full text-center"
      >
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface text-accent shadow-soft">
          <Keyboard size={26} weight="duotone" />
        </div>
        <h1 className="text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Start with a messy question.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          The app searches the shape of Fahad&apos;s knowledge and returns an
          answer you can keep pushing on.
        </p>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex w-full flex-col gap-2"
      >
        {suggestions.map((s, i) => (
          <motion.button
            key={s}
            onClick={() => onPick(s)}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.18 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/10 font-mono text-[11px] font-bold text-accent">
              {i + 1}
            </span>
            {s}
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}