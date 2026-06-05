import { unstable_rethrow } from 'next/navigation'
import { serverFetch } from '@/lib/api-server'
import { ChatView } from '@/components/ChatView'
import type { TextMessage } from '@/lib/data'

export default async function ChatPage() {
  let initialMessages: TextMessage[] = []
  let initialSessionId: string | null = null
  try {
    const data = await serverFetch<{ messages: TextMessage[]; viewed_session_id: string | null }>('/api/history')
    initialMessages = data.messages ?? []
    initialSessionId = data.viewed_session_id ?? null
  } catch (e) {
    // 401 → serverFetch already redirected to /login; other errors → start empty
    unstable_rethrow(e)
  }

  return <ChatView initialMessages={initialMessages} initialSessionId={initialSessionId} />
}
