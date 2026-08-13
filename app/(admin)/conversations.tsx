import { InboxScreen } from '@/components/inbox/inbox-screen'
import { getDevUserId } from '@/lib/dev-user'
import { listInboxConversations } from '@/lib/inbox-filter'
import { CONVERSATIONS } from '@/lib/mock-data'
import { getSession } from '@/lib/session'

export default function AdminConversationsScreen() {
  return (
    <InboxScreen
      conversations={listInboxConversations(
        getSession().role,
        getDevUserId(),
        CONVERSATIONS,
      )}
      showChips
      showCompose
      title="Messages"
    />
  )
}
