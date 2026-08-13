import { Plus, Send, X } from 'lucide-react-native'
import { Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'

type ComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  replyTo?: { name: string; body: string } | null
  onCancelReply?: () => void
}

export function Composer({
  value,
  onChangeText,
  onSend,
  replyTo,
  onCancelReply,
}: ComposerProps) {
  const insets = useSafeAreaInsets()
  const canSend = value.trim().length > 0
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0

  return (
    <View className="border-t border-line bg-surface" style={{ paddingBottom: bottom }}>
      {replyTo ? (
        <View className="flex-row items-center gap-2 px-4 pb-1 pt-2">
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-xs text-muted" numberOfLines={1}>
              Replying to {replyTo.name}
            </Text>
            <Text className="font-sans text-xs text-ink-soft" numberOfLines={1}>
              {replyTo.body}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            onPress={onCancelReply}
            className="size-8 items-center justify-center"
          >
            <X color={colors.muted} size={18} />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          onPress={() => undefined}
          className="mb-1 size-11 items-center justify-center rounded-full bg-bg"
        >
          <Plus color={colors.inkSoft} size={22} />
        </Pressable>
        <Input
          value={value}
          onChangeText={onChangeText}
          placeholder={replyTo ? 'Write a reply…' : 'Message…'}
          accessibilityLabel="Message"
          multiline
          className="max-h-28 min-h-11 flex-1 rounded-full border-line bg-bg px-4 py-2.5 shadow-none"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!canSend}
          onPress={onSend}
          className="mb-1 size-11 items-center justify-center rounded-full bg-primary"
          style={{ opacity: canSend ? 1 : 0.4 }}
        >
          <Send color="#FFFFFF" size={18} />
        </Pressable>
      </View>
    </View>
  )
}
