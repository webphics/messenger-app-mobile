import { router } from 'expo-router'
import { View } from 'react-native'

import { ChevronRight } from '@/components/icons'
import { InScreenHeader } from '@/components/in-screen-header'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { WallBody } from '@/components/wall/wall-screen'
import { CUSTOMER_HREF } from '@/lib/hub-routes'
import { colors } from '@/lib/tokens'
import { useWallPost } from '@/lib/use-wall'

type WallPostScreenProps = { postId: string }

/**
 * One Post, on its own screen.
 *
 * Everything below the header is `WallBody` — the same card the Wall draws, so
 * the Post is voted on, reacted to, saved, replied to, edited and removed here
 * by exactly the code that does it in the list. It is one Post rather than a
 * page only because `useWallPost` fills the same view from `GET /wall/posts/:id`.
 *
 * Which is the whole point of the screen: the Hub's carousel draws a Post small,
 * with no room for any of that, so a tap used to land on the Wall tab and leave
 * somebody to find the Post they had just tapped. Now it opens the Post.
 *
 * A Post that was taken down, or that belongs to an organization this reader is
 * not in, is a failed read in the API's own words rather than an empty screen —
 * `wallNotice` already draws that, with the retry, so nothing here decides it.
 *
 * Under it, a way on to the rest of the Wall: a screen showing exactly one Post
 * is a dead end otherwise, and the Wall is where the Post came from.
 */
export function WallPostScreen({ postId }: WallPostScreenProps) {
  const wall = useWallPost(postId)

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <Text variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={1}>
          Post
        </Text>
      </InScreenHeader>

      <WallBody wall={wall} />

      <View className="border-t border-line/60 bg-surface px-4 py-3">
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Open the Wall"
          onPress={() => router.navigate(CUSTOMER_HREF.wall)}
          className="min-h-11 flex-row items-center justify-center gap-0.5"
        >
          <Text variant="meta" className="font-semibold text-primary">
            See everything on the Wall
          </Text>
          <ChevronRight color={colors.primary} size={16} />
        </TactilePressable>
      </View>
    </View>
  )
}
