import React, { useRef, useState } from 'react'

interface Message {
  id: string
  text: string
  type: 'user' | 'ai' | 'system'
}

interface UseChatReturn {
  messages: Message[]
  inputValue: string
  setInputValue: (v: string) => void
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  handleSubmit: (e: React.FormEvent) => void
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>
  sendMessage: (text: string) => void
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)

  const sendMessage = async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      type: 'user',
    }
    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setMessages(prev => [...prev, { id: 'typing', text: 'Fahad is thinking...', type: 'system' }])

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: text }),
      })

      const data = await response.json()

      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== 'typing')
        return filtered.concat({
          id: Date.now().toString(),
          text: data.answer,
          type: 'ai',
        })
      })
    } catch (error) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== 'typing')
        return filtered.concat({
          id: Date.now().toString(),
          text: 'Error: Could not get response. Please try again.',
          type: 'ai',
        })
      })
      console.error('API error:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  return {
    messages,
    inputValue,
    setInputValue,
    handleInputChange,
    handleSubmit,
    inputRef,
    sendMessage,
  }
}

export default function App() {
  const {
    messages,
    inputValue,
    setInputValue,
    handleInputChange,
    handleSubmit,
    inputRef,
    sendMessage,
  } = useChat()

  const promptChips = [
    'What should I focus on next?',
    'Summarize my AWS notes',
    'Find advice about interviews',
  ]

  const visibleMessages = messages.filter(msg => msg.id !== 'typing')
  const isThinking = messages.some(m => m.id === 'typing')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(194,139,53,0.22),transparent_30%),linear-gradient(135deg,#f6f3ea_0%,#ebe4d3_48%,#d9e1cf_100%)] font-sans text-ink">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside className="soft-enter flex flex-col justify-between rounded-[8px] border border-ink/10 bg-white/55 p-6 shadow-insetline backdrop-blur-xl lg:min-h-[calc(100vh-4rem)]">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-[8px] bg-ink text-lg font-black text-paper shadow-soft">
                SB
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-moss">Fahad's archive</p>
                <h1 className="font-display text-3xl font-bold leading-none">Second Brain</h1>
              </div>
            </div>

            <div className="mb-8 border-l-4 border-brass pl-4">
              <p className="text-sm font-semibold text-slate">Ask across notes, transcriptions, career advice, AWS lessons, and saved questions.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ['106+', 'notes'],
                ['4', 'streams'],
                [visibleMessages.length.toString(), 'turns'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-[8px] border border-ink/10 bg-paper/70 p-3">
                  <p className="font-display text-2xl font-bold">{value}</p>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate/70">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-[8px] bg-ink p-4 text-paper">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brass">Working mode</p>
            <p className="text-sm leading-6 text-paper/80">Precise answers from your own material, with room for follow-up thinking.</p>
          </div>
        </aside>

        <section className="soft-enter flex min-h-[calc(100vh-2.5rem)] flex-col rounded-[8px] border border-ink/10 bg-white/70 shadow-soft backdrop-blur-xl lg:min-h-[calc(100vh-4rem)]">
          <header className="flex flex-col gap-4 border-b border-ink/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-clay">Knowledge console</p>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">What do you want to remember?</h2>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full border border-moss/20 bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
              <span className="h-2 w-2 rounded-full bg-moss"></span>
              Ready
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {visibleMessages.length === 0 && (
              <div className="grid min-h-[340px] place-items-center rounded-[8px] border border-dashed border-ink/15 bg-paper/55 p-5 text-center">
                <div className="max-w-xl">
                  <p className="mb-3 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
                    Start with a messy question.
                  </p>
                  <p className="mx-auto max-w-md text-sm leading-6 text-slate">
                    The app will search the shape of Fahad's knowledge and return an answer you can keep pushing on.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {promptChips.map(prompt => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInputValue(prompt)}
                        className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-slate shadow-insetline transition hover:-translate-y-0.5 hover:border-brass hover:text-ink focus:outline-none focus:ring-2 focus:ring-brass/40"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {visibleMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <article
                  className={`max-w-[min(42rem,92%)] rounded-[8px] px-4 py-3 text-sm leading-6 shadow-insetline sm:px-5 ${
                    msg.type === 'user'
                      ? 'bg-ink text-paper'
                      : 'border border-ink/10 bg-paper text-ink'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </article>
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="rounded-[8px] border border-ink/10 bg-paper px-5 py-3 text-sm font-semibold text-slate shadow-insetline">
                  Fahad is thinking...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-ink/10 bg-white/65 p-3 sm:p-4">
            <div className="flex flex-col gap-3 rounded-[8px] border border-ink/10 bg-white p-2 shadow-insetline sm:flex-row sm:items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                rows={2}
                className="min-h-[56px] flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-ink placeholder:text-slate/50 focus:outline-none"
                aria-label="Ask a question"
                required
              />
              <button
                type="submit"
                className="rounded-[8px] bg-brass px-5 py-3 text-sm font-extrabold text-ink transition hover:-translate-y-0.5 hover:bg-[#d69b3f] focus:outline-none focus:ring-2 focus:ring-brass/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 sm:min-w-32"
                disabled={!inputValue.trim()}
              >
                Generate
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
