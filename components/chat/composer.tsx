import { Plus, Send } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Input } from '@/components/ui/input'
import { colors } from '@/lib/tokens'

type ComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
}

export function Composer({ value, onChangeText, onSend }: ComposerProps) {
  const canSend = value.trim().length > 0

  return (
    <View className="flex-row items-end gap-2 border-t border-line bg-surface px-3 py-2">
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
        placeholder="Message…"
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
  )
}
