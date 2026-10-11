import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { easing } from '@/lib/motion-easing'
import { motion } from '@/lib/motion'
import type { Typist } from '@/lib/realtime-events'
import { typingLabel } from '@/lib/typing'

/** How far a dot lifts at the top of its hop. */
const HOP_PX = 3
/** Up, down, then a rest before the wave repeats. One cycle is 1.2s. */
const RISE_MS = 300
const FALL_MS = 300
const REST_MS = 600
/** Each dot starts a sixth of the cycle after the one before it, so the three read as a wave. */
const STAGGER_MS = 200

type TypingIndicatorProps = {
  typists: Typist[]
  isGroup: boolean
}

/**
 * The bubble above the composer while somebody else is writing.
 *
 * It is the inbound bubble's shell exactly (the radius, the tight bottom-left
 * corner, the border and the fill), sized to one line of body text, so it reads
 * as a message on its way rather than as chrome under the thread.
 *
 * A one-to-one thread has no words, so the dots carry the whole message; reduced
 * motion therefore freezes them at full strength instead of hiding them.
 */
export function TypingIndicator({ typists, isGroup }: TypingIndicatorProps) {
  const reduceMotion = useReducedMotion()
  if (typists.length === 0) return null

  const label = typingLabel(typists, isGroup)

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.durations.overlay)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.durations.feedback)}
      className="px-4 pb-2"
      accessibilityLiveRegion="polite"
      accessibilityLabel={label ?? 'Typing'}
    >
      <View className="max-w-[85%] flex-row items-center gap-2 self-start rounded-[22px] rounded-bl-md border border-line/70 bg-bubble-in px-4 py-2.5 shadow-sm shadow-black/8">
        {label ? (
          <Text variant="body" numberOfLines={1} className="min-w-0 shrink text-muted">
            {label}
          </Text>
        ) : null}
        {/* A line of body text tall, so a bare bubble is a one-line bubble. */}
        <View className="h-6 flex-row items-center gap-1" importantForAccessibility="no-hide-descendants">
          {[0, 1, 2].map((index) => (
            <TypingDot key={index} index={index} still={reduceMotion} />
          ))}
        </View>
      </View>
    </Animated.View>
  )
}

function TypingDot({ index, still }: { index: number; still: boolean }) {
  const lift = useSharedValue(0)

  useEffect(() => {
    if (still) {
      lift.set(0)
      return
    }
    // The delay sits outside the repeat, so it offsets the first hop only and
    // every later cycle keeps the same stagger.
    lift.set(
      withDelay(
        index * STAGGER_MS,
        withRepeat(
          withSequence(
            withTiming(1, { duration: RISE_MS, easing: easing.out }),
            withTiming(0, { duration: FALL_MS, easing: easing.inOut }),
            withTiming(0, { duration: REST_MS }),
          ),
          -1,
          false,
        ),
      ),
    )
  }, [index, lift, still])

  const style = useDotStyle(lift, still)
  return <Animated.View style={style} className="size-2 rounded-full bg-primary" />
}

function useDotStyle(lift: SharedValue<number>, still: boolean) {
  return useAnimatedStyle(() => {
    const value = lift.get()
    return {
      opacity: still ? 1 : 0.4 + value * 0.6,
      transform: [{ translateY: -HOP_PX * value }],
    }
  })
}
