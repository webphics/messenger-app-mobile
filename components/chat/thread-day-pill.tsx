import { View } from 'react-native'

import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'

type ThreadDayPillProps = {
  /** Empty while the thread has drawn nothing, which is when the pill is not drawn either. */
  label: string
  onPress: () => void
}

/**
 * The day the reader is currently inside, floating over the thread.
 *
 * The thread already prints a divider between one day and the next, but a
 * divider only says what day it is at the moment it passes — read a hundred
 * messages down from it and nothing on screen says which day they are. This says
 * so continuously, and tapping it returns to where that day begins.
 *
 * It overlays the top of the list rather than taking a row in it: a row would
 * push the thread down and would scroll away with everything else, which is the
 * problem it exists to solve.
 */
export function ThreadDayPill({ label, onPress }: ThreadDayPillProps) {
  if (!label) return null

  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-2 items-center">
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`Jump to the start of ${label}`}
        onPress={onPress}
        className="min-h-8 justify-center rounded-full border border-line/60 bg-surface/95 px-3 py-1 shadow-lg shadow-black/10"
      >
        <Text variant="label" className="font-medium text-muted">
          {label}
        </Text>
      </TactilePressable>
    </View>
  )
}
