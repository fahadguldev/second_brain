import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTextForSpeech } from '../lib/voiceUtils'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export interface VoiceStatus {
  provider?: string
  configured: boolean
  voice_id?: string | null
  model_id?: string | null
  speed?: number
  available_providers?: string[]
}

export function useVoicePlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef<Map<string, string>>(new Map()) // messageId -> objectURL

  // Fetch ElevenLabs / voice configuration status from backend on mount
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/voice/status`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data) {
          setVoiceStatus(data)
        }
      })
      .catch(() => {
        // Backend might be offline or route unavailable
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Cleanup active audio element and revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      audioCacheRef.current.forEach(url => URL.revokeObjectURL(url))
      audioCacheRef.current.clear()
    }
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingId(null)
  }, [])

  const play = useCallback(
    async (messageId: string, text: string) => {
      setErrorId(null)
      setErrorMessage(null)

      // Toggle pause if clicking the currently playing message
      if (playingId === messageId) {
        stop()
        return
      }

      // Stop any other currently playing audio
      stop()
      setLoadingId(messageId)

      try {
        let objectUrl = audioCacheRef.current.get(messageId)

        if (!objectUrl) {
          const sanitizedText = cleanTextForSpeech(text)
          if (!sanitizedText) {
            throw new Error('Message contains no voiceable text.')
          }

          const res = await fetch(`${API_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: sanitizedText,
              provider: voiceStatus?.provider || 'elevenlabs',
            }),
          })

          if (!res.ok) {
            let detail = 'Voice generation failed.'
            try {
              const errJson = await res.json()
              detail = errJson.detail || detail
            } catch {
              // ignore json parse error
            }
            throw new Error(detail)
          }

          const blob = await res.blob()
          objectUrl = URL.createObjectURL(blob)
          audioCacheRef.current.set(messageId, objectUrl)
        }

        const audio = new Audio(objectUrl)
        audioRef.current = audio

        audio.onended = () => {
          setPlayingId(null)
        }

        audio.onerror = () => {
          setPlayingId(null)
          setLoadingId(null)
          setErrorId(messageId)
          setErrorMessage('Playback error occurred.')
        }

        await audio.play()
        setPlayingId(messageId)
      } catch (err: any) {
        console.error('ElevenLabs TTS playback failed:', err)
        setErrorId(messageId)
        setErrorMessage(err?.message || 'Could not play voice')
      } finally {
        setLoadingId(null)
      }
    },
    [playingId, stop, voiceStatus?.provider],
  )

  return {
    playingId,
    loadingId,
    errorId,
    errorMessage,
    provider: voiceStatus?.provider || 'elevenlabs',
    isVoiceConfigured: voiceStatus?.configured ?? true,
    voiceStatus,
    play,
    stop,
  }
}
