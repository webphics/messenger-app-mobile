import { useState } from 'react'
import { Image, View } from 'react-native'

import { ImagePreviewModal } from '@/components/chat/image-preview-modal'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { toWallAttachmentView } from '@/lib/attachment-view'
import { wallCollage, type WallCollage } from '@/lib/wall-card'
import type { WallPostAttachment } from '@/lib/types'

/**
 * The images a Post leads with, as a collage rather than a stack.
 *
 * Cells crop, which is what makes four images read as one composition instead of
 * four loose pictures — and cropping is only honest because every cell opens the
 * image whole. The preview is the collage's other half, not an extra.
 *
 * The ratio sits on the wrapper rather than on the cells, and that is what keeps
 * the card still: the collage occupies its final height before a single image
 * has decoded, so a Post never grows under the reader's thumb while the Wall
 * loads. Which ratio, and which images are drawn, is `lib/wall-card` — this is
 * only the grid the answer becomes.
 *
 * No corner of its own: it is the card's first child and fills the top of it, so
 * the rounding it wants is the card's, which the card's own `overflow-hidden`
 * already applies.
 */

/** One cell: the image, and the `+N` over the last one where images were folded away. */
function Cell({
  image,
  hiddenCount,
  onPress,
  className,
}: {
  image: WallPostAttachment
  hiddenCount: number
  onPress: () => void
  className?: string
}) {
  const view = toWallAttachmentView(image)

  return (
    <TactilePressable
      accessibilityRole="imagebutton"
      accessibilityLabel={
        hiddenCount > 0 ? `Open ${view.name}, and ${hiddenCount} more` : `Open ${view.name}`
      }
      activeScale={1}
      onPress={onPress}
      className={className}
      style={{ flex: 1 }}
    >
      <View className="size-full bg-line">
        <Image source={{ uri: view.uri }} resizeMode="cover" className="size-full" />
        {hiddenCount > 0 ? (
          <View // `bg-black`, not `bg-ink`: ink inverts with the theme, so a scrim
          // built from it becomes a white veil the moment the app goes dark.
          className="absolute inset-0 items-center justify-center bg-black/55">
            {/* Not a heading variant: a count over a photo is not a heading,
                and `Text`'s display and title roles say so to a screen reader. */}
            <Text className="text-xl font-bold text-primary-foreground tabular-nums">
              +{hiddenCount}
            </Text>
          </View>
        ) : null}
      </View>
    </TactilePressable>
  )
}

/**
 * Where each shape puts its cells. Which shape it is, and why there are four of
 * them rather than one responsive grid, is `wallCollage`'s.
 */
function Grid({
  collage,
  onOpen,
}: {
  collage: WallCollage
  onOpen: (index: number) => void
}) {
  const [first, second, third, fourth] = collage.visible
  const last = collage.visible.length - 1
  const hidden = (index: number) => (index === last ? collage.overflowCount : 0)

  if (!first) return null

  const lead = <Cell image={first} hiddenCount={hidden(0)} onPress={() => onOpen(0)} />

  if (collage.kind === 'pair' && second) {
    return (
      <View className="flex-1 flex-row gap-0.5">
        {lead}
        <Cell image={second} hiddenCount={hidden(1)} onPress={() => onOpen(1)} />
      </View>
    )
  }

  if (collage.kind === 'feature' && second && third) {
    return (
      <View className="flex-1 flex-row gap-0.5">
        <View className="flex-[2]">{lead}</View>
        <View className="flex-1 gap-0.5">
          <Cell image={second} hiddenCount={hidden(1)} onPress={() => onOpen(1)} />
          <Cell image={third} hiddenCount={hidden(2)} onPress={() => onOpen(2)} />
        </View>
      </View>
    )
  }

  if (second && third && fourth) {
    return (
      <View className="flex-1 gap-0.5">
        <View className="flex-1 flex-row gap-0.5">
          {lead}
          <Cell image={second} hiddenCount={hidden(1)} onPress={() => onOpen(1)} />
        </View>
        <View className="flex-1 flex-row gap-0.5">
          <Cell image={third} hiddenCount={hidden(2)} onPress={() => onOpen(2)} />
          <Cell image={fourth} hiddenCount={hidden(3)} onPress={() => onOpen(3)} />
        </View>
      </View>
    )
  }

  // `single`, and the answer for any shape whose cells did not all arrive.
  return lead
}

export function WallPostCollage({ images }: { images: WallPostAttachment[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const collage = wallCollage(images)

  if (!collage) return null

  // The preview moves through every image, including the ones the collage
  // folded into its `+N`: the collage is how the set was summarised, not what
  // the set is.
  const open = openIndex === null ? null : images[openIndex]
  const openView = open ? toWallAttachmentView(open) : null

  return (
    <>
      <View className="w-full bg-line" style={{ aspectRatio: collage.aspectRatio }}>
        <Grid collage={collage} onOpen={setOpenIndex} />
      </View>

      <ImagePreviewModal
        visible={openView !== null}
        uri={openView?.uri ?? ''}
        name={openView?.name}
        onClose={() => setOpenIndex(null)}
      />
    </>
  )
}
