import { Redirect, useGlobalSearchParams, useLocalSearchParams, usePathname, useSegments } from 'expo-router'

import { ThreadScreen } from '@/components/chat/thread-screen'
import { chatIdFromRoute, chatIdFromSegments } from '@/lib/chat-route-id'
import { CONVERSATIONS, DEV_ROLE, DEV_USER_ID, MESSAGES, ROLE_HREF } from '@/lib/mock-data'
import { canViewConversation } from '@/lib/rbac'

export default function ChatScreen() {
  const local = useLocalSearchParams<{ id?: string | string[] }>().id
  const global = useGlobalSearchParams<{ id?: string | string[] }>().id
  const pathname = usePathname()
  const id =
    chatIdFromRoute(local, pathname) ??
    chatIdFromRoute(global, pathname) ??
    chatIdFromSegments(useSegments())
  const conversation = id ? CONVERSATIONS.find((c) => c.id === id) : undefined

  if (!id || !conversation || !canViewConversation(DEV_ROLE, DEV_USER_ID, conversation)) {
    return <Redirect href={ROLE_HREF[DEV_ROLE]} />
  }

  const initialMessages = MESSAGES.filter((m) => m.conversationId === conversation.id)

  return <ThreadScreen conversation={conversation} initialMessages={initialMessages} />
}
