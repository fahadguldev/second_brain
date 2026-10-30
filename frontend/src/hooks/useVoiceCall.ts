import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioQueuePlayer } from '../lib/audioQueuePlayer'
import { SentenceSplitter } from '../lib/sentenceSplitter'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type CallState = 'connecting' | 'listening' | 'processing' | 'speaking'

interface IWindow extends Window {
  webkitSpeechRecognition?: any
  SpeechRecognition?: any
}

interface UseVoiceCallProps {
  onSendMessage: (text: string, onDelta?: (token: string) => void) => Promise<string | null>
  isThinking: boolean
}

export function useVoiceCall({ onSendMessage, isThinking: _isThinking }: UseVoiceCallProps) {
  const [isCallActive, setIsCallActive] = useState(false)
  const [callState, setCallState] = useState<CallState>('connecting')
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [lastAIResponse, setLastAIResponse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string>('elevenlabs')

  const recognitionRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const silenceTimeoutRef = useRef<any>(null)
  const timerIntervalRef = useRef<any>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioQueueRef = useRef<AudioQueuePlayer | null>(null)

  const isCallActiveRef = useRef(false)
  const isMutedRef = useRef(false)
  const callStateRef = useRef<CallState>('connecting')

  // Synchronous state updater to avoid stale state in race conditions
  const updateCallState = useCallback((newState: CallState) => {
    callStateRef.current = newState
    setCallState(newState)
  }, [])

  // Initialize and maintain the AudioQueuePlayer
  if (!audioQueueRef.current) {
    audioQueueRef.current = new AudioQueuePlayer({
      provider,
      onSentenceStart: (sentence: string) => {
        if (isCallActiveRef.current) {
          updateCallState('speaking')
          setLastAIResponse(sentence)
        }
      },
      onAllCompleted: () => {
        if (isCallActiveRef.current && callStateRef.current === 'speaking') {
          updateCallState('listening')
          setCurrentTranscript('')
        }
      },
      onError: (errMsg: string) => {
        console.warn('[useVoiceCall] Audio queue error:', errMsg)
        setError(errMsg)
      },
    })
  }

  useEffect(() => {
    if (audioQueueRef.current) {
      audioQueueRef.current.setOptions({ provider })
    }
  }, [provider])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/voice/status`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data?.provider) {
          setProvider(data.provider)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    isCallActiveRef.current = isCallActive
  }, [isCallActive])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

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
    audioQueueRef.current?.stop()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [])

  // Ultra-Fast Sentence-Pipelined RAG Execution
  const processUserSpeech = useCallback(
    async (textToSubmit: string) => {
      const trimmed = textToSubmit.trim()
      if (!trimmed || !isCallActiveRef.current) return
      // Prevent duplicate submissions if already thinking
      if (callStateRef.current === 'processing') return

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }

      updateCallState('processing')
      setError(null)

      const audioQueue = audioQueueRef.current!
      audioQueue.resetStream()

      // Pipelining engine: as soon as Sentence 1 arrives from LLM stream, queue it immediately to TTS!
      const splitter = new SentenceSplitter((sentence: string) => {
        if (!isCallActiveRef.current) return
        console.log('[VoiceCall] Streamed sentence ready for TTS:', sentence)
        audioQueue.queueSentence(sentence)
      })

      try {
        console.log('[VoiceCall] Submitting spoken query to RAG with sentence pipelining:', trimmed)
        const answer = await onSendMessage(trimmed, (deltaText: string) => {
          if (!isCallActiveRef.current) return
          splitter.feed(deltaText)
        })

        if (!isCallActiveRef.current) {
          audioQueue.stop()
          return
        }

        // Flush any trailing clause at the end of the stream
        splitter.flush()
        audioQueue.setStreamDone()

        if (!answer && !audioQueue.getIsPlaying()) {
          console.warn('[VoiceCall] RAG returned empty answer')
          updateCallState('listening')
          setCurrentTranscript('')
        }
      } catch (err: any) {
        console.error('[VoiceCall] Processing speech error:', err)
        setError('Failed to process message')
        audioQueue.stop()
        updateCallState('listening')
      }
    },
    [onSendMessage, updateCallState],
  )

  // Direct In-Call Text Input: skips STT completely with the same sub-second sentence pipelining!
  const sendTextMessage = useCallback(
    async (textToSubmit: string) => {
      const trimmed = textToSubmit.trim()
      if (!trimmed || !isCallActiveRef.current) return
      if (callStateRef.current === 'processing') return

      // Stop any speech playing currently (immediate barge-in)
      stopActiveAudio()

      // Cancel any pending speech recognition silence timer
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }

      setCurrentTranscript(trimmed)
      updateCallState('processing')
      setError(null)

      const audioQueue = audioQueueRef.current!
      audioQueue.resetStream()

      const splitter = new SentenceSplitter((sentence: string) => {
        if (!isCallActiveRef.current) return
        console.log('[VoiceCall] Typed query streamed sentence ready for TTS:', sentence)
        audioQueue.queueSentence(sentence)
      })

      try {
        console.log('[VoiceCall] Submitting typed query to RAG (STT bypassed):', trimmed)
        const answer = await onSendMessage(trimmed, (deltaText: string) => {
          if (!isCallActiveRef.current) return
          splitter.feed(deltaText)
        })

        if (!isCallActiveRef.current) {
          audioQueue.stop()
          return
        }

        splitter.flush()
        audioQueue.setStreamDone()

        if (!answer && !audioQueue.getIsPlaying()) {
          updateCallState('listening')
          setCurrentTranscript('')
        }
      } catch (err: any) {
        console.error('[VoiceCall] Processing typed message error:', err)
        setError('Failed to process message')
        audioQueue.stop()
        updateCallState('listening')
      }
    },
    [onSendMessage, stopActiveAudio, updateCallState],
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
        if (isMutedRef.current || !isCallActiveRef.current) return

        // While Fahad is thinking ('processing'), IGNORE incoming audio to prevent double-submitting
        if (callStateRef.current === 'processing') {
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
          // NATURAL BARGE-IN: If AI is speaking and user speaks, cut off audio immediately!
          if (callStateRef.current === 'speaking') {
            stopActiveAudio()
            updateCallState('listening')
            setLastAIResponse('')
          }

          if (callStateRef.current === 'listening') {
            setCurrentTranscript(combined)

            // Responsive silence detection: trigger after 650ms (reduced from 1200ms)
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = setTimeout(() => {
              if (combined.trim() && isCallActiveRef.current && callStateRef.current === 'listening') {
                void processUserSpeech(combined.trim())
              }
            }, 650)
          }
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
  }, [processUserSpeech, stopActiveAudio, updateCallState])

  const stopRecognition = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
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
    isCallActiveRef.current = true
    updateCallState('connecting')
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
      audioRef.current = dummyAudio
      audioQueueRef.current?.initAudioElement(dummyAudio)

      updateCallState('listening')
      startRecognition()
    } catch (err: any) {
      console.error('Microphone access denied:', err)
      setError('Microphone access denied. Please allow microphone permissions.')
      setIsCallActive(false)
      isCallActiveRef.current = false
      updateCallState('connecting')
    }
  }, [startRecognition, updateCallState])

  const endCall = useCallback(() => {
    isCallActiveRef.current = false
    stopRecognition()
    stopActiveAudio()

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop())
      audioStreamRef.current = null
    }

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

    setIsCallActive(false)
    updateCallState('connecting')
    setCurrentTranscript('')
    setLastAIResponse('')
    setError(null)
  }, [stopActiveAudio, stopRecognition, updateCallState])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      isMutedRef.current = next
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
    updateCallState('listening')
    setCurrentTranscript('')
    setLastAIResponse('')
    startRecognition()
  }, [startRecognition, stopActiveAudio, updateCallState])

  return {
    isCallActive,
    callState,
    duration,
    isMuted,
    currentTranscript,
    lastAIResponse,
    error,
    provider,
    startCall,
    endCall,
    toggleMute,
    interrupt,
    sendTextMessage,
  }
}
