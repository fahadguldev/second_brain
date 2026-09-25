export interface SourceItem {
  id?: number
  score?: number
  text?: string
  payload?: {
    text?: string
    metadata?: SourceMetadata
  }
  metadata?: SourceMetadata
}

export interface SourceMetadata {
  domain?: string
  topics?: string[]
  language?: string
  source?: {
    type?: string
    file?: string
    url?: string
    video_id?: string
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