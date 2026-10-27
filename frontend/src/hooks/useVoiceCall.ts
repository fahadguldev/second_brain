import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type CallState = 'connecting' | 'listening' | 'processing' | 'speaking'

interface IWindow extends Window {
  webkitSpeechRecognition?: any
  SpeechRecognition?: any
}

interface UseVoiceCallProps {
  onSendMessage: (text: string) => Promise<string | null>
  isThinking: boolean
}

export function useVoiceCall({ onSendMessage, isThinking }: UseVoiceCallProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [callState, setCallState] = useState<CallState>('connecting')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastAIResponse, setLastAIResponse] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silenceTimeoutRef = useRef<any>(null)
  const timerIntervalRef = useRef<any>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)

  const isCallActiveRef = useRef(false)
  const isMutedRef = useRef(false)
  const callStateRef = useRef<CallState>('connecting')

  useEffect(() => {
    isCallActiveRef.current = isCallActive
  }, [isCallActive])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    callStateRef.current = callState
  }, [callState])

  // Call duration timer
  useEffect(() => {
    if (isCallActive) {
      setDuration(0)
      timerIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [isCallActive])

  const stopActiveAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
  }, [])

  const playAIResponse = useCallback(
    async (text: string) => {
      if (!isCallActiveRef.current) return
      setCallState('speaking')
      setLastAIResponse(text)

      try {
        const res = await fetch(`${API_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })

        if (!res.ok) {
          let detail = 'Voice playback failed'
          try {
            const errJson = await res.json()
            detail = errJson.detail || detail
          } catch {
            // ignore
          }
          throw new Error(detail)
        }

        const blob = await res.blob()
        if (!isCallActiveRef.current || callStateRef.current !== 'speaking') {
          return // User interrupted while TTS was downloading
        }

        const objectUrl = URL.createObjectURL(blob)
        const audio = new Audio(objectUrl)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(objectUrl)
          // Audio finished: return smoothly to listening for the user!
          if (isCallActiveRef.current && callStateRef.current === 'speaking') {
            setCallState('listening')
            setCurrentTranscript('')
          }
        }

        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          if (isCallActiveRef.current) {
            setCallState('listening')
          }
        }

        await audio.play()
      } catch (err: any) {
        console.error('Call voice playback failed:', err)
        setError(err?.message || 'Could not synthesize voice')
        setTimeout(() => {
          if (isCallActiveRef.current && callStateRef.current === 'speaking') {
            setCallState('listening')
          }
        }, 1500)
      }
    },
    [],
  )

  const processUserSpeech = useCallback(
    async (textToSubmit: string) => {
      if (!textToSubmit.trim() || !isCallActiveRef.current) return
      setCallState('processing')
      setError(null)

      try {
        const answer = await onSendMessage(textToSubmit.trim())
        if (!isCallActiveRef.current) return

        // If user interrupted during processing, don't speak old answer
        if (callStateRef.current !== 'processing') return

        if (answer) {
          await playAIResponse(answer)
        } else {
          setCallState('listening')
          setCurrentTranscript('')
        }
      } catch (err: any) {
        console.error('Processing speech error:', err)
        setError('Failed to process message')
        setCallState('listening')
      }
    },
    [onSendMessage, playAIResponse],
  )

  // Direct In-Call Text Input: skips STT completely!
  const sendTextMessage = useCallback(
    async (textToSubmit: string) => {
      const trimmed = textToSubmit.trim()
      if (!trimmed || !isCallActiveRef.current) return

      // Stop any speech playing currently (immediate barge-in)
      stopActiveAudio()

      // Cancel any pending speech recognition silence timer
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)

      // Update transcript and enter processing state (bypassing STT entirely!)
      setCurrentTranscript(trimmed)
      setCallState('processing')
      setError(null)

      try {
        const answer = await onSendMessage(trimmed)
        if (!isCallActiveRef.current) return
        if (callStateRef.current !== 'processing') return

        if (answer) {
          await playAIResponse(answer)
        } else {
          setCallState('listening')
          setCurrentTranscript('')
        }
      } catch (err: any) {
        console.error('Processing typed message error:', err)
        setError('Failed to process message')
        setCallState('listening')
      }
    },
    [onSendMessage, playAIResponse, stopActiveAudio],
  )

  // Voice recognition loop (remains continuously hot to enable natural voice barge-in)
  const startRecognition = useCallback(() => {
    if (!isCallActiveRef.current || isMutedRef.current) return
    const win = typeof window !== 'undefined' ? (window as unknown as IWindow) : null
    const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Browser speech recognition not supported.')
      return
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => {
        // Recognition started
      }

      recognition.onresult = (event: any) => {
        if (isMutedRef.current) return

        let interimText = ''
        let finalText = ''

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i]
          if (res.isFinal) {
            finalText += res[0].transcript + ' '
          } else {
            interimText += res[0].transcript
          }
        }

        const combined = (finalText + interimText).trim()

        if (combined) {
          // NATURAL BARGE-IN: If AI is speaking and user speaks, cut off immediately!
          if (callStateRef.current === 'speaking') {
            stopActiveAudio()
            setCallState('listening')
            setLastAIResponse('')
          }

          setCurrentTranscript(combined)

          // Reset silence timer on every spoken word
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = setTimeout(() => {
            // User paused for 1.2s: auto-submit to the brain!
            if (combined.trim() && isCallActiveRef.current) {
              void processUserSpeech(combined.trim())
            }
          }, 1200)
        }
      }

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return
        console.warn('Speech recognition notice:', event.error)
      }

      recognition.onend = () => {
        // Auto-restart recognition so mic never drops out during the call
        if (isCallActiveRef.current && !isMutedRef.current) {
          try {
            recognition.start()
          } catch {
            // ignore collision
          }
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.warn('Could not start recognition:', err)
    }
  }, [processUserSpeech, stopActiveAudio])

  const stopRecognition = useCallback(() => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  const startCall = useCallback(async () => {
    setError(null)
    setIsCallActive(true)
    setCallState('connecting')
    setCurrentTranscript('')
    setLastAIResponse('')

    try {
      // Hardware Acoustic Echo Cancellation + Noise Suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      audioStreamRef.current = stream

      // Pre-warm audio element for mobile browser autoplay unlock
      const dummyAudio = new Audio()
      dummyAudio.play().catch(() => {})

      setCallState('listening')
      startRecognition()
    } catch (err: any) {
      console.error('Microphone access denied:', err)
      setError('Microphone access denied. Please allow microphone permissions.')
      setIsCallActive(false)
    }
  }, [startRecognition])

  const endCall = useCallback(() => {
    stopRecognition()
    stopActiveAudio()

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop())
      audioStreamRef.current = null
    }

    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

    setIsCallActive(false)
    setCallState('connecting')
    setCurrentTranscript('')
    setLastAIResponse('')
    setError(null)
  }, [stopActiveAudio, stopRecognition])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      if (next) {
        stopRecognition()
      } else {
        startRecognition()
      }
      return next
    })
  }, [startRecognition, stopRecognition])

  const interrupt = useCallback(() => {
    stopActiveAudio()
    setCallState('listening')
    setCurrentTranscript('')
    startRecognition()
  }, [startRecognition, stopActiveAudio])

  return {
    isCallActive,
    callState,
    duration,
    isMuted,
    currentTranscript,
    lastAIResponse,
    error,
    startCall,
    endCall,
    toggleMute,
    interrupt,
    sendTextMessage,
  }
}
