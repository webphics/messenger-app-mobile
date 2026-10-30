import { memo, useCallback, useEffect, useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { cn } from '@/lib/cn'

type WaveformProps = {
  peaks: number[]
  /** 0..1 playback progress; omit while recording / idle. */
  progress?: number
  outgoing?: boolean
  className?: string
  /** Commit a skim (0..1). Called when the finger lifts, not while it moves. */
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
  const width = useSharedValue(0)
  /**
   * Where the finger is, or −1 when there is no finger.
   *
   * The bars read this rather than `progress` while a skim is happening, which
   * is what lets the strip follow the finger on the UI thread: `progress` is
   * React state fed by the player's status, and waiting for it would mean a
   * render — and a native `seekTo` — on every frame of the drag.
   */
  const scrub = useSharedValue(-1)
  const played = useSharedValue(progress ?? -1)
  // In an effect rather than during render: a write mid-reconciliation is
  // replayed by any re-render this component did not cause.
  useEffect(() => {
    played.set(progress ?? -1)
  }, [played, progress])

  const commit = useCallback(
    (ratio: number) => {
      onSeek?.(ratio)
    },
    [onSeek],
  )

  // A hook, so it exists whether or not there is anything to seek; `enabled`
  // and the detector below being left out are what make a plain strip plain.
  const gesture = usePanGesture({
    enabled: !!onSeek,
    minDistance: 0,
    onBegin: (e) => {
      if (width.get() <= 0) return
      scrub.set(clamp01Worklet(e.x / width.get()))
    },
    onUpdate: (e) => {
      // Shared value only — no `scheduleOnRN` here. A hop per frame is a
      // React render and a native seek per frame, which is exactly the
      // stutter this gesture is meant to avoid.
      if (width.get() <= 0) return
      scrub.set(clamp01Worklet(e.x / width.get()))
    },
    onDeactivate: () => {
      const at = scrub.get()
      if (at >= 0) scheduleOnRN(commit, at)
    },
    onFinalize: () => {
      // Held one frame past the commit would be cleaner still, but the
      // player's own `progress` lands within a frame or two and the bars
      // fall back to it — a flash of the old position is not worth a timer.
      scrub.set(-1)
    },
  })

  const strip = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        width.set(e.nativeEvent.layout.width)
      }}
      className={cn(
        'h-8 min-w-0 flex-1 flex-row items-center justify-between gap-[2px] overflow-hidden',
        className,
      )}
    >
      {bars.map((level, i) => {
        const at = bars.length <= 1 ? 0 : i / (bars.length - 1)
        // A strip nobody can skim — a bubble being played, the live recorder —
        // has nothing to follow a finger with, so it stays plain Views and
        // costs no worklets at all. Only a skimmable strip pays for them.
        return onSeek ? (
          <ScrubbableBar
            key={i}
            at={at}
            level={level}
            outgoing={outgoing}
            played={played}
            scrub={scrub}
          />
        ) : (
          <StaticBar
            key={i}
            level={level}
            outgoing={outgoing}
            played={progress != null && at <= progress}
          />
        )
      })}
    </View>
  )

  if (!onSeek) return strip

  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Voice note scrubber"
        onPress={(e) => {
          if (width.get() <= 0) return
          commit(clamp01(e.nativeEvent.locationX / width.get()))
        }}
        className="min-w-0 flex-1"
      >
        {strip}
      </Pressable>
    </GestureDetector>
  )
})

/**
 * One bar, coloured on the UI thread.
 *
 * Opacity rather than a colour swap: `backgroundColor` is two static classes
 * and the played state crossfades between them, so nothing here is a layout
 * pass and nothing waits for React.
 */
const ScrubbableBar = memo(function ScrubbableBar({
  at,
  level,
  outgoing,
  played,
  scrub,
}: {
  at: number
  level: number
  outgoing?: boolean
  played: SharedValue<number>
  scrub: SharedValue<number>
}) {
  const height = 4 + Math.round(clamp01(level) * 24)

  const playedStyle = useAnimatedStyle(() => {
    const head = scrub.get() >= 0 ? scrub.get() : played.get()
    return { opacity: head >= 0 && at <= head ? 1 : 0 }
  })

  return (
    <View className="w-[2.5px] shrink" style={{ height }}>
      <View
        className={cn(
          'absolute inset-0 rounded-full',
          outgoing ? 'bg-primary-foreground/35' : 'bg-ink/25',
        )}
      />
      <Animated.View
        style={playedStyle}
        className={cn(
          'absolute inset-0 rounded-full',
          outgoing ? 'bg-primary-foreground' : 'bg-primary',
        )}
      />
    </View>
  )
})

/** The same bar with no gesture over it: two classes, no worklet. */
const StaticBar = memo(function StaticBar({
  level,
  outgoing,
  played,
}: {
  level: number
  outgoing?: boolean
  played: boolean
}) {
  return (
    <View
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
      style={{ height: 4 + Math.round(clamp01(level) * 24) }}
    />
  )
})

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}

function clamp01Worklet(n: number): number {
  'worklet'
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}
