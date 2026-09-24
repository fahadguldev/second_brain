import { MoonStars, Sun } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'

export function Header({
  isThinking,
  theme,
  onToggleTheme,
}: {
  isThinking: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          Knowledge console
        </p>
        <h2 className="font-display text-lg font-bold leading-tight tracking-tight">
          Second Brain
        </h2>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            isThinking
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line bg-surface text-muted'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                isThinking ? 'animate-ping bg-accent' : 'bg-accent/0'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isThinking ? 'bg-accent' : 'bg-muted'
              }`}
            />
          </span>
          {isThinking ? 'Searching archive' : 'Ready'}
        </span>

        <button
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -40, opacity: 0, scale: 0.5 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 40, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
              className="grid place-items-center"
            >
              {theme === 'dark' ? <Sun size={16} weight="bold" /> : <MoonStars size={16} weight="bold" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </header>
  )
}