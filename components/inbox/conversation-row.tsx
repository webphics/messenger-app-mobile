import { Megaphone } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'
import { conversationTitle } from '@/lib/conversation-title'
import { formatRelativeTime, initials } from '@/lib/display'
import { DEV_USER_ID, PEOPLE } from '@/lib/mock-data'
import type { Conversation } from '@/lib/types'

type ConversationRowProps = {
  conversation: Conversation
  onPress: () => void
}

function otherPerson(conversation: Conversation) {
  const otherId = conversation.participantIds.find((id) => id !== DEV_USER_ID)
  return PEOPLE.find((p) => p.id === otherId)
}

export function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const title = conversationTitle(conversation, PEOPLE, DEV_USER_ID)
  const isOffers = conversation.id === 'offers'
  const other = otherPerson(conversation)
  const online = isOffers ? false : Boolean(other?.isOnline)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 px-4 py-3"
    >
      <View className="relative">
        <Avatar alt={title} className="size-12">
          {isOffers ? (
            <AvatarFallback className="bg-primary">
              <Megaphone color="#FFFFFF" size={22} />
            </AvatarFallback>
          ) : (
            <AvatarFallback className="bg-primary-soft">
              <Text className="font-sans text-sm font-semibold text-primary">
                {initials(title)}
              </Text>
            </AvatarFallback>
          )}
        </Avatar>
        {online ? (
          <View
            accessibilityLabel="Online"
            className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success"
          />
        ) : null}
      </View>

      <View className="min-w-0 flex-1">
        <Text className="font-sans text-base font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 font-sans text-sm text-muted" numberOfLines={1}>
          {conversation.lastMessagePreview} · {formatRelativeTime(conversation.updatedAt)}
        </Text>
      </View>

      {conversation.unreadCount > 0 ? (
        <View className="min-h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5">
          <Text className="font-sans text-xs font-semibold text-white">
            {conversation.unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}
