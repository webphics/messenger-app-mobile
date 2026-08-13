import { ChevronDown, ChevronUp } from 'lucide-react-native'
import { useState } from 'react'
import { FlatList, Pressable, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { FAQ_ITEMS } from '@/lib/mock-data'
import { colors } from '@/lib/tokens'

export function FaqList() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null)

  return (
    <FlatList
      className="flex-1 bg-bg"
      contentContainerClassName="px-4 py-4"
      data={FAQ_ITEMS}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View className="h-3" />}
      renderItem={({ item }) => {
        const open = item.id === openId
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpenId(open ? null : item.id)}
            className="rounded-2xl bg-surface p-4 shadow-sm shadow-black/5"
          >
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 font-sans text-base font-semibold text-ink">
                {item.question}
              </Text>
              {open ? (
                <ChevronUp color={colors.muted} size={20} />
              ) : (
                <ChevronDown color={colors.muted} size={20} />
              )}
            </View>
            {open ? (
              <Text className="mt-2 font-sans text-sm leading-5 text-ink-soft">{item.answer}</Text>
            ) : null}
          </Pressable>
        )
      }}
    />
  )
}
