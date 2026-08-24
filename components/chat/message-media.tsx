import { FileText } from '@/components/icons'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Image,
  Linking,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import * as Sharing from 'expo-sharing'

import { ImagePreviewModal } from '@/components/chat/image-preview-modal'
import { VoiceNotePlayer } from '@/components/chat/voice-note-player'
import { Text } from '@/components/ui/text'
import { formatBytes } from '@/lib/attachments'
import { fitImageSize, mediaCaptionColumnWidth } from '@/lib/image-layout'
import { cn } from '@/lib/cn'
import { attachmentKindLabel } from '@/lib/message-attachment'
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
      <ImageAttachment
        uri={attachment.uri}
        name={attachment.name}
        outgoing={outgoing}
        caption={caption}
      />
    )
  }
  if (attachment.kind === 'video') {
    return (
      <VideoAttachment
        uri={attachment.uri}
        name={attachment.name}
        outgoing={outgoing}
        caption={caption}
      />
    )
  }
  if (attachment.kind === 'audio') {
    return (
      <MediaShell outgoing={outgoing} caption={caption}>
        <VoiceNotePlayer attachment={attachment} outgoing={outgoing} />
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
}: {
  children: React.ReactNode
  outgoing: boolean
  caption?: string
}) {
  const trimmed = caption?.trim()
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

function CaptionBubble({
  text,
  outgoing,
  width,
}: {
  text: string
  outgoing: boolean
  width: number
}) {
  return (
    <View
      style={{ width }}
      className={cn(
        'mt-1.5 rounded-[18px] px-3 py-2',
        outgoing
          ? 'rounded-br-md bg-primary'
          : 'rounded-bl-md border border-line/70 bg-bubble-in',
      )}
    >
      <Text
        variant="body"
        className={outgoing ? 'text-primary-foreground' : 'text-ink'}
      >
        {text}
      </Text>
    </View>
  )
}

function ImageAttachment({
  uri,
  name,
  outgoing,
  caption,
}: {
  uri: string
  name: string
  outgoing: boolean
  caption?: string
}) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const maxW = Math.min(300, Math.round(screenW * 0.74))
  const maxH = Math.min(Math.round(screenH * 0.48), Math.round(maxW * 1.45))
  const [box, setBox] = useState(() => fitImageSize(0, 0, maxW, maxH))
  const [previewOpen, setPreviewOpen] = useState(false)
  const trimmed = caption?.trim() ?? ''
  const hasCaption = trimmed.length > 0
  const columnW = mediaCaptionColumnWidth(box.width, maxW, hasCaption)

  useEffect(() => {
    let cancelled = false
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled) return
        setBox(fitImageSize(w, h, maxW, maxH))
      },
      () => {
        if (cancelled) return
        setBox(fitImageSize(0, 0, maxW, maxH))
      },
    )
    return () => {
      cancelled = true
    }
  }, [uri, maxW, maxH])

  return (
    <View style={{ width: columnW, minWidth: columnW }}>
      <View className={cn(outgoing ? 'items-end' : 'items-start')}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name ? `View ${name}` : 'View photo'}
          onPress={() => setPreviewOpen(true)}
        >
          <Image
            source={{ uri }}
            accessibilityLabel={name || 'Photo'}
            className="rounded-[18px] bg-line/40"
            style={{ width: box.width, height: box.height }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
      {hasCaption ? (
        <CaptionBubble text={trimmed} outgoing={outgoing} width={columnW} />
      ) : null}
      <ImagePreviewModal
        uri={uri}
        name={name}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  )
}

function VideoAttachment({
  uri,
  name,
  outgoing,
  caption,
}: {
  uri: string
  name: string
  outgoing: boolean
  caption?: string
}) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const maxW = Math.min(300, Math.round(screenW * 0.74))
  const maxH = Math.min(Math.round(screenH * 0.48), Math.round(maxW * 1.45))
  const box = fitImageSize(16, 9, maxW, maxH)
  const trimmed = caption?.trim() ?? ''
  const hasCaption = trimmed.length > 0
  const columnW = mediaCaptionColumnWidth(box.width, maxW, hasCaption)
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
  })

  return (
    <View style={{ width: columnW, minWidth: columnW }}>
      <View className={cn(outgoing ? 'items-end' : 'items-start')}>
        <View className="overflow-hidden rounded-[18px] bg-ink">
          <VideoView
            player={player}
            style={{ width: box.width, height: box.height }}
            contentFit="contain"
            nativeControls
            accessibilityLabel={name || 'Video'}
          />
        </View>
      </View>
      {hasCaption ? (
        <CaptionBubble text={trimmed} outgoing={outgoing} width={columnW} />
      ) : null}
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
