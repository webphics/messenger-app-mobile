import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS, DEV_USER_ID } from '@/lib/mock-data'

export default function AdminConversationsScreen() {
  return (
    <InboxScreen
      conversations={listInboxConversations('admin', DEV_USER_ID, CONVERSATIONS)}
      showChips
      showCompose
      title="Messages"
    />
  )
}
