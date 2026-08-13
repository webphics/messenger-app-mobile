import type { ReactNode } from 'react'
import { router } from 'expo-router'
import { Pressable, View } from 'react-native'

import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { DEV_ROLE } from '@/lib/mock-data'

type PlaceholderScreenProps = {
  chatHref?: `/chat/${string}`
  children?: ReactNode
}

export function PlaceholderScreen({ chatHref, children }: PlaceholderScreenProps) {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <View className="rounded-2xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-2">
          <Badge variant="secondary">
            <Text>{DEV_ROLE}</Text>
          </Badge>
          <Text className="font-sans text-muted">Not wired</Text>
        </View>
        {chatHref ? (
          <Pressable
            className="mt-6 min-h-11 justify-center"
            accessibilityRole="button"
            accessibilityLabel="Open sample chat"
            onPress={() => router.push(chatHref)}
          >
            <Text className="font-sans text-primary">Open sample chat</Text>
          </Pressable>
        ) : null}
        {children}
      </View>
    </View>
  )
}
