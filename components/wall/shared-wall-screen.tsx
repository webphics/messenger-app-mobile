import { View } from 'react-native'

import { WallBody } from '@/components/wall/wall-screen'
import { InScreenHeader } from '@/components/in-screen-header'
import { Text } from '@/components/ui/text'
import { useSharedWall } from '@/lib/use-wall'

type SharedWallScreenProps = { wallId: string }

/**
 * A named Wall, opened from a link somebody else made and shared (#79).
 *
 * Everything below the header is `WallBody`, the same list the default Wall
 * draws — the same reactions, the same author's edit and delete, the same four
 * things a screen with no Posts on it can say. What differs is entirely above
 * it: a header naming the Wall (falling back to a generic label until its name
 * arrives, or if that one read never lands — the Posts underneath do not wait
 * on it either way), and no control anywhere on this screen for renaming,
 * re-scoping, or deleting the Wall itself. Authoring one stays on web.
 *
 * A Wall naming only organizations this reader is not in draws the same screen
 * with nothing on it, worded to say so rather than to read as a refusal — see
 * `lib/wall-notice`'s named copy. A Wall that no longer exists is a refusal
 * like any other failed read, in the API's own words.
 */
export function SharedWallScreen({ wallId }: SharedWallScreenProps) {
  const wall = useSharedWall(wallId)

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          {wall.wallName ?? 'Shared Wall'}
        </Text>
      </InScreenHeader>
      <WallBody wall={wall} />
    </View>
  )
}
