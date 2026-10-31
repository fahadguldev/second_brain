const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

interface QueueItem {
  id: string
  text: string
  audioPromise: Promise<string | null>
  abortController: AbortController
}

export interface AudioQueuePlayerOptions {
  onSentenceStart?: (text: string) => void
  onAllCompleted?: () => void
  onError?: (error: string) => void
  provider?: string
}

/**
 * High-performance audio queue player for real-time conversational AI.
 * Pre-fetches upcoming sentences in parallel and plays them sequentially with zero latency gaps.
 */
export class AudioQueuePlayer {
  private queue: QueueItem[] = []
  private isPlaying = false
  private isStreamDone = false
  private audioElement: HTMLAudioElement | null = null
  private currentObjectUrl: string | null = null
  private options: AudioQueuePlayerOptions
  private activeAbortControllers: Set<AbortController> = new Set()

  constructor(options: AudioQueuePlayerOptions = {}) {
    this.options = options
  }

  public setOptions(options: Partial<AudioQueuePlayerOptions>): void {
    this.options = { ...this.options, ...options }
  }

  public initAudioElement(existingAudio?: HTMLAudioElement | null): void {
    if (existingAudio) {
      this.audioElement = existingAudio
    } else if (!this.audioElement) {
      this.audioElement = new Audio()
    }
  }

  public setStreamDone(): void {
    this.isStreamDone = true
    if (!this.isPlaying && this.queue.length === 0) {
      this.options.onAllCompleted?.()
    }
  }

  public resetStream(): void {
    this.isStreamDone = false
  }

  /**
   * Queue a sentence for TTS pre-fetching and playback.
   */
  public queueSentence(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return

    const controller = new AbortController()
    this.activeAbortControllers.add(controller)

    const fetchPromise = this.fetchAudioForSentence(trimmed, controller.signal)

    const item: QueueItem = {
      id: Math.random().toString(36).slice(2),
      text: trimmed,
      audioPromise: fetchPromise,
      abortController: controller,
    }

    this.queue.push(item)

    if (!this.isPlaying) {
      void this.playNext()
    }
  }

  private async fetchAudioForSentence(text: string, signal: AbortSignal): Promise<string | null> {
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          provider: this.options.provider || 'elevenlabs',
        }),
        signal,
      })

      if (!res.ok) {
        let errMessage = 'TTS generation failed'
        try {
          const errData = await res.json()
          errMessage = errData.detail || errMessage
        } catch {
          // ignore parse error
        }
        throw new Error(errMessage)
      }

      const blob = await res.blob()
      return URL.createObjectURL(blob)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null
      }
      console.warn('[AudioQueuePlayer] Error synthesizing sentence:', err)
      this.options.onError?.(err?.message || 'Could not synthesize speech')
      return null
    }
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false
      if (this.isStreamDone) {
        this.options.onAllCompleted?.()
      }
      return
    }

    this.isPlaying = true
    const currentItem = this.queue.shift()!

    try {
      const objectUrl = await currentItem.audioPromise
      this.activeAbortControllers.delete(currentItem.abortController)

      if (!objectUrl) {
        // Synthesis aborted or failed: proceed immediately to next queued sentence
        void this.playNext()
        return
      }

      // Revoke previous audio object URL
      if (this.currentObjectUrl) {
        URL.revokeObjectURL(this.currentObjectUrl)
        this.currentObjectUrl = null
      }

      this.currentObjectUrl = objectUrl
      this.initAudioElement()
      const audio = this.audioElement!

      audio.src = objectUrl
      this.options.onSentenceStart?.(currentItem.text)

      audio.onended = () => {
        if (this.currentObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          this.currentObjectUrl = null
        }
        void this.playNext()
      }

      audio.onerror = (e) => {
        console.error('[AudioQueuePlayer] Playback error on sentence:', e)
        if (this.currentObjectUrl === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          this.currentObjectUrl = null
        }
        void this.playNext()
      }

      await audio.play()
    } catch (err: any) {
      console.error('[AudioQueuePlayer] Could not play sentence audio:', err)
      void this.playNext()
    }
  }

  /**
   * Immediately abort in-flight requests, halt playback, and clear queue (for barge-in / interrupt).
   */
  public stop(): void {
    this.isPlaying = false
    this.isStreamDone = false

    // Abort all active fetch requests
    for (const controller of this.activeAbortControllers) {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }
    this.activeAbortControllers.clear()

    // Stop active audio element
    if (this.audioElement) {
      try {
        this.audioElement.pause()
        this.audioElement.currentTime = 0
        this.audioElement.src = ''
      } catch {
        // ignore
      }
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl)
      this.currentObjectUrl = null
    }

    this.queue = []
  }

  public getIsPlaying(): boolean {
    return this.isPlaying
  }
}
