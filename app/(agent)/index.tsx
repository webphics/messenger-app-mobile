import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, DEV_USER_ID } from '@/lib/mock-data'

export default function AgentChatsScreen() {
  const conversations = listInboxConversations('agent', DEV_USER_ID, CONVERSATIONS)

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose
      title="Messages"
    />
  )
}
