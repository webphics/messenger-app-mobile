import { InboxScreen } from '@/components/inbox/inbox-screen'
import { listUnassignedConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS } from '@/lib/mock-data'

export default function AdminUnassignedScreen() {
  return (
    <InboxScreen
      conversations={listUnassignedConversations(CONVERSATIONS)}
      showChips={false}
      showCompose={false}
      title="Unassigned"
    />
  )
}
