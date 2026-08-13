import { InboxScreen } from '@/components/inbox/inbox-screen'
import { CONVERSATIONS } from '@/lib/mock-data'

export default function AgentUnassignedScreen() {
  const conversations = CONVERSATIONS.filter((c) => c.assigneeId === null)

  return (
    <InboxScreen
      conversations={conversations}
      showChips={false}
      showCompose={false}
      title="Unassigned"
    />
  )
}
