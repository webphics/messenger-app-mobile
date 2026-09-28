import { useMemo } from 'react'

import { useConversationInbox } from '@/lib/conversation-inbox'
import { canViewConversation } from '@/lib/rbac'
import { getSession, getSessionUser } from '@/lib/session'
import type { MessageAuthor } from '@/lib/thread-state'
import type { Conversation, UserRole } from '@/lib/types'

/**
 * The conversation behind a screen that hangs off a thread.
 *
 * Both of them — Conversation details and Shared in chat — begin the same way:
 * find the row in the list every screen shares, and ask whether this person may
 * open it. They hold the same permission the thread does, because each is a
 * second view of a conversation somebody is already reading, and answering that
 * question twice in two files is how the two answers drift apart.
 *
 * Not a screen and not a fetch: it reads what the inbox already holds. A section
 * that also wants the messages asks `useThreadMessages` itself, because only one
 * of the two does.
 */

export type ChatSection =
  | { status: 'loading' }
  /**
   * No row, no session, or not this person's to open — and also the inbox
   * failing, which is not this screen's to explain: the thread it was opened
   * from is still underneath saying so, and back is the way to it.
   */
  | { status: 'denied'; home: UserRole }
  | {
      status: 'ready'
      conversation: Conversation
      viewerRole: UserRole
      /** For `useThreadMessages`, which needs to know whose echo is whose. */
      author: MessageAuthor
      organizationNames?: ReadonlyMap<string, string>
    }

export function useChatSectionConversation(conversationId: string): ChatSection {
  const inbox = useConversationInbox()
  const user = getSessionUser()
  const role = getSession().role

  const conversation = useMemo<Conversation | null>(() => {
    const rows = inbox.status === 'ready' ? inbox.conversations : []
    return rows.find((row) => row.id === conversationId) ?? null
  }, [inbox, conversationId])

  const author = useMemo<MessageAuthor | null>(
    () => (user ? { id: user.id, name: user.name, role: user.role } : null),
    [user],
  )

  return useMemo(() => {
    if (inbox.status === 'loading') return { status: 'loading' as const }
    if (
      inbox.status !== 'ready' ||
      conversation === null ||
      user === null ||
      author === null ||
      !canViewConversation(user, conversation)
    ) {
      return { status: 'denied' as const, home: role }
    }
    return {
      status: 'ready' as const,
      conversation,
      viewerRole: role,
      author,
      organizationNames: inbox.organizationNames,
    }
  }, [inbox, conversation, user, author, role])
}
