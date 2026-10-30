/**
 * Clean markdown, code blocks, URLs, citations, and meta-labels
 * into clean, natural text suitable for ElevenLabs TTS and live voice calls.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return ''

  let cleaned = text

  // 1. Remove fenced code blocks (```lang ... ```)
  cleaned = cleaned.replace(/```[\w-]*\n[\s\S]*?```/g, ' [code snippet omitted] ')

  // 2. Remove inline code snippets (`code`)
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1')

  // 3. Remove Markdown links [text](url) -> keep only text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // 4. Remove raw URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '')

  // 5. Remove citations like [1], [2], [source:...], [video:...]
  cleaned = cleaned.replace(/\[\d+\]/g, '')
  cleaned = cleaned.replace(/\[source:[^\]]+\]/gi, '')
  cleaned = cleaned.replace(/\[video:[^\]]+\]/gi, '')

  // 6. Remove prompt meta-labels
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:Fahad Gul|Assistant|Answer|Response|Second Brain):\s*/gi, ' ')
  cleaned = cleaned.replace(/\b(?:Fahad Gul|Assistant|Answer|Response|Second Brain):\s*/gi, '')

  // 7. Remove Markdown headings (# Heading -> Heading)
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, '')

  // 8. Remove Markdown bold / italics (**bold**, *italic*, __bold__, _italic_)
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1')
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1')
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1')
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1')

  // 9. Normalize bullet lists and numbered lists
  cleaned = cleaned.replace(/^\s*[-*+]\s+/gm, '')
  cleaned = cleaned.replace(/^\s*\d+\.\s+/gm, '')

  // 10. Remove blockquotes
  cleaned = cleaned.replace(/^\s*>\s*/gm, '')

  // 11. Normalize excessive whitespace and special characters
  cleaned = cleaned.replace(/[#*_~`><|]/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ')

  return cleaned.trim()
}
