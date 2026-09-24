export interface SourceItem {
  id?: number
  score?: number
  text?: string
  metadata?: {
    domain?: string
    topics?: string[]
    language?: string
    source?: {
      type?: string
      file?: string
    }
  }
}

export interface AssistantInfo {
  latency?: number | null
  model?: string
  embeddingModel?: string
  sources?: SourceItem[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
  error?: boolean
  info?: AssistantInfo
}