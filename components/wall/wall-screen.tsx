import { useCallback, useEffect, useState } from 'react'
import { router, useNavigation } from 'expo-router'
import { ActivityIndicator, FlatList, View } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'

import { Bookmark, CloudOff, Newspaper, SquarePen, X } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { WallComposeSheet } from '@/components/wall/wall-compose-sheet'
import { WallPostCard } from '@/components/wall/wall-post-card'
import { settleEnter } from '@/lib/motion-enter'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import { colors } from '@/lib/tokens'
import { useComposableWallOrganizations } from '@/lib/use-composable-wall-organizations'
import { useWall, type WallBodyView } from '@/lib/use-wall'
import { wallSavedHref } from '@/lib/wall-route'
import type { WallPost } from '@/lib/types'

/**
 * The default Wall: Posts from every organization this person belongs to,
 * newest first.
 *
 * A destination rather than something inside Messages, and it reads one list for
 * everybody — a Customer, an Agent and an Admin all ask the same path and the
 * API resolves each to their own memberships, so there is no role branch here at
 * all.
 *
 * Three screens rather than one, which is the whole of what `wallNotice`
 * decides: a Wall still loading is a spinner, one with nothing in it says nobody
 * has posted, and one this device could not reach says so and offers the retry.
 * A failure over Posts that are already drawn is the fourth case and is
 * deliberately none of those — what is drawn is still true, so it goes in a
 * strip above them and is dismissed rather than retried.
 *
 * Nothing on this screen is an Outbox and nothing on it has a Delivery state. A
 * Post is published rather than sent: there is no half of it waiting on this
 * phone, and a Wall that cannot be reached holds nothing back to send later.
 */

function keyExtractor(post: WallPost) {
  return post.id
}

function Separator() {
  return <View className="h-3" />
}

/** A card-shaped placeholder, so the list does not reflow when Posts land. */
function LoadingCard() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden rounded-3xl border border-line/70 bg-surface"
    >
      <View className="w-full bg-muted/10" style={{ aspectRatio: 4 / 3 }} />
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 rounded-full bg-muted/15" />
          <View className="flex-1 gap-2">
            <View className="h-3.5 w-2/5 rounded-full bg-muted/15" />
            <View className="h-3 w-1/4 rounded-full bg-muted/10" />
          </View>
        </View>
        <View className="h-3 w-4/5 rounded-full bg-muted/10" />
      </View>
    </View>
  )
}

function WallLoading() {
  return (
    <View accessibilityLabel="Loading the Wall" className="gap-3">
      <LoadingCard />
      <LoadingCard />
    </View>
  )
}

/**
 * The Wall with no Posts on it, saying which of the two it is.
 *
 * `kind` rather than inferring it from whether a retry was handed down: the two
 * differ in what they say, what they are drawn in and whether there is anything
 * to try again, and reading the third off the second is how they get to
 * disagree.
 */
function WallNothing({
  kind,
  title,
  hint,
  onRetry,
}: {
  kind: 'empty' | 'failed'
  title: string
  hint: string
  onRetry?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const failed = kind === 'failed'

  return (
    <Animated.View
      entering={settleEnter(!!reduceMotion)}
      accessibilityLiveRegion="polite"
      className="items-center px-4 py-16"
    >
      <View
        className={
          failed
            ? 'size-14 items-center justify-center rounded-full bg-danger/10'
            : 'size-14 items-center justify-center rounded-full bg-primary-soft'
        }
      >
        {failed ? (
          <CloudOff color={colors.danger} size={26} />
        ) : (
          <Newspaper color={colors.primary} size={26} />
        )}
      </View>
      <Text variant="title" className="mt-4 text-center text-ink">
        {title}
      </Text>
      <Text variant="meta" className="mt-1 text-center text-muted">
        {hint}
      </Text>
      {onRetry ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
        >
          <Text variant="label" className="font-bold text-primary-foreground">
            Try again
          </Text>
        </TactilePressable>
      ) : null}
    </Animated.View>
  )
}

/**
 * Everything a Wall draws once it has posts to hold, a viewer to act as, and
 * paging of its own — every field `WallBodyView` answers with, whether it
 * came from the default Wall, a named one, or the Saved view.
 *
 * Split out of `WallScreen` for `SharedWallScreen` (#79): a shared, named Wall
 * draws exactly this, under a header naming the Wall rather than under nothing
 * at all, and duplicating the list beneath it would be the one thing the two
 * screens could disagree about by accident. `WallSavedScreen` (#84) draws it
 * a third time, fed by `lib/use-wall-bookmarks` instead of `lib/use-wall` — the
 * only field this component itself never touches, `createPost`, is exactly
 * the one that differs between the three, which is why the type it takes
 * (`WallBodyView`) omits it rather than the default Wall's own hook needing a
 * stub nobody calls.
 */
export function WallBody({ wall }: { wall: WallBodyView }) {
  const { notice, viewer } = wall

  const renderItem = useCallback(
    ({ item }: { item: WallPost }) =>
      viewer ? (
        <WallPostCard
          post={item}
          viewer={viewer}
          onReact={wall.react}
          myVote={wall.myVotes[item.id] ?? null}
          onVote={wall.vote}
          onToggleBookmark={wall.toggleBookmark}
          onEdit={wall.editPost}
          onRemove={wall.removePost}
        />
      ) : null,
    [
      viewer,
      wall.react,
      wall.myVotes,
      wall.vote,
      wall.toggleBookmark,
      wall.editPost,
      wall.removePost,
    ],
  )

  return (
    <View className="flex-1 bg-bg">
      {/*
        A read that failed over Posts that are still drawn. One line above them
        rather than a screen in their place: the Wall on screen is still true,
        and replacing it would throw it away to report a request.
      */}
      {notice.kind === 'stale' ? (
        <View
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 border-b border-line/60 bg-line/35 px-4 py-2.5"
        >
          <Text variant="meta" className="min-w-0 flex-1 text-ink-soft">
            {notice.message}
          </Text>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={wall.dismissFailure}
            className="size-8 items-center justify-center rounded-full"
          >
            <X color={colors.muted} size={16} />
          </TactilePressable>
        </View>
      ) : null}

      <FlatList
        className="flex-1 bg-bg"
        showsVerticalScrollIndicator={false}
        data={wall.posts}
        keyExtractor={keyExtractor}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        contentContainerClassName="px-4 py-3"
        ItemSeparatorComponent={Separator}
        renderItem={renderItem}
        onEndReachedThreshold={0.6}
        onEndReached={wall.loadOlder}
        ListEmptyComponent={
          notice.kind === 'loading' ? (
            <WallLoading />
          ) : notice.kind === 'failed' ? (
            <WallNothing
              kind="failed"
              title={notice.title}
              hint={notice.hint}
              onRetry={wall.retry}
            />
          ) : notice.kind === 'empty' ? (
            <WallNothing kind="empty" title={notice.title} hint={notice.hint} />
          ) : null
        }
        ListFooterComponent={
          wall.loadingOlder ? (
            <View accessibilityLabel="Loading older posts" className="items-center py-6">
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        refreshControl={makeRefreshControl(wall.refreshing, wall.refresh)}
      />
    </View>
  )
}

/**
 * The default Wall's own screen, with Saved (#84) and Compose (#76) on the
 * header. Saved is every reader's own way back to what they bookmarked, so it
 * is always there; Compose is a Contributor's way to publish and absent
 * entirely for anyone `assertCanPost` would refuse. Neither is on `WallBody`:
 * a shared, named Wall (`SharedWallScreen`) draws the same list underneath a
 * different header and offers a way into neither, so both controls belong
 * here rather than on the part every Wall screen shares.
 */
export function WallScreen() {
  const wall = useWall()
  const navigation = useNavigation()
  const { organizations } = useComposableWallOrganizations()
  const [composeOpen, setComposeOpen] = useState(false)

  const canCompose = organizations.length > 0

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="mr-2 flex-row items-center gap-2">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Saved posts"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            className="size-10 items-center justify-center rounded-full"
            onPress={() => router.push(wallSavedHref())}
          >
            <Bookmark color={colors.ink} size={20} />
          </TactilePressable>
          {canCompose ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="New post"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className="size-10 items-center justify-center rounded-full bg-primary-soft/80"
              onPress={() => setComposeOpen(true)}
            >
              <SquarePen color={colors.primary} size={20} />
            </TactilePressable>
          ) : null}
        </View>
      ),
    })
  }, [navigation, canCompose])

  return (
    <>
      <WallBody wall={wall} />
      <WallComposeSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        organizations={organizations}
        onCreate={wall.createPost}
      />
    </>
  )
}
