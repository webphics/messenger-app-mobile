import { memo, useCallback, useMemo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

import { cn } from '@/lib/cn'

type WaveformProps = {
  peaks: number[]
  /** 0..1 playback progress; omit while recording / idle. */
  progress?: number
  outgoing?: boolean
  className?: string
  /** Tap/drag along the strip to skim (0..1). */
  onSeek?: (progress: number) => void
}

/** Fixed-height bar strip for voice notes (record + bubble + staging). */
export const Waveform = memo(function Waveform({
  peaks,
  progress,
  outgoing,
  className,
  onSeek,
}: WaveformProps) {
  const bars = useMemo(
    () => (peaks.length > 0 ? peaks : [0.2, 0.35, 0.2]),
    [peaks],
  )
  const widthRef = useRef(0)

  const seekFromX = useCallback(
    (x: number) => {
      if (!onSeek || widthRef.current <= 0) return
      onSeek(clamp01(x / widthRef.current))
    },
    [onSeek],
  )

  const gesture = useMemo(() => {
    if (!onSeek) return null
    return Gesture.Pan()
      .minDistance(0)
      .onBegin((e) => {
        runOnJS(seekFromX)(e.x)
      })
      .onUpdate((e) => {
        runOnJS(seekFromX)(e.x)
      })
  }, [onSeek, seekFromX])

  const strip = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width
      }}
      className={cn(
        'h-8 min-w-0 flex-1 flex-row items-center justify-between gap-[2px] overflow-hidden',
        className,
      )}
    >
      {bars.map((level, i) => {
        const t = bars.length <= 1 ? 0 : i / (bars.length - 1)
        const played = progress != null && t <= progress
        const height = 4 + Math.round(clamp01(level) * 24)
        return (
          <View
            key={i}
            className={cn(
              'w-[2.5px] shrink rounded-full',
              played
                ? outgoing
                  ? 'bg-primary-foreground'
                  : 'bg-primary'
                : outgoing
                  ? 'bg-primary-foreground/35'
                  : 'bg-ink/25',
            )}
            style={{ height }}
          />
        )
      })}
    </View>
  )

  if (!gesture) return strip

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Voice note scrubber"
        onPress={(e) => seekFromX(e.nativeEvent.locationX)}
        className="min-w-0 flex-1"
      >
        {strip}
      </Pressable>
    </GestureDetector>
  )
})

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}
