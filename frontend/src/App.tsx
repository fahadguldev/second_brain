import { Suspense, useEffect, useState } from 'react'
import { lazy } from 'react'
import { useChat } from './hooks/useChat'
import { useTheme } from './hooks/useTheme'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Composer } from './components/Composer'
import { EmptyState } from './components/EmptyState'
import { MessageBubble } from './components/MessageBubble'

// Split the admin console out of the chat bundle: visitors to / only
// download the chat UI, /admin loads this chunk on demand.
const AdminApp = lazy(() =>
  import('./components/AdminApp').then(m => ({ default: m.AdminApp }))
)

function ChatApp() {
  const {
    messages, conversations, activeConversationId, isThinking, isLoading,
    sendMessage, selectConversation, newConversation, scrollRef,
  } = useChat()
  const { theme, toggle } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  const closeSidebar = () => setSidebarOpen(false)
  const handleSelectConversation = (id: string) => {
    selectConversation(id)
    closeSidebar()
  }
  const handleNewConversation = () => {
    newConversation()
    closeSidebar()
  }

  const sidebar = (
    <Sidebar
      turnCount={turns} onSuggest={handlePick}
      conversations={conversations} activeConversationId={activeConversationId}
      onSelectConversation={handleSelectConversation} onNewConversation={handleNewConversation}
    />
  )

  return (
    <div className="h-[100dvh] overflow-hidden bg-bg text-ink">
      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={closeSidebar} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-bg shadow-lift">
            {sidebar}
          </div>
        </div>
      )}
      {/* Desktop grid */}
      <div className="mx-auto grid h-full w-full max-w-[1440px] grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="hidden lg:flex lg:flex-col lg:overflow-y-auto">
          {sidebar}
        </div>

        <main className="flex h-full min-h-0 flex-col overflow-hidden">
          <Header isThinking={isThinking} theme={theme} onToggleTheme={toggle} onMenu={() => setSidebarOpen(true)} />

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

export default function App() {
  if (!window.location.pathname.startsWith('/admin')) return <ChatApp />
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[100dvh] place-items-center bg-bg text-sm text-muted">
          Loading admin portal...
        </div>
      }
    >
      <AdminApp />
    </Suspense>
  )
}
