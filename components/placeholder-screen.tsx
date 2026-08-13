import type { ReactNode } from 'react'
import { View } from 'react-native'

import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { DEV_ROLE } from '@/lib/mock-data'

type PlaceholderScreenProps = {
  children?: ReactNode
}

export function PlaceholderScreen({ children }: PlaceholderScreenProps) {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <View className="rounded-2xl border border-line bg-surface p-4">
        <View className="flex-row items-center gap-2">
          <Badge variant="secondary">
            <Text>{DEV_ROLE}</Text>
          </Badge>
          <Text className="font-sans text-muted">Not wired</Text>
        </View>
        {children}
      </View>
    </View>
  )
}
