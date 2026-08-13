import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname, useSegments } from 'expo-router'

import { ThreadScreen } from '@/components/chat/thread-screen'
import { chatIdFromRoute, chatIdFromSegments } from '@/lib/chat-route-id'
import { getDevUserId } from '@/lib/dev-user'
import { ROLE_HREF } from '@/lib/hub-routes'
import { CONVERSATIONS, MESSAGES } from '@/lib/mock-data'
import { canViewConversation } from '@/lib/rbac'
import { getSession } from '@/lib/session'

export default function ChatScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id
  const pathname = usePathname()
  const id =
    chatIdFromRoute(local, pathname) ??
    chatIdFromRoute(global, pathname) ??
    chatIdFromSegments(useSegments())
  const conversation = id ? CONVERSATIONS.find((c) => c.id === id) : undefined

  const role = getSession().role
  if (!id || !conversation || !canViewConversation(role, getDevUserId(), conversation)) {
    return <Redirect href={ROLE_HREF[role]} />
  }

  const initialMessages = MESSAGES.filter((m) => m.conversationId === conversation.id)

  return <ThreadScreen conversation={conversation} initialMessages={initialMessages} />
}
