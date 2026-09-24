import { Brain } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'

export function BrandMark({ size = 44 }: { size?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { scale: 0.6, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      className="grid shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-soft"
      style={{ width: size, height: size }}
    >
      <Brain size={size * 0.52} weight="duotone" />
    </motion.div>
  )
}

export function BrandBlock() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          Fahad&apos;s archive
        </p>
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">
          Second Brain
        </h1>
      </div>
    </div>
  )
}