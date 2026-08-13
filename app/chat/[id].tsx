import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { DEV_ROLE } from '@/lib/mock-data'

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="font-mono text-sm text-muted">{id}</Text>
      <Text className="mt-2 font-sans text-2xl font-semibold text-ink">Thread</Text>
      <Text className="mt-2 font-sans text-muted">{DEV_ROLE} · Not wired</Text>
    </View>
  )
}
