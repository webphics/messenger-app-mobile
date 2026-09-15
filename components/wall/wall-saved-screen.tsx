import { View } from 'react-native'

import { InScreenHeader } from '@/components/in-screen-header'
import { Text } from '@/components/ui/text'
import { WallBody } from '@/components/wall/wall-screen'
import { useWallBookmarks } from '@/lib/use-wall-bookmarks'

/**
 * The Saved view: this person's own bookmarked Posts, newest saved first.
 *
 * Reached from the Wall's own header rather than the Tab capsule — a bookmark
 * is a private way back into what the Wall already shows, not a fourth
 * destination of its own. Everything below the header is `WallBody`, the same
 * list the default Wall and a shared one draw, fed here by
 * `lib/use-wall-bookmarks` instead of `lib/use-wall`.
 *
 * Un-bookmarking a Post here removes its row rather than leaving it drawn
 * with an empty bookmark icon — the Post's presence in this list *is* the
 * bookmark, so the two are the same fact. Loading, empty and unreachable are
 * three different screens, exactly as everywhere else `lib/read-notice`
 * decides that for a paged list; nothing here ever says how many people
 * bookmarked a Post, or who — that number does not exist on this client or
 * the API's own read model.
 */
export function WallSavedScreen() {
  const wall = useWallBookmarks()

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Saved
        </Text>
      </InScreenHeader>
      <WallBody wall={wall} />
    </View>
  )
}
