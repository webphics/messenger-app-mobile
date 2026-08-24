import { Play } from '@/components/icons'
import { View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'

import { cn } from '@/lib/cn'
import { colors } from '@/lib/tokens'

type VideoThumbProps = {
  uri: string
  /** Square edge, in dp. */
  size: number
  className?: string
  accessibilityLabel?: string
}

/**
 * Still poster for a video URI.
 *
 * RN's `<Image>` cannot decode mp4/mov on either platform, so any thumbnail for
 * a video has to come off a player surface. This player is created muted and
 * paused: it exists to hold frame zero, never to play. The badge is what makes
 * the tile read as video even before the first frame has decoded — or at all,
 * on a source the device cannot open.
 */
export function VideoThumb({
  uri,
  size,
  className,
  accessibilityLabel = 'Video',
}: VideoThumbProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true
    p.loop = false
    p.pause()
  })
  const badge = Math.max(16, Math.round(size * 0.36))

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}
      className={cn(
        'items-center justify-center overflow-hidden bg-ink',
        className,
      )}
    >
      <VideoView
        player={player}
        style={{ width: size, height: size }}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={{ width: badge, height: badge }}
        className="absolute items-center justify-center rounded-full bg-black/50"
      >
        <Play
          color={colors.primaryForeground}
          fill={colors.primaryForeground}
          size={Math.round(badge * 0.5)}
        />
      </View>
    </View>
  )
}
