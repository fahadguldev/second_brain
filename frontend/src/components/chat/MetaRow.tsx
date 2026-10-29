import type { ChatMessage } from '../../types'

export function MetaRow({ info }: { info: NonNullable<ChatMessage['info']> }) {
  const parts: string[] = []
  if (typeof info.latency === 'number') parts.push(`${info.latency.toFixed(1)}s latency`)
  if (info.model) parts.push(info.model)
  if (info.embeddingModel) parts.push(info.embeddingModel.replace('models/', ''))
  if (parts.length === 0) return null

  return (
    <div className="mt-2.5 flex items-center gap-2 border-t border-line/50 pt-2 text-[10px] font-mono tracking-tight text-muted">
      <span>{parts.join(' · ')}</span>
    </div>
  )
}
