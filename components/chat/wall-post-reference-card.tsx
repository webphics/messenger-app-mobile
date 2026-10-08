import { memo } from 'react'
import { Image, Pressable, View } from 'react-native'

import { ChevronRight, Newspaper, X } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { resolveAttachmentUrl } from '@/lib/attachment-view'
import { cn } from '@/lib/cn'
import { colors } from '@/lib/tokens'
import type { MessageWallPost } from '@/lib/types'
import { wallKindColor, wallKindIsNamed, wallKindLabel } from '@/lib/wall-kind'
import { wallPostReferenceText } from '@/lib/message-wall-post'

type WallPostReferenceCardProps = {
  reference: MessageWallPost
  end: boolean
  onPress: (postId: string) => void
}

/**
 * The Post a Reply to a Post was sent about, drawn in the thread as a small copy
 * of its card on the Wall: the image it leads with, its kind, its title and a
 * few lines of it, and who posted it. One tap target, and the tap opens the Post.
 *
 * It sits above the bubble rather than inside it, the way media is its own
 * shape: it is the thing the message is about rather than words in it, and a
 * card on a primary fill would read as part of the sender's sentence.
 *
 * Drawn from the snapshot the message stored, so it still says what the sender
 * was looking at after the Post is edited or taken down. Whether this reader may
 * open it is judged when they do — the Post screen's own not-found state is what
 * a Post they cannot see leads to.
 */
export const WallPostReferenceCard = memo(function WallPostReferenceCard({
  reference,
  end,
  onPress,
}: WallPostReferenceCardProps) {
  const { headline, detail } = wallPostReferenceText(reference)
  const imageUri = reference.imageUrl ? resolveAttachmentUrl(reference.imageUrl) : null
  const named = wallKindIsNamed(reference.kind)

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Wall post by ${reference.authorName}: ${headline}`}
      accessibilityHint="Opens the post"
      onPress={() => onPress(reference.id)}
      className={cn(
        'w-64 max-w-full overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm shadow-black/8 active:opacity-80',
        end ? 'self-end' : 'self-start',
      )}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="h-32 w-full bg-line/40"
        />
      ) : (
        <View className="h-14 w-full items-center justify-center bg-primary-soft">
          <Newspaper color={colors.primary} size={22} />
        </View>
      )}

      <View className="gap-1 px-3 py-2.5">
        <View className="flex-row items-center gap-1.5">
          {named ? (
            <>
              <View
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: wallKindColor(reference.kind) }}
              />
              <Text
                variant="label"
                numberOfLines={1}
                className="shrink uppercase tracking-wider"
                style={{ color: wallKindColor(reference.kind) }}
              >
                {wallKindLabel(reference.kind)}
              </Text>
            </>
          ) : null}
          <Text variant="label" numberOfLines={1} className="ml-auto font-normal text-muted">
            Wall post
          </Text>
        </View>

        <Text variant="title" numberOfLines={2} className="text-ink">
          {headline}
        </Text>
        {detail ? (
          <Text variant="meta" numberOfLines={2} className="text-ink-soft">
            {detail}
          </Text>
        ) : null}

        <View className="flex-row items-center gap-2 pt-1">
          <Text variant="meta" numberOfLines={1} className="min-w-0 flex-1 text-muted">
            {reference.authorName}
          </Text>
          <View className="flex-row items-center">
            <Text variant="label" className="text-primary">
              View post
            </Text>
            <ChevronRight color={colors.primary} size={14} />
          </View>
        </View>
      </View>
    </Pressable>
  )
})

type WallPostReferenceStripProps = {
  reference: MessageWallPost
  onRemove: () => void
}

/**
 * The Post waiting in the composer to go with the next message, in the place
 * and the shape the reply strip takes: a thumbnail, what the Post is, and the
 * way to leave it out.
 */
export function WallPostReferenceStrip({ reference, onRemove }: WallPostReferenceStripProps) {
  const { headline } = wallPostReferenceText(reference)
  const imageUri = reference.imageUrl ? resolveAttachmentUrl(reference.imageUrl) : null

  return (
    <View className="flex-row items-center gap-2 border-b border-line/40 bg-primary-soft/40 px-4 py-2">
      <View className="w-1 self-stretch rounded-full bg-primary" />
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          className="size-9 rounded-lg bg-line/40"
        />
      ) : (
        <View className="size-9 items-center justify-center rounded-lg bg-primary-soft">
          <Newspaper color={colors.primary} size={16} />
        </View>
      )}
      <View className="min-w-0 flex-1 pl-1">
        <Text variant="label" className="font-bold text-primary" numberOfLines={1}>
          Replying to a post
        </Text>
        <Text variant="label" className="font-normal text-ink-soft" numberOfLines={1}>
          {headline}
        </Text>
      </View>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="Remove post from message"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onRemove}
        className="size-8 items-center justify-center rounded-full bg-surface"
      >
        <X color={colors.muted} size={16} />
      </TactilePressable>
    </View>
  )
}
