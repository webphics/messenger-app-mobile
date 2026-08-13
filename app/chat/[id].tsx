import { Redirect, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { CONVERSATIONS, DEV_ROLE, DEV_USER_ID, ROLE_HREF } from '@/lib/mock-data'
import { canViewConversation } from '@/lib/rbac'

export default function ChatScreen() {
  const raw = useLocalSearchParams<{ id: string | string[] }>().id
  const id = Array.isArray(raw) ? raw[0] : raw
  const conversation = id ? CONVERSATIONS.find((c) => c.id === id) : undefined

  if (raw !== undefined && (!id || !conversation || !canViewConversation(DEV_ROLE, DEV_USER_ID, conversation))) {
    return <Redirect href={ROLE_HREF[DEV_ROLE]} />
  }

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <View className="rounded-2xl border border-line bg-surface p-4">
        {id ? <Text className="font-mono text-sm text-muted">{id}</Text> : null}
        <Text className={cn('font-sans text-muted', id && 'mt-2')}>{DEV_ROLE} · Not wired</Text>
      </View>
    </View>
  )
}
