import { Pause, Play, X } from '@/components/icons'
import { useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'

import { Waveform } from '@/components/chat/waveform'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { formatDurationMs } from '@/lib/message-attachment'
import { colors } from '@/lib/tokens'
import type { AttachmentView } from '@/lib/types'

type VoiceNotePlayerProps = {
  attachment: AttachmentView
  /** Bubble chrome (outgoing primary vs incoming). Composer staging uses false. */
  outgoing?: boolean
  /** Composer preview: slightly tighter + optional clear. */
  compact?: boolean
  onClear?: () => void
}

/**
 * Playable / pausable / skimmable Voice note control.
 * Used in thread bubbles and composer staging — not the document chip.
 */
export function VoiceNotePlayer({
  attachment,
  outgoing = false,
  compact = false,
  onClear,
}: VoiceNotePlayerProps) {
  const player = useAudioPlayer(attachment.uri)
  const status = useAudioPlayerStatus(player)
  const peaks = attachment.peaks ?? [0.2, 0.45, 0.3, 0.6, 0.25]
  const durationMs =
    attachment.durationMs ??
    (status.duration > 0 ? Math.round(status.duration * 1000) : 0)
  const progress =
    status.duration > 0 ? status.currentTime / status.duration : 0
  const playing = status.playing

  const toggle = useCallback(() => {
    if (playing) {
      player.pause()
      return
    }
    if (status.currentTime >= status.duration && status.duration > 0) {
      player.seekTo(0)
    }
    player.play()
  }, [player, playing, status.currentTime, status.duration])

  const seek = useCallback(
    (ratio: number) => {
      if (status.duration <= 0) return
      player.seekTo(ratio * status.duration)
    },
    [player, status.duration],
  )

  const displayMs =
    playing || status.currentTime > 0.05
      ? status.currentTime * 1000
      : durationMs

  return (
    <View
      className={cn(
        'relative flex-row items-center gap-2',
        compact
          ? 'min-w-[13rem] max-w-full rounded-xl border border-line/70 bg-surface py-1.5 pl-1.5 pr-8'
          : 'min-w-[200px]',
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        onPress={toggle}
        className={cn(
          'shrink-0 items-center justify-center rounded-full',
          compact ? 'size-9' : 'size-10',
          outgoing ? 'bg-primary-foreground/20' : 'bg-primary-soft',
        )}
      >
        {playing ? (
          <Pause
            color={outgoing ? colors.primaryForeground : colors.primary}
            size={compact ? 16 : 18}
          />
        ) : (
          <Play
            color={outgoing ? colors.primaryForeground : colors.primary}
            size={compact ? 16 : 18}
          />
        )}
      </Pressable>
      <Waveform
        peaks={peaks}
        progress={progress}
        outgoing={outgoing}
        onSeek={seek}
        className={cn('min-w-0 flex-1', compact ? 'h-7' : undefined)}
      />
      <Text
        variant="label"
        className={cn(
          'w-10 shrink-0 text-right font-medium tabular-nums',
          outgoing ? 'text-primary-foreground/80' : 'text-muted',
        )}
      >
        {formatDurationMs(displayMs)}
      </Text>
      {onClear ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove voice note"
          hitSlop={8}
          onPress={onClear}
          className="absolute -right-1.5 -top-1.5 size-6 items-center justify-center rounded-full border border-line bg-surface shadow-sm"
        >
          <X color={colors.inkSoft} size={14} />
        </Pressable>
      ) : null}
    </View>
  )
}
