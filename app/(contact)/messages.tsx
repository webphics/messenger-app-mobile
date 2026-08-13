import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, DEV_ROLE, DEV_USER_ID } from '@/lib/mock-data'

export default function ContactMessagesScreen() {
  const conversations = listInboxConversations(DEV_ROLE, DEV_USER_ID, CONVERSATIONS)

  return (
    <InboxScreen
      conversations={conversations}
      showChips
      showCompose
      title="Messages"
    />
  )
}
