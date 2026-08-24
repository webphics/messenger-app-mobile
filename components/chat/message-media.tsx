import { FileText, Pause, Play } from '@/components/icons'
import { useCallback } from 'react'
import {
  Alert,
  Image,
  Linking,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as Sharing from 'expo-sharing'

import { Waveform } from '@/components/chat/waveform'
import { Text } from '@/components/ui/text'
import { formatBytes } from '@/lib/attachments'
import { cn } from '@/lib/cn'
import {
  attachmentKindLabel,
  formatDurationMs,
} from '@/lib/message-attachment'
import { colors } from '@/lib/tokens'
import type { MessageAttachment } from '@/lib/types'

type MessageMediaProps = {
  attachment: MessageAttachment
  outgoing: boolean
  caption?: string
}

export function MessageMedia({
  attachment,
  outgoing,
  caption,
}: MessageMediaProps) {
  if (attachment.kind === 'image') {
    return (
      <MediaShell outgoing={outgoing} caption={caption} borderless>
        <ImageAttachment uri={attachment.uri} name={attachment.name} />
      </MediaShell>
    )
  }
  if (attachment.kind === 'video') {
    return (
      <MediaShell outgoing={outgoing} caption={caption} borderless>
        <VideoAttachment uri={attachment.uri} name={attachment.name} />
      </MediaShell>
    )
  }
  if (attachment.kind === 'audio') {
    return (
      <MediaShell outgoing={outgoing} caption={caption}>
        <VoiceAttachment attachment={attachment} outgoing={outgoing} />
      </MediaShell>
    )
  }
  return (
    <MediaShell outgoing={outgoing} caption={caption}>
      <DocumentAttachment attachment={attachment} outgoing={outgoing} />
    </MediaShell>
  )
}

function MediaShell({
  children,
  outgoing,
  caption,
  borderless,
}: {
  children: React.ReactNode
  outgoing: boolean
  caption?: string
  borderless?: boolean
}) {
  const trimmed = caption?.trim()
  if (borderless) {
    return (
      <View className={cn('overflow-hidden', outgoing ? 'items-end' : 'items-start')}>
        {children}
        {trimmed ? (
          <View
            className={cn(
              'mt-1.5 max-w-full rounded-[18px] px-3 py-2',
              outgoing
                ? 'self-end rounded-br-md bg-primary'
                : 'self-start rounded-bl-md border border-line/70 bg-bubble-in',
            )}
          >
            <Text
              variant="body"
              className={outgoing ? 'text-primary-foreground' : 'text-ink'}
            >
              {trimmed}
            </Text>
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View>
      {children}
      {trimmed ? (
        <Text
          variant="body"
          className={cn(
            'mt-1.5',
            outgoing ? 'text-primary-foreground' : 'text-ink',
          )}
        >
          {trimmed}
        </Text>
      ) : null}
    </View>
  )
}

function ImageAttachment({ uri, name }: { uri: string; name: string }) {
  const { width } = useWindowDimensions()
  const maxW = Math.min(280, width * 0.72)
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={name || 'Photo'}
      className="rounded-[18px] bg-line/40"
      style={{ width: maxW, height: maxW * 0.75 }}
      resizeMode="cover"
    />
  )
}

function VideoAttachment({ uri, name }: { uri: string; name: string }) {
  const { width } = useWindowDimensions()
  const maxW = Math.min(280, width * 0.72)
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
  })

  return (
    <View className="overflow-hidden rounded-[18px] bg-ink">
      <VideoView
        player={player}
        style={{ width: maxW, height: maxW * 0.75 }}
        contentFit="cover"
        nativeControls
        accessibilityLabel={name || 'Video'}
      />
    </View>
  )
}

function VoiceAttachment({
  attachment,
  outgoing,
}: {
  attachment: MessageAttachment
  outgoing: boolean
}) {
  const player = useAudioPlayer(attachment.uri)
  const status = useAudioPlayerStatus(player)
  const peaks = attachment.peaks ?? [0.2, 0.45, 0.3, 0.6, 0.25]
  const duration =
    attachment.durationMs ??
    (status.duration > 0 ? status.duration * 1000 : 0)
  const progress =
    status.duration > 0 ? status.currentTime / status.duration : 0
  const playing = status.playing

  const toggle = useCallback(() => {
    if (playing) {
      player.pause()
    } else {
      if (status.currentTime >= status.duration && status.duration > 0) {
        player.seekTo(0)
      }
      player.play()
    }
  }, [player, playing, status.currentTime, status.duration])

  return (
    <View className="min-w-[200px] flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        onPress={toggle}
        className={cn(
          'size-10 shrink-0 items-center justify-center rounded-full',
          outgoing ? 'bg-primary-foreground/20' : 'bg-primary-soft',
        )}
      >
        {playing ? (
          <Pause
            color={outgoing ? colors.primaryForeground : colors.primary}
            size={18}
          />
        ) : (
          <Play
            color={outgoing ? colors.primaryForeground : colors.primary}
            size={18}
          />
        )}
      </Pressable>
      <Waveform
        peaks={peaks}
        progress={progress}
        outgoing={outgoing}
        className="min-w-0 flex-1"
      />
      <Text
        variant="label"
        className={cn(
          'w-10 shrink-0 text-right font-medium tabular-nums',
          outgoing ? 'text-primary-foreground/80' : 'text-muted',
        )}
      >
        {formatDurationMs(
          playing || status.currentTime > 0
            ? status.currentTime * 1000
            : duration,
        )}
      </Text>
    </View>
  )
}

function DocumentAttachment({
  attachment,
  outgoing,
}: {
  attachment: MessageAttachment
  outgoing: boolean
}) {
  const size = formatBytes(attachment.size)

  const open = useCallback(async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(attachment.uri)
        return
      }
      const can = await Linking.canOpenURL(attachment.uri)
      if (can) {
        await Linking.openURL(attachment.uri)
        return
      }
      Alert.alert('Cannot open file', 'No app is available to open this document.')
    } catch {
      Alert.alert('Cannot open file', 'Something went wrong opening this document.')
    }
  }, [attachment.uri])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name || attachmentKindLabel('document')}`}
      onPress={() => void open()}
      className="min-w-[180px] flex-row items-center gap-3"
    >
      <View
        className={cn(
          'size-11 items-center justify-center rounded-2xl',
          outgoing ? 'bg-primary-foreground/20' : 'bg-primary-soft',
        )}
      >
        <FileText
          color={outgoing ? colors.primaryForeground : colors.primary}
          size={22}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text
          variant="meta"
          numberOfLines={1}
          className={cn(
            'font-semibold',
            outgoing ? 'text-primary-foreground' : 'text-ink',
          )}
        >
          {attachment.name || 'Document'}
        </Text>
        {size ? (
          <Text
            variant="label"
            className={cn(
              'mt-0.5 font-normal',
              outgoing ? 'text-primary-foreground/70' : 'text-muted',
            )}
          >
            {size}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
