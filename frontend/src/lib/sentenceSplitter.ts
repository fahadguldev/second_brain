import { cleanTextForSpeech } from './voiceUtils'

const ABBREVIATIONS = new Set(['mr.', 'ms.', 'mrs.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.', 'e.g.', 'i.e.'])

/**
 * Splits an incoming LLM token stream into natural, conversational sentences.
 * Enables sentence-by-sentence TTS pipelining with sub-second latency.
 */
export class SentenceSplitter {
  private buffer = ''
  private onSentence: (sentence: string) => void

  constructor(onSentence: (sentence: string) => void) {
    this.onSentence = onSentence
  }

  public feed(chunk: string): void {
    this.buffer += chunk
    this.processBuffer()
  }

  private processBuffer(): void {
    // Look for sentence-ending punctuation followed by whitespace or newline
    const sentenceEndRegex = /([.?!]+(?:\s+|\n+)|(?:\n\n+))/g
    let match: RegExpExecArray | null
    let lastIndex = 0

    while ((match = sentenceEndRegex.exec(this.buffer)) !== null) {
      const matchEnd = match.index + match[0].length
      const candidate = this.buffer.slice(lastIndex, matchEnd).trim()

      // Avoid splitting on common abbreviations (e.g. "Dr.", "e.g.")
      const lastWord = candidate.split(/\s+/).pop()?.toLowerCase() || ''
      if (ABBREVIATIONS.has(lastWord)) {
        continue
      }

      // Avoid splitting on decimal numbers like "3.5" or "0.8"
      if (/\d\.\s*$/.test(candidate) && /^\d/.test(this.buffer.slice(matchEnd))) {
        continue
      }

      // Require at least 2 words or a strong punctuation to trigger a sentence
      const wordCount = candidate.split(/\s+/).filter(Boolean).length
      if (wordCount >= 2) {
        const cleaned = cleanTextForSpeech(candidate)
        if (cleaned) {
          this.onSentence(cleaned)
        }
        this.buffer = this.buffer.slice(matchEnd)
        sentenceEndRegex.lastIndex = 0
        lastIndex = 0
      }
    }

    // Fallback: If buffer exceeds 20 words without sentence punctuation,
    // split at a natural pause (comma, semicolon, dash) to maintain low latency.
    const words = this.buffer.split(/\s+/)
    if (words.length >= 18) {
      const pauseMatch = /([,;—–-]\s+)/.exec(this.buffer)
      if (pauseMatch && pauseMatch.index > 20) {
        const clause = this.buffer.slice(0, pauseMatch.index + pauseMatch[0].length).trim()
        const cleaned = cleanTextForSpeech(clause)
        if (cleaned) {
          this.onSentence(cleaned)
        }
        this.buffer = this.buffer.slice(pauseMatch.index + pauseMatch[0].length)
      }
    }
  }

  public flush(): void {
    const remaining = this.buffer.trim()
    if (remaining) {
      const cleaned = cleanTextForSpeech(remaining)
      if (cleaned) {
        this.onSentence(cleaned)
      }
    }
    this.buffer = ''
  }

  public reset(): void {
    this.buffer = ''
  }
}
