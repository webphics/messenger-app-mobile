import { memo } from 'react'
import { View } from 'react-native'
import { EmojiKeyboard, type EmojiType } from 'rn-emoji-keyboard'

import { colors } from '@/lib/tokens'

/** What the panel stands at before a keyboard has ever been measured on this device. */
export const EMOJI_PANEL_FALLBACK_HEIGHT = 300

const THEME = {
  container: colors.surface,
  header: colors.muted,
  knob: colors.line,
  skinTonesContainer: colors.bg,
  category: {
    icon: colors.muted,
    iconActive: colors.primary,
    container: colors.surface,
    containerActive: colors.primarySoft,
  },
  search: {
    background: colors.bg,
    text: colors.ink,
    placeholder: colors.muted,
    icon: colors.muted,
  },
  emoji: { selected: colors.primarySoft },
}

const STYLES = {
  // Sits in the keyboard's place, flush with the composer, so it is not a card.
  container: { borderRadius: 0, shadowOpacity: 0, elevation: 0 },
  category: { container: { shadowOpacity: 0, elevation: 0 } },
}

/**
 * The emoji panel that takes the keyboard's place, the way Messenger's smiley
 * does: same height as the keyboard it replaced, categories along the bottom,
 * search, and the recently used row.
 *
 * Recently used lives for the session only. Persisting it would be a file write
 * under the app's data directory, which ADR-0011's tripwire exists to question,
 * for a row nobody would miss after a relaunch.
 */
export const EmojiPanel = memo(function EmojiPanel({
  height,
  onEmojiSelected,
}: {
  height: number
  onEmojiSelected: (emoji: string) => void
}) {
  return (
    <View style={{ height }} className="border-t border-line/60 bg-surface">
      <EmojiKeyboard
        onEmojiSelected={(emoji: EmojiType) => onEmojiSelected(emoji.emoji)}
        enableRecentlyUsed
        enableSearchBar
        enableCategoryChangeGesture
        categoryPosition="bottom"
        disableSafeArea
        emojiSize={28}
        theme={THEME}
        styles={STYLES}
      />
    </View>
  )
})
