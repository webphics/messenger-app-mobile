import { View } from 'react-native'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { conversationTitle } from '@/lib/conversation-title'
import { initials } from '@/lib/display'
import { DEV_USER_ID, LABELS, PEOPLE } from '@/lib/mock-data'
import type { Conversation } from '@/lib/types'

type ThreadHeaderProps = {
  conversation: Conversation
}

function statusPill(conversation: Conversation): string | null {
  if (
    conversation.labelIds.some((id) => LABELS.find((l) => l.id === id)?.name === 'Resolved')
  ) {
    return 'Resolved'
  }
  if (conversation.assigneeId === null) return 'Unassigned'
  return 'Assigned'
}

export function ThreadHeader({ conversation }: ThreadHeaderProps) {
  const title = conversationTitle(conversation, PEOPLE, DEV_USER_ID)
  const otherId = conversation.participantIds.find((id) => id !== DEV_USER_ID)
  const other = PEOPLE.find((p) => p.id === otherId)
  const isGroup = conversation.kind === 'group' || conversation.id === 'offers'
  const subtitle = isGroup
    ? `${conversation.participantIds.length} participants`
    : (other?.lastActiveLabel ?? '')
  const pill = statusPill(conversation)

  return (
    <View className="h-10 min-w-0 flex-1 flex-row items-center gap-2 pr-2">
      <Avatar alt={title} className="size-8">
        <AvatarFallback className="bg-primary-soft">
          <Text className="font-sans text-[11px] font-semibold text-primary">
            {initials(title)}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <Text className="font-sans text-[15px] font-semibold leading-5 text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="font-sans text-[11px] leading-4 text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {pill ? (
        <View className="rounded-full bg-bg px-2 py-0.5">
          <Text className="font-sans text-[10px] text-ink-soft">{pill}</Text>
        </View>
      ) : null}
    </View>
  )
}
