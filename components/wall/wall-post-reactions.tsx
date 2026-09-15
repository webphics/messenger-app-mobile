import { useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { SmilePlus } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { colors, screenBottomPad } from '@/lib/tokens'
import { WALL_REACT_EMOJIS } from '@/lib/wall-actions'
import { wallReactionChips } from '@/lib/wall-card'
import type { WallPostReaction } from '@/lib/types'

/**
 * The card's meta row: every reaction a Post has drawn, and the one thing a
 * reader may do about it.
 *
 * Reacting is the entire interaction surface of the Wall — a Post takes no
 * reply of any kind — so every chip is itself a toggle, including one that
 * already carries somebody else's reaction: tapping it reacts with that same
 * emoji, or clears the viewer's own if it was already there. The `React`
 * control opens the rest of the set, summoned rather than resident, because
 * six emoji sitting on every card is the loudest thing a Wall could draw and
 * the reader is there to read.
 *
 * Absent entirely when there is nothing to draw and nobody signed in to react
 * as — see `WallPostCard`, which only renders this once a viewer id exists.
 */

type WallPostReactionsProps = {
  reactions: WallPostReaction[]
  viewerId: string
  onToggle: (emoji: string) => void
}

export function WallPostReactions({ reactions, viewerId, onToggle }: WallPostReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const chips = wallReactionChips(reactions, viewerId)

  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-2',
        chips.length > 0 && 'border-t border-line/60 pt-3',
      )}
    >
      <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <TactilePressable
            key={chip.emoji}
            accessibilityRole="button"
            accessibilityLabel={
              chip.mine ? `Remove your ${chip.emoji} reaction` : `React with ${chip.emoji}`
            }
            accessibilityState={{ selected: chip.mine }}
            onPress={() => onToggle(chip.emoji)}
            className={cn(
              'h-8 flex-row items-center gap-1.5 rounded-full border px-2.5',
              chip.mine ? 'border-primary/30 bg-primary-soft' : 'border-line/70 bg-line/25',
            )}
          >
            <Text variant="meta">{chip.emoji}</Text>
            <Text
              variant="meta"
              className={cn('font-semibold tabular-nums', chip.mine ? 'text-primary' : 'text-ink-soft')}
            >
              {chip.count}
            </Text>
          </TactilePressable>
        ))}
      </View>

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel="React to this post"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => setPickerOpen(true)}
        className="size-9 shrink-0 items-center justify-center rounded-full"
      >
        <SmilePlus color={colors.muted} size={20} />
      </TactilePressable>

      <ReactionPicker
        visible={pickerOpen}
        chips={chips}
        onClose={() => setPickerOpen(false)}
        onPick={(emoji) => {
          onToggle(emoji)
          setPickerOpen(false)
        }}
      />
    </View>
  )
}

function ReactionPicker({
  visible,
  chips,
  onClose,
  onPick,
}: {
  visible: boolean
  chips: ReturnType<typeof wallReactionChips>
  onClose: () => void
  onPick: (emoji: string) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own Android window — see `WallPostActionsSheet` for why
          this needs its own SafeAreaProvider rather than the root's insets. */}
      <SafeAreaProvider>
        <PickerSheet chips={chips} onClose={onClose} onPick={onPick} />
      </SafeAreaProvider>
    </Modal>
  )
}

function PickerSheet({
  chips,
  onClose,
  onPick,
}: {
  chips: ReturnType<typeof wallReactionChips>
  onClose: () => void
  onPick: (emoji: string) => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 justify-end bg-black/40">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        className="rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
      >
        <View className="mb-4 h-1 w-10 self-center rounded-full bg-line" />
        <View className="flex-row items-center justify-between">
          {WALL_REACT_EMOJIS.map((emoji) => {
            const mine = chips.find((chip) => chip.emoji === emoji)?.mine ?? false
            return (
              <TactilePressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={mine ? `Remove ${emoji}` : `React with ${emoji}`}
                accessibilityState={{ selected: mine }}
                onPress={() => onPick(emoji)}
                className={cn('size-12 items-center justify-center rounded-full', mine && 'bg-primary-soft')}
              >
                <Text variant="display">{emoji}</Text>
              </TactilePressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}
