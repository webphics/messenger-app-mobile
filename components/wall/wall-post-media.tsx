import { ActivityIndicator, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'

import { FileText } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { formatBytes } from '@/lib/attachments'
import { toWallAttachmentView } from '@/lib/attachment-view'
import { colors } from '@/lib/tokens'
import { useOpenDocument } from '@/lib/use-open-document'
import type { AttachmentView, WallPostAttachment } from '@/lib/types'

/**
 * What a Post carries beside the images it leads with.
 *
 * Rendered by kind rather than by guesswork, which is the whole of it: a video
 * is a player and a document is a row that opens in whatever on this device
 * reads it. The API's own three-way kind decides, so there is no MIME type to
 * misread and a kind this build does not know never arrives — `wall-parse` drops
 * it before a renderer sees one.
 */

/**
 * A clip, in a box whose height is known before it loads.
 *
 * Sixteen by nine rather than the track's own ratio: the card must not move
 * while the Wall scrolls, and a player that resizes itself once the source
 * resolves is exactly the jump a fixed box prevents. Letterboxing a portrait
 * clip inside it is the price, and it is the right way round — a still card with
 * bars beats a card that grows under a thumb.
 */
function WallVideo({ attachment }: { attachment: AttachmentView }) {
  const player = useVideoPlayer(attachment.uri, instance => {
    instance.loop = false
  })

  return (
    <View
      className="w-full overflow-hidden rounded-2xl bg-black"
      style={{ aspectRatio: 16 / 9 }}
      accessibilityLabel={`Video, ${attachment.name}`}
    >
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
    </View>
  )
}

/**
 * A document, as a row that opens it.
 *
 * Opening is `useOpenDocument`, the one this app already has: the file is
 * downloaded into the attachments cache and handed to whatever can read it. That
 * is also the answer to where a Post's bytes go — the same directory a thread's
 * documents use, under `Paths.cache`, which a Session end already clears and no
 * device backup reaches. Nothing about a Post is written to the app's document
 * directory.
 */
function WallDocument({ attachment }: { attachment: AttachmentView }) {
  const { open, opening } = useOpenDocument(attachment)
  const size = attachment.size == null ? null : formatBytes(attachment.size)

  return (
    <TactilePressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name}${size ? `, ${size}` : ''}`}
      accessibilityState={{ busy: opening }}
      onPress={open}
      className="min-h-14 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-line/35 px-3.5 py-3"
    >
      <View className="size-9 items-center justify-center rounded-xl bg-primary-soft">
        {opening ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <FileText color={colors.primary} size={18} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="title" numberOfLines={1} className="text-ink">
          {attachment.name}
        </Text>
        <Text variant="meta" className="text-muted">
          {opening ? 'Opening…' : (size ?? 'Document')}
        </Text>
      </View>
    </TactilePressable>
  )
}

export function WallPostMedia({
  videos,
  documents,
}: {
  videos: WallPostAttachment[]
  documents: WallPostAttachment[]
}) {
  if (videos.length === 0 && documents.length === 0) return null

  return (
    <View className="gap-2">
      {videos.map(video => (
        <WallVideo key={video.url} attachment={toWallAttachmentView(video)} />
      ))}
      {documents.map(document => (
        <WallDocument key={document.url} attachment={toWallAttachmentView(document)} />
      ))}
    </View>
  )
}
