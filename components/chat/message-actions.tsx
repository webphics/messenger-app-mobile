import { Reply } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'

type MessageActionsProps = {
  onReply: () => void
}

export function MessageActions({ onReply }: MessageActionsProps) {
  return (
    <View className="flex-row items-center justify-around border-t border-line bg-surface px-4 py-2">
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
