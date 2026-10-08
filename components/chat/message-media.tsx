import { AlertCircle, FileText, RotateCcw } from '@/components/icons'
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, View, useWindowDimensions } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'

import { ImagePreviewModal } from '@/components/chat/image-preview-modal'
import { VoiceNotePlayer } from '@/components/chat/voice-note-player'
import { LinkedText, linkTint } from '@/components/ui/linked-text'
import { Text } from '@/components/ui/text'
import { formatBytes } from '@/lib/attachments'
import { fitImageSize, mediaCaptionColumnWidth } from '@/lib/image-layout'
import { cn } from '@/lib/cn'
import { attachmentKindLabel } from '@/lib/message-attachment'
import { useOpenDocument } from '@/lib/use-open-document'
import { colors } from '@/lib/tokens'
import type { AttachmentView } from '@/lib/types'

type MessageMediaProps = {
  attachment: AttachmentView
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
        naturalWidth={attachment.width}
        naturalHeight={attachment.height}
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
          <LinkedText text={trimmed} linkClassName={linkTint(outgoing)} />
        </Text>
      ) : null}
    </View>
  )
}

/**
 * A photo or a clip that would not load.
 *
 * Media that cannot be fetched is the one failure this screen used to keep to
 * itself: an `<Image>` whose request fails renders nothing, which is a grey
 * rounded rectangle exactly the shape of a photo that has not arrived yet, and
 * waiting forever is indistinguishable from being broken. So it says so, and
 * offers the only thing that helps — asking again, for the connection that has
 * come back since.
 *
 * Sized to the box the media would have taken, so nothing jumps when it fails.
 */
function MediaLoadFailure({
  kind,
  width,
  height,
  onRetry,
}: {
  kind: 'image' | 'video'
  width: number
  height: number
  onRetry: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kind === 'image' ? 'Photo' : 'Video'} could not be loaded. Tap to try again.`}
      accessibilityLiveRegion="polite"
      onPress={onRetry}
      style={{ width, height }}
      className="items-center justify-center gap-1.5 rounded-[18px] border border-line/70 bg-line/25 px-4 active:opacity-70"
    >
      <AlertCircle color={colors.muted} size={20} />
      <Text variant="label" className="text-center text-muted">
        {kind === 'image' ? 'Photo could not load' : 'Video could not load'}
      </Text>
      <View className="flex-row items-center gap-1">
        <RotateCcw color={colors.primary} size={11} />
        <Text variant="label" className="font-medium text-primary">
          Try again
        </Text>
      </View>
    </Pressable>
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
        <LinkedText text={text} linkClassName={linkTint(outgoing)} />
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
  const [failed, setFailed] = useState(false)
  /**
   * Bumped by a retry, and part of the `<Image>` key, which is what makes the
   * platform fetch again rather than answer from the failure it cached.
   */
  const [attempt, setAttempt] = useState(0)
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
        // The size is unknown, not the image: a placeholder box is the right
        // answer, and whether the image itself arrives is `onError`'s to say.
        setBox(fitImageSize(0, 0, maxW, maxH))
      },
    )
    return () => {
      cancelled = true
    }
  }, [uri, maxW, maxH, attempt])

  const retry = useCallback(() => {
    setFailed(false)
    setAttempt((n) => n + 1)
  }, [])

  return (
    <View style={{ width: columnW, minWidth: columnW }}>
      <View className={cn(outgoing ? 'items-end' : 'items-start')}>
        {failed ? (
          <MediaLoadFailure
            kind="image"
            width={box.width}
            height={box.height}
            onRetry={retry}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name ? `View ${name}` : 'View photo'}
            onPress={() => setPreviewOpen(true)}
          >
            <Image
              key={attempt}
              source={{ uri }}
              accessibilityLabel={name || 'Photo'}
              className="rounded-[18px] bg-line/40"
              style={{ width: box.width, height: box.height }}
              resizeMode="cover"
              onError={() => setFailed(true)}
            />
          </Pressable>
        )}
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
  naturalWidth,
  naturalHeight,
  outgoing,
  caption,
}: {
  uri: string
  name: string
  naturalWidth?: number
  naturalHeight?: number
  outgoing: boolean
  caption?: string
}) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const maxW = Math.min(300, Math.round(screenW * 0.74))
  const maxH = Math.min(Math.round(screenH * 0.48), Math.round(maxW * 1.45))
  const trimmed = caption?.trim() ?? ''
  const hasCaption = trimmed.length > 0
  const [failed, setFailed] = useState(false)
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
  })
  // Videos have no `Image.getSize`. The picker's report is the size we have at
  // first paint; the loaded track is authoritative once it arrives. Assuming
  // 16:9 letterboxes every portrait phone video into a thin strip.
  const [natural, setNatural] = useState<{ width: number; height: number }>(
    () => ({ width: naturalWidth ?? 0, height: naturalHeight ?? 0 }),
  )

  useEffect(() => {
    const track = player.videoTrack
    if (track?.size?.width && track.size.height) {
      // Catching up on a size the player already resolved before this listener
      // attached, not a render-driven update: the effect is keyed on `player`
      // and the write is guarded, so it corrects once and cannot cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNatural({ width: track.size.width, height: track.size.height })
    }
    const sub = player.addListener('sourceLoad', ({ availableVideoTracks }) => {
      setFailed(false)
      const size = availableVideoTracks[0]?.size
      if (size?.width && size.height) {
        setNatural({ width: size.width, height: size.height })
      }
    })
    // A source that will not load leaves `VideoView` showing a black rectangle
    // and its controls doing nothing, which reads as a broken player rather than
    // as a fetch that failed. The player is the only thing that knows.
    const failure = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') setFailed(true)
    })
    return () => {
      sub.remove()
      failure.remove()
    }
  }, [player])

  const retry = useCallback(() => {
    setFailed(false)
    player.replace(uri)
  }, [player, uri])

  const box = fitImageSize(natural.width, natural.height, maxW, maxH)
  const columnW = mediaCaptionColumnWidth(box.width, maxW, hasCaption)

  return (
    <View style={{ width: columnW, minWidth: columnW }}>
      <View className={cn(outgoing ? 'items-end' : 'items-start')}>
        {failed ? (
          <MediaLoadFailure
            kind="video"
            width={box.width}
            height={box.height}
            onRetry={retry}
          />
        ) : (
          <View className="overflow-hidden rounded-[18px] bg-ink">
            <VideoView
              player={player}
              style={{ width: box.width, height: box.height }}
              contentFit="contain"
              nativeControls
              accessibilityLabel={name || 'Video'}
            />
          </View>
        )}
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
  attachment: AttachmentView
  outgoing: boolean
}) {
  const size = formatBytes(attachment.size)
  const { open, opening } = useOpenDocument(attachment)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name || attachmentKindLabel('document')}`}
      accessibilityState={{ busy: opening }}
      onPress={open}
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
        {opening || size ? (
          <Text
            variant="label"
            className={cn(
              'mt-0.5 font-normal',
              outgoing ? 'text-primary-foreground/70' : 'text-muted',
            )}
          >
            {/* The size line doubles as the progress line: a document opens by
                being downloaded, and a row that says nothing while that happens
                reads as a tap that did not register. */}
            {opening ? 'Opening…' : size}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
