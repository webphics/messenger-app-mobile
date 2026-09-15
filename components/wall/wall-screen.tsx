import { useCallback, useEffect, useRef, useState } from 'react'
import { router, useNavigation } from 'expo-router'
import { ActivityIndicator, Alert, FlatList, View, type ViewToken } from 'react-native'
import Animated, { useReducedMotion } from 'react-native-reanimated'

import { Bookmark, CloudOff, Newspaper, SquarePen, X } from '@/components/icons'
import { SearchFieldWithClear } from '@/components/search-field-with-clear'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { WallComposeSheet } from '@/components/wall/wall-compose-sheet'
import { WallPostCard } from '@/components/wall/wall-post-card'
import { chatHref } from '@/lib/chat-route-id'
import { cn } from '@/lib/cn'
import { settleEnter } from '@/lib/motion-enter'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import { colors } from '@/lib/tokens'
import { useComposableWallOrganizations } from '@/lib/use-composable-wall-organizations'
import { useWall, useWallSearch, type WallBodyView } from '@/lib/use-wall'
import { useWallPostReply } from '@/lib/use-wall-post-reply'
import { wallPostReplyDraft } from '@/lib/wall-actions'
import { wallSavedHref } from '@/lib/wall-route'
import { WALL_SORT_OPTIONS } from '@/lib/wall-sort'
import type { WallPost, WallSort } from '@/lib/types'

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
/**
 * How much of a card has to be on screen before it counts as seen: half,
 * matching the web client's own `useInView` threshold — a sliver at the edge
 * of the list is a card scrolling past, not one somebody looked at.
 */
const WALL_VIEW_THRESHOLD_PERCENT = 50

export function WallBody({ wall }: { wall: WallBodyView }) {
  const { notice, viewer } = wall

  /**
   * Reply (#77): the viewer's own support conversation, opened with a
   * reference to the tapped Post seeded into the composer. Lives here rather
   * than on `WallScreen` because every Wall presentation this body draws —
   * the default one, a shared named Wall, Saved — offers the same Reply on
   * the same card.
   */
  const { reply: replyToPost, error: replyError, pending: replyPending, dismissError } =
    useWallPostReply()
  const onReply = useCallback(
    (post: WallPost) => {
      void replyToPost(post).then((id) => {
        if (id) router.push(chatHref(id, wallPostReplyDraft(post)))
      })
    },
    [replyToPost],
  )
  useEffect(() => {
    if (!replyError) return
    Alert.alert('Could not open your conversation', replyError)
    dismissError()
  }, [replyError, dismissError])

  /**
   * A Post that has actually been on screen, not merely fetched (#85).
   *
   * `onViewableItemsChanged` may not change identity across renders — FlatList
   * throws if it does — so the stable function `viewabilityConfigCallbackPairs`
   * holds reads the latest `recordView` out of a ref rather than closing over
   * one that could go stale for the life of the list.
   *
   * The ref is written in an effect and both stable values come from a lazy
   * `useState` initialiser, because a render must not write to a ref or read
   * one: the value it would read is whatever the last commit happened to leave
   * behind, which is only reliably the current one by accident. `useState`
   * gives the same once-only guarantee `useRef` was being used for here, and
   * the callback only ever runs after layout, by which point the effect has
   * run.
   */
  const recordViewRef = useRef(wall.recordView)
  useEffect(() => {
    recordViewRef.current = wall.recordView
  }, [wall.recordView])

  const [onViewableItemsChanged] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken<WallPost>[] }) => {
        for (const { item, isViewable } of viewableItems) {
          if (isViewable) recordViewRef.current(item)
        }
      },
  )

  const [viewabilityConfigCallbackPairs] = useState(() => [
    {
      viewabilityConfig: { itemVisiblePercentThreshold: WALL_VIEW_THRESHOLD_PERCENT },
      onViewableItemsChanged,
    },
  ])

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
          onReply={onReply}
          replying={replyPending === item.id}
        />
      ) : null,
    [
      viewer,
      wall.react,
      wall.myVotes,
      wall.vote,
      wall.toggleBookmark,
      wall.editPost,
      onReply,
      replyPending,
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
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
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

/** What each option in `WallSortControl` says. */
const WALL_SORT_LABEL: Record<WallSort, string> = { recent: 'Recent', popular: 'Popular' }

/**
 * Recent or Popular (#86), at the top of the default Wall and nowhere else —
 * a shared named Wall and the Saved view both read one fixed order and offer
 * no control for it, so this sits on `WallScreen` rather than on `WallBody`,
 * beside Saved and Compose.
 *
 * A tap that lands on the option already selected still calls `onChange`;
 * `useWall`'s own `setSort` is what turns that into a no-op; from here it is
 * just a chip a person tapped.
 */
function WallSortControl({ sort, onChange }: { sort: WallSort; onChange: (sort: WallSort) => void }) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row gap-2 border-b border-line/60 bg-surface px-4 pb-3 pt-2"
    >
      {WALL_SORT_OPTIONS.map(option => {
        const selected = option === sort
        return (
          <TactilePressable
            key={option}
            accessibilityRole="tab"
            accessibilityLabel={WALL_SORT_LABEL[option]}
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            className={cn(
              'min-h-11 justify-center rounded-full border px-3.5',
              selected
                ? 'border-transparent bg-primary shadow-sm shadow-primary/25'
                : 'border-line/80 bg-line/35',
            )}
          >
            <Text
              variant="label"
              className={selected ? 'font-semibold text-primary-foreground' : 'text-ink-soft'}
            >
              {WALL_SORT_LABEL[option]}
            </Text>
          </TactilePressable>
        )
      })}
    </View>
  )
}

/** How long a keystroke waits before it becomes a request — the same figure `use-user-directory` debounces search on. */
const WALL_SEARCH_DEBOUNCE_MS = 300

/**
 * The default Wall's own screen, with Saved (#84) and Compose (#76) on the
 * header. Saved is every reader's own way back to what they bookmarked, so it
 * is always there; Compose is a Contributor's way to publish and absent
 * entirely for anyone `assertCanPost` would refuse. Neither is on `WallBody`:
 * a shared, named Wall (`SharedWallScreen`) draws the same list underneath a
 * different header and offers a way into neither, so both controls belong
 * here rather than on the part every Wall screen shares. The sort control
 * (#86) is the same story, one level down: `WallSortControl` above.
 *
 * Search (#80) is here too, for the same reason: it is a way of reading the
 * default Wall, not something a shared or Saved screen offers.
 * `useWallSearch` runs unconditionally — a hook cannot be reached only some
 * renders — but `isSearching` is read off the raw input rather than the
 * debounced term, so a keystroke swaps the list to the search result at once
 * and the 300ms gap before its answer lands is `activeWall`'s own `loading`,
 * never a flash back to the Wall underneath. That same flag is why the sort
 * control disappears while searching instead of merely disabling: a search
 * result pages its own way (`lib/use-wall`'s module doc) and has no order for
 * Recent or Popular to choose between.
 */
export function WallScreen() {
  const wall = useWall()
  const navigation = useNavigation()
  const { organizations } = useComposableWallOrganizations()
  const [composeOpen, setComposeOpen] = useState(false)

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), WALL_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])
  const isSearching = searchInput.trim().length > 0
  const searchResult = useWallSearch(debouncedSearch.trim())
  const activeWall: WallBodyView = isSearching ? searchResult : wall

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
      <View className="flex-1 bg-bg">
        <View className="border-b border-line/60 bg-surface px-4 pb-3 pt-2">
          <SearchFieldWithClear
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search posts and authors…"
            accessibilityLabel="Search posts"
          />
        </View>
        {isSearching ? null : <WallSortControl sort={wall.sort} onChange={wall.setSort} />}
        <WallBody wall={activeWall} />
      </View>
      <WallComposeSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        organizations={organizations}
        onCreate={wall.createPost}
      />
    </>
  )
}
