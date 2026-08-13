import type { ReactNode } from 'react'
import { Link } from 'expo-router'
import { View } from 'react-native'

import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import type { UserRole } from '@/lib/types'

type PlaceholderScreenProps = {
  title: string
  role: UserRole
  chatHref?: '/chat/conv-assigned' | '/chat/conv-unassigned' | '/chat/conv-group'
  children?: ReactNode
}

export function PlaceholderScreen({
  title,
  role,
  chatHref,
  children,
}: PlaceholderScreenProps) {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="font-sans text-2xl font-semibold text-ink">{title}</Text>
      <View className="mt-3 flex-row items-center gap-2">
        <Badge variant="secondary">
          <Text>{role}</Text>
        </Badge>
        <Text className="font-sans text-muted">Not wired</Text>
      </View>
      {chatHref ? (
        <Link href={chatHref} className="mt-6">
          <Text className="font-sans text-primary">Open sample chat</Text>
        </Link>
      ) : null}
      {children}
    </View>
  )
}
