import { InboxScreen } from '@/components/inbox/inbox-screen'
import { getDevUserId } from '@/lib/dev-user'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS } from '@/lib/mock-data'
import { getSession } from '@/lib/session'

export default function AgentMessagesScreen() {
  const conversations = listInboxConversations(
    getSession().role,
    getDevUserId(),
    CONVERSATIONS,
  )

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose
      title="Messages"
    />
  )
}
