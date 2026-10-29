import {
  Command,
  List,
  MoonStars,
  PhoneCall,
  Sun,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { KeyboardBadge } from './ui/KeyboardBadge'

export interface HeaderProps {
  isThinking: boolean
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onMenu?: () => void
  onStartCall?: () => void
  onFocusSearch?: () => void
}

export function Header({
  isThinking,
  theme,
  onToggleTheme,
  onMenu,
  onStartCall,
  onFocusSearch,
}: HeaderProps) {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  return (
    <header className="sticky top-0 z-20 flex h-[64px] shrink-0 items-center justify-between border-b border-line/70 bg-bg/85 px-4 backdrop-blur-md sm:px-6">
      {/* Left: Mobile menu & Brand info */}
      <div className="flex min-w-0 items-center gap-3">
        {onMenu && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onMenu}
            aria-label="Open navigation drawer"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink lg:hidden"
          >
            <List size={17} weight="bold" />
          </motion.button>
        )}
        <div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
              Fahad&apos;s Knowledge Console
            </p>
          </div>
          <h2 className="font-display text-base font-bold leading-tight tracking-tight sm:text-lg">
            Second Brain
          </h2>
        </div>
      </div>

      {/* Right: Actions, Voice Call, Shortcut & Theme Switcher */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Quick Search Shortcut Pill */}
        {onFocusSearch && (
          <motion.button
            type="button"
            onClick={onFocusSearch}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            aria-label="Focus search or prompt"
            title="Focus input"
            className="hidden items-center gap-2 rounded-lg border border-line/70 bg-surface/80 px-2.5 py-1.5 text-xs text-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-ink md:inline-flex"
          >
            <Command size={13} weight="bold" />
            <span className="text-[11px] font-medium">Ask</span>
            <KeyboardBadge keys={[isMac ? '⌘' : 'Ctrl', 'K']} />
          </motion.button>
        )}

        {/* 1-on-1 Voice Call Button */}
        {onStartCall && (
          <motion.button
            type="button"
            onClick={onStartCall}
            whileHover={{ scale: 1.03, y: -0.5 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Start 1-on-1 voice call"
            className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent shadow-sm transition-all hover:border-accent hover:bg-accent/20 hover:shadow-soft"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <PhoneCall
              size={13}
              weight="fill"
              className="text-accent transition-transform group-hover:scale-110"
            />
            <span className="font-medium">Call Fahad</span>
          </motion.button>
        )}

        {/* Status Pill */}
        <span
          className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex ${
            isThinking
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-line/70 bg-surface/80 text-muted'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${
                isThinking ? 'animate-ping bg-accent opacity-75' : 'bg-transparent'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isThinking ? 'bg-accent' : 'bg-ok'
              }`}
            />
          </span>
          {isThinking ? (
            <span className="flex items-center gap-1 font-mono text-[11px]">
              Searching archive…
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted">Ready</span>
          )}
        </span>

        {/* Theme Switcher with 3D spring rotate */}
        <motion.button
          onClick={onToggleTheme}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.92 }}
          aria-label={
            theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          }
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -50, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 50, opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="grid place-items-center"
            >
              {theme === 'dark' ? (
                <Sun size={16} weight="bold" className="text-amber-400" />
              ) : (
                <MoonStars size={16} weight="bold" className="text-slate-700" />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </header>
  )
}
