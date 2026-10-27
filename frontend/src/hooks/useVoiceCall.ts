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

  // Keep refs in sync with state for event listeners
  useEffect(() => {
    isCallActiveRef.current = isCallActive
  }, [isCallActive])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    callStateRef.current = callState
  }, [callState])

  // Call duration counter
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
        const objectUrl = URL.createObjectURL(blob)
        const audio = new Audio(objectUrl)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(objectUrl)
          // Audio finished: return to listening for user response!
          if (isCallActiveRef.current) {
            setCallState('listening')
            setCurrentTranscript('')
            startRecognition()
          }
        }

        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          if (isCallActiveRef.current) {
            setCallState('listening')
            startRecognition()
          }
        }

        await audio.play()
      } catch (err: any) {
        console.error('Call voice playback failed:', err)
        setError(err?.message || 'Could not synthesize voice')
        // Recover back to listening after brief pause
        setTimeout(() => {
          if (isCallActiveRef.current) {
            setCallState('listening')
            startRecognition()
          }
        }, 1500)
      }
    },
    [],
  )

  const processUserSpeech = useCallback(
    async (textToSubmit: string) => {
      if (!textToSubmit.trim() || !isCallActiveRef.current) return
      stopRecognition()
      setCallState('processing')
      setError(null)

      try {
        const answer = await onSendMessage(textToSubmit.trim())
        if (!isCallActiveRef.current) return

        if (answer) {
          await playAIResponse(answer)
        } else {
          // If no answer generated, resume listening
          setCallState('listening')
          setCurrentTranscript('')
          startRecognition()
        }
      } catch (err: any) {
        console.error('Processing speech error:', err)
        setError('Failed to process message')
        setCallState('listening')
        startRecognition()
      }
    },
    [onSendMessage, playAIResponse],
  )

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
        if (isCallActiveRef.current && callStateRef.current !== 'speaking') {
          setCallState('listening')
        }
      }

      recognition.onresult = (event: any) => {
        if (isMutedRef.current || callStateRef.current === 'speaking' || callStateRef.current === 'processing') {
          return
        }

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
          setCurrentTranscript(combined)

          // Reset silence timer on every spoken word
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = setTimeout(() => {
            // User stopped talking for 1.3 seconds: auto-submit!
            if (combined.trim() && isCallActiveRef.current) {
              void processUserSpeech(combined.trim())
            }
          }, 1300)
        }
      }

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return
        console.warn('Speech recognition warning:', event.error)
      }

      recognition.onend = () => {
        // Automatically restart recognition if still in listening state
        if (
          isCallActiveRef.current &&
          !isMutedRef.current &&
          callStateRef.current === 'listening'
        ) {
          try {
            recognition.start()
          } catch {
            // ignore restart collision
          }
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.warn('Could not start recognition:', err)
    }
  }, [processUserSpeech])

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
      // Request mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioStreamRef.current = stream

      // Pre-warm audio context / unlock audio playback on mobile browsers
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
  }
}
