import { Reply } from 'lucide-react-native'
import { Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'

type MessageActionsProps = {
  onReply: () => void
}

export function MessageActions({ onReply }: MessageActionsProps) {
  const insets = useSafeAreaInsets()
  const bottom = Platform.OS === 'ios' ? insets.bottom : 0

  return (
    <View
      className="flex-row items-center justify-around border-t border-line bg-surface px-4 py-2"
      style={{ paddingBottom: bottom }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reply"
        onPress={onReply}
        className="items-center gap-1 px-6 py-1"
      >
        <Reply color={colors.primary} size={22} />
        <Text className="font-sans text-xs font-medium text-primary">Reply</Text>
      </Pressable>
    </View>
  )
}
