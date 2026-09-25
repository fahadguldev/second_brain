import { useEffect } from 'react'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Composer } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { MessageBubble } from './components/MessageBubble'

export default function App() {
  const {
    messages, conversations, activeConversationId, isThinking, isLoading,
    sendMessage, selectConversation, newConversation, scrollRef,
  } = useChat()
  const { theme, toggle } = useTheme()

  const turns = messages.filter(m => m.role === 'user').length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector('textarea')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handlePick = (text: string) => {
    sendMessage(text)
  }

  return (
    <div className="bg-bg text-ink">
      {/* Desktop grid */}
      <div className="mx-auto grid max-h-[100dvh] min-h-[100dvh] w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden">
        <div className="hidden lg:flex lg:flex-col lg:overflow-y-auto">
          <Sidebar
            turnCount={turns} onSuggest={handlePick}
            conversations={conversations} activeConversationId={activeConversationId}
            onSelectConversation={selectConversation} onNewConversation={newConversation}
          />
        </div>

        <main className="flex min-h-0 flex-col">
          <Header isThinking={isThinking} theme={theme} onToggleTheme={toggle} />

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="grid h-full place-items-center text-sm text-muted">Loading history...</div>
            ) : messages.length === 0 ? (
              <EmptyState onPick={handlePick} />
            ) : (
              <>
                <div className="mx-auto flex w-full flex-col gap-5 max-w-3xl">
                  {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                </div>

                {turns > 0 && (
                  <div className="mx-auto mt-8 flex max-w-3xl justify-center">
                    <button
                      onClick={newConversation}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      New conversation
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <Composer onSend={handlePick} disabled={isThinking} />
        </main>
      </div>
    </div>
  )
}
