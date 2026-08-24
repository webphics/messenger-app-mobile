import { memo, useMemo } from 'react'
import { View } from 'react-native'

import { cn } from '@/lib/cn'

type WaveformProps = {
  peaks: number[]
  /** 0..1 playback progress; omit while recording / idle. */
  progress?: number
  outgoing?: boolean
  className?: string
}

/** Fixed-height bar strip for voice notes (record + bubble). */
export const Waveform = memo(function Waveform({
  peaks,
  progress,
  outgoing,
  className,
}: WaveformProps) {
  const bars = useMemo(() => (peaks.length > 0 ? peaks : [0.2, 0.35, 0.2]), [peaks])

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
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
})

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}
