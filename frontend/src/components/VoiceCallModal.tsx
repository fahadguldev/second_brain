import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  CircleNotch,
  Keyboard,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  Sparkle,
  Waveform,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { CallState } from '../hooks/useVoiceCall'

interface VoiceCallModalProps {
  isOpen: boolean
  callState: CallState
  duration: number
  isMuted: boolean
  currentTranscript: string
  lastAIResponse: string
  error: string | null
  onEndCall: () => void
  onToggleMute: () => void
  onInterrupt: () => void
  onSendTextMessage: (text: string) => void
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function VoiceCallModal({
  isOpen,
  callState,
  duration,
  isMuted,
  currentTranscript,
  lastAIResponse,
  error,
  onEndCall,
  onToggleMute,
  onInterrupt,
  onSendTextMessage,
}: VoiceCallModalProps) {
  const [showSubtitles, setShowSubtitles] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input automatically when chat is opened
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [isChatOpen])

  // Keyboard navigation: Escape closes chat or ends call, Space toggles mute when not in input
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement).tagName
      if (e.key === 'Escape') {
        if (isChatOpen) {
          setIsChatOpen(false)
        } else {
          onEndCall()
        }
      } else if (e.code === 'Space' && targetTag !== 'TEXTAREA' && targetTag !== 'INPUT') {
        e.preventDefault()
        onToggleMute()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, isChatOpen, onEndCall, onToggleMute])

  if (!isOpen) return null

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return
    onSendTextMessage(trimmed)
    setInputText('')
  }

  const getStatusLabel = () => {
    switch (callState) {
      case 'connecting':
        return 'Connecting to Fahad…'
      case 'listening':
        return isMuted ? 'Microphone muted' : 'Listening to you…'
      case 'processing':
        return 'Fahad is thinking…'
      case 'speaking':
        return 'Fahad is speaking…'
    }
  }

  const getStatusColor = () => {
    switch (callState) {
      case 'connecting':
        return 'text-muted border-line'
      case 'listening':
        return isMuted ? 'text-danger border-danger/40' : 'text-accent border-accent/40'
      case 'processing':
        return 'text-amber-400 border-amber-400/40'
      case 'speaking':
        return 'text-emerald-400 border-emerald-400/40'
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col justify-between bg-black/90 p-6 backdrop-blur-2xl sm:p-10 text-white select-none"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 shadow-soft">
              <Sparkle size={20} weight="fill" className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Fahad Gul</h2>
              <p className="text-[11px] font-mono tracking-tight text-white/50">
                Live 1-on-1 Voice Call
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Call duration timer */}
            <span className="font-mono text-xs font-semibold tracking-wider text-white/70">
              {formatDuration(duration)}
            </span>

            {/* Subtitles toggle */}
            <button
              type="button"
              onClick={() => setShowSubtitles(prev => !prev)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                showSubtitles
                  ? 'border-white/30 bg-white/10 text-white'
                  : 'border-white/10 text-white/40 hover:text-white'
              }`}
            >
              Captions
            </button>

            {/* Quick exit */}
            <button
              type="button"
              onClick={onEndCall}
              aria-label="Close call"
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Center Orb & Visualizer */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="relative flex h-64 w-64 items-center justify-center sm:h-80 sm:w-80">
            {/* Outer pulsating concentric aura rings */}
            <motion.div
              animate={{
                scale:
                  callState === 'speaking'
                    ? [1, 1.25, 1.05]
                    : callState === 'listening' && !isMuted
                    ? [1, 1.15, 1]
                    : 1,
                opacity:
                  callState === 'speaking'
                    ? [0.3, 0.7, 0.3]
                    : callState === 'listening' && !isMuted
                    ? [0.2, 0.5, 0.2]
                    : 0.1,
              }}
              transition={{
                repeat: Infinity,
                duration: callState === 'speaking' ? 1.6 : 2.5,
                ease: 'easeInOut',
              }}
              className={`absolute inset-0 rounded-full blur-2xl ${
                callState === 'speaking'
                  ? 'bg-emerald-500/30'
                  : callState === 'processing'
                  ? 'bg-amber-500/25'
                  : isMuted
                  ? 'bg-danger/20'
                  : 'bg-accent/25'
              }`}
            />

            {/* Middle glowing ripple ring */}
            <motion.div
              animate={{
                scale: callState === 'speaking' ? [1, 1.12, 1] : [1, 1.05, 1],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className={`absolute inset-4 rounded-full border border-white/20 shadow-lift ${
                callState === 'speaking'
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : callState === 'processing'
                  ? 'border-amber-400/40 bg-amber-500/10'
                  : 'border-accent/40 bg-accent/10'
              }`}
            />

            {/* Core Interactive Center Avatar / Orb */}
            <motion.div
              whileHover={{ scale: 1.03 }}
              className="relative grid h-36 w-36 place-items-center rounded-full border border-white/30 bg-white/10 shadow-2xl backdrop-blur-md sm:h-44 sm:w-44"
            >
              {callState === 'processing' ? (
                <CircleNotch size={48} className="animate-spin text-amber-400" />
              ) : callState === 'speaking' ? (
                <Waveform size={52} weight="fill" className="text-emerald-400 animate-pulse" />
              ) : isMuted ? (
                <MicrophoneSlash size={44} weight="fill" className="text-danger" />
              ) : (
                <Waveform size={48} weight="duotone" className="text-accent" />
              )}
            </motion.div>
          </div>

          {/* Status Badge */}
          <div
            className={`mt-6 inline-flex items-center gap-2 rounded-full border bg-white/5 px-4 py-1.5 text-xs font-semibold backdrop-blur-sm ${getStatusColor()}`}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            <span>{getStatusLabel()}</span>
          </div>

          {/* Error notice if any */}
          {error && (
            <p className="mt-3 text-center text-xs font-medium text-danger">
              {error}
            </p>
          )}

          {/* Real-time Subtitles / Captions */}
          {showSubtitles && (
            <div className="mt-8 min-h-[64px] max-w-xl px-4 text-center">
              {callState === 'speaking' && lastAIResponse ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm font-medium leading-relaxed text-white/90 line-clamp-3"
                >
                  <span className="text-emerald-400 font-semibold mr-1.5">Fahad:</span>
                  {lastAIResponse}
                </motion.p>
              ) : currentTranscript ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm font-medium leading-relaxed text-white/90 line-clamp-2"
                >
                  <span className="text-accent font-semibold mr-1.5">You:</span>
                  {currentTranscript}
                </motion.p>
              ) : (
                <p className="text-xs font-mono text-white/40">
                  {callState === 'listening' ? 'Speak clearly into your microphone or tap the keyboard below to type…' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Bottom Section: Chat Input Drawer + Call Controls */}
        <div className="mx-auto w-full max-w-lg">
          {/* Expandable In-Call Chat Composer (Bypasses STT) */}
          <AnimatePresence>
            {isChatOpen && (
              <motion.form
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                onSubmit={handleSendMessage}
                className="mb-3 flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur-xl"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Type a message (skips speech-to-text)..."
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-white/40 outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  aria-label="Send message"
                  className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40 hover:bg-accent/90"
                >
                  <ArrowUp size={18} weight="bold" />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Bottom Call Controls Dock */}
          <div className="flex items-center justify-around rounded-3xl border border-white/15 bg-white/10 p-3 shadow-lift backdrop-blur-xl">
            {/* Mute Toggle Button */}
            <motion.button
              type="button"
              onClick={onToggleMute}
              whileTap={{ scale: 0.92 }}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={isMuted ? 'Unmute microphone (Space)' : 'Mute microphone (Space)'}
              className={`grid h-12 w-12 place-items-center rounded-2xl transition-all ${
                isMuted
                  ? 'bg-danger text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicrophoneSlash size={22} weight="fill" /> : <Microphone size={22} weight="bold" />}
            </motion.button>

            {/* In-Call Keyboard / Chat Toggle */}
            <motion.button
              type="button"
              onClick={() => setIsChatOpen(prev => !prev)}
              whileTap={{ scale: 0.92 }}
              aria-label="Toggle text chat"
              title={isChatOpen ? 'Close text input' : 'Type message instead of speaking'}
              className={`grid h-12 w-12 place-items-center rounded-2xl transition-all ${
                isChatOpen
                  ? 'bg-accent text-white shadow-soft'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Keyboard size={22} weight={isChatOpen ? 'fill' : 'bold'} />
            </motion.button>

            {/* Interrupt / Cut-in Button */}
            <motion.button
              type="button"
              onClick={onInterrupt}
              disabled={callState !== 'speaking'}
              whileTap={{ scale: 0.92 }}
              aria-label="Interrupt Fahad"
              title="Interrupt Fahad and speak"
              className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Waveform size={22} weight="bold" />
            </motion.button>

            {/* End Call Button */}
            <motion.button
              type="button"
              onClick={onEndCall}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              aria-label="End voice call"
              title="End Call (Esc)"
              className="grid h-14 w-14 place-items-center rounded-full bg-danger text-white shadow-2xl transition-transform hover:bg-red-600"
            >
              <PhoneDisconnect size={24} weight="fill" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
