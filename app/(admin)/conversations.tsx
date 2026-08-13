import { InboxScreen } from '@/components/inbox/inbox-screen'
import { CONVERSATIONS } from '@/lib/mock-data'

export default function AdminConversationsScreen() {
  return (
    <InboxScreen
      conversations={CONVERSATIONS}
      showChips
      showCompose
      title="Messages"
    />
  )
}
