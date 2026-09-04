import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native'

import {
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
} from '@/components/icons'
import { ImagePreviewModal } from '@/components/chat/image-preview-modal'
import { VideoPreviewModal } from '@/components/chat/video-preview-modal'
import { VideoThumb } from '@/components/chat/video-thumb'
import { VoiceNotePlayer } from '@/components/chat/voice-note-player'
import { InScreenHeader } from '@/components/in-screen-header'
import { Text } from '@/components/ui/text'
import { formatBytes } from '@/lib/attachments'
import { cn } from '@/lib/cn'
import { conversationTitle } from '@/lib/conversation-title'
import { formatDayLabel } from '@/lib/message-day'
import {
  galleryCategoryLabel,
  galleryContents,
  galleryCount,
  galleryEmptyText,
  galleryRows,
  GALLERY_CATEGORIES,
  GALLERY_COLUMNS,
  type GalleryCategory,
  type GalleryItem,
  type GalleryLink,
  type GalleryRow,
} from '@/lib/media-gallery'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import { colors } from '@/lib/tokens'
import { useOpenDocument } from '@/lib/use-open-document'
import type { Conversation, Message } from '@/lib/types'

type MediaGalleryScreenProps = {
  conversation: Conversation
  /** Oldest first, exactly as the thread holds them. Owned by the caller. */
  messages: Message[]
  organizationNames?: ReadonlyMap<string, string>
  /** Reaching the end of a tab asks the thread for the page before it. */
  onLoadOlder?: () => void
  loadingOlder?: boolean
  loading?: boolean
  refreshing?: boolean
  onRefresh?: () => void
}

/** Screen padding either side of the grid, and the seam between two tiles. */
const GRID_PAD = 12
const TILE_GAP = 3

/**
 * Everything a conversation has carried, in one place.
 *
 * One screen for all three roles, because a Customer's attachments and an
 * Admin's are the same attachments — what differs between the roles is which
 * messages the API sends, and by the time they are here that has been decided.
 *
 * Four tabs rather than four stacked sections, and the same four the web
 * client's Shared in Chat pane has: a conversation of two hundred photos would
 * otherwise bury its one document under a screen and a half of scrolling.
 *
 * It reads the thread's own pages rather than an endpoint of its own, so a
 * gallery is exactly as deep as the history that has been loaded: reaching the
 * end asks for the page before it, the same way scrolling back through the
 * thread does.
 */
export function MediaGalleryScreen({
  conversation,
  messages,
  organizationNames,
  onLoadOlder,
  loadingOlder = false,
  loading = false,
  refreshing = false,
  onRefresh,
}: MediaGalleryScreenProps) {
  const { width } = useWindowDimensions()
  const [category, setCategory] = useState<GalleryCategory>('media')
  const [image, setImage] = useState<GalleryItem | null>(null)
  const [video, setVideo] = useState<GalleryItem | null>(null)

  const contents = useMemo(() => galleryContents(messages), [messages])
  const rows = useMemo(() => galleryRows(contents, category), [contents, category])

  const tile = Math.floor(
    (width - GRID_PAD * 2 - TILE_GAP * (GALLERY_COLUMNS - 1)) / GALLERY_COLUMNS,
  )

  const open = useCallback((item: GalleryItem) => {
    if (item.attachment.kind === 'image') setImage(item)
    else if (item.attachment.kind === 'video') setVideo(item)
  }, [])

  const renderItem = useCallback(
    ({ item: row }: { item: GalleryRow }) => {
      if (row.type === 'tiles') {
        return (
          <View
            className="flex-row"
            style={{ gap: TILE_GAP, marginBottom: TILE_GAP }}
          >
            {row.items.map((item) => (
              <MediaTile key={item.id} item={item} size={tile} onOpen={open} />
            ))}
          </View>
        )
      }
      if (row.type === 'link') return <LinkRow link={row.link} />
      return row.item.attachment.kind === 'audio' ? (
        <VoiceRow item={row.item} />
      ) : (
        <DocumentRow item={row.item} />
      )
    },
    [open, tile],
  )

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <View className="min-w-0 flex-1 pr-2">
          <Text variant="body" className="font-semibold text-ink" numberOfLines={1}>
            Shared in chat
          </Text>
          <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
            {conversationTitle(conversation, organizationNames)}
          </Text>
        </View>
      </InScreenHeader>

      <CategoryTabs
        contents={contents}
        selected={category}
        onSelect={setCategory}
      />

      {loading && messages.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator accessibilityLabel="Loading media…" />
        </View>
      ) : (
        <FlatList<GalleryRow>
          className="flex-1"
          // Remounted per tab: the tabs hold different row shapes and different
          // scroll positions, and a shared list would carry one tab's offset
          // into the next.
          key={category}
          data={rows}
          keyExtractor={keyExtractor}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={5}
          contentContainerStyle={{
            paddingHorizontal: GRID_PAD,
            paddingVertical: 12,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          onEndReached={onLoadOlder}
          onEndReachedThreshold={0.4}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyTab category={category} />}
          ListFooterComponent={
            loadingOlder ? (
              <View className="items-center py-4">
                <ActivityIndicator accessibilityLabel="Loading older messages…" />
              </View>
            ) : null
          }
          refreshControl={
            onRefresh ? makeRefreshControl(refreshing, onRefresh) : undefined
          }
        />
      )}

      {/*
        Mounted only while something is open. `useVideoPlayer` holds a native
        player for as long as its component lives, and a gallery must not hold
        one per clip.
      */}
      {image ? (
        <ImagePreviewModal
          uri={image.attachment.uri}
          name={image.attachment.name}
          visible
          onClose={() => setImage(null)}
        />
      ) : null}
      {video ? (
        <VideoPreviewModal
          uri={video.attachment.uri}
          name={video.attachment.name}
          visible
          onClose={() => setVideo(null)}
        />
      ) : null}
    </View>
  )
}

function keyExtractor(row: GalleryRow) {
  return row.id
}

/**
 * Media / Docs / Voice / Links, each carrying its count.
 *
 * The count is the point: an empty tab is worth knowing about before tapping it,
 * and the number is the only thing that distinguishes "nothing here" from "not
 * loaded that far back yet" at a glance.
 */
function CategoryTabs({
  contents,
  selected,
  onSelect,
}: {
  contents: ReturnType<typeof galleryContents>
  selected: GalleryCategory
  onSelect: (category: GalleryCategory) => void
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-b border-line/60 bg-surface px-2"
    >
      {GALLERY_CATEGORIES.map((category) => {
        const active = category === selected
        const count = galleryCount(contents, category)
        return (
          <Pressable
            key={category}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${galleryCategoryLabel(category)}, ${count}`}
            onPress={() => onSelect(category)}
            className={cn(
              'min-h-11 flex-1 flex-row items-center justify-center gap-1.5 border-b-2 px-2 active:opacity-70',
              active ? 'border-primary' : 'border-transparent',
            )}
          >
            <Text
              variant="meta"
              className={cn(
                'font-semibold',
                active ? 'text-primary' : 'text-muted',
              )}
            >
              {galleryCategoryLabel(category)}
            </Text>
            <Text
              variant="label"
              className={cn(
                'font-medium tabular-nums',
                active ? 'text-primary' : 'text-muted',
              )}
            >
              {count}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * One photo or clip in the grid.
 *
 * A video is a poster with a play badge rather than a still `<Image>`: RN cannot
 * decode mp4 into one, and a tile that renders nothing is indistinguishable from
 * a tile that has not loaded yet. See `VideoThumb`.
 *
 * The tile itself carries the accessible name and the media inside it carries
 * none, so a screen reader announces one control rather than a button wrapped
 * around a separate image.
 */
function MediaTile({
  item,
  size,
  onOpen,
}: {
  item: GalleryItem
  size: number
  onOpen: (item: GalleryItem) => void
}) {
  const { attachment } = item
  const video = attachment.kind === 'video'
  const name = attachment.name || (video ? 'video' : 'photo')
  /**
   * A photo whose request failed.
   *
   * An `<Image>` that will not load renders nothing, which in a grid is a grey
   * square exactly the shape of one that has not decoded yet — so a broken tile
   * and a slow tile look identical for as long as anyone waits. The bubble in
   * the thread says so out loud; a tile has room for the icon and the fact.
   */
  const [failed, setFailed] = useState(false)
  const label = failed
    ? `${name} could not be loaded`
    : `${video ? 'Play' : 'View'} ${name}, sent ${formatDayLabel(item.sentAt)}`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: failed }}
      disabled={failed}
      onPress={() => onOpen(item)}
      style={{ width: size, height: size }}
      className="items-center justify-center overflow-hidden rounded-lg bg-line/40 active:opacity-70"
    >
      {failed ? (
        <View className="items-center gap-1 px-1">
          <AlertCircle color={colors.muted} size={18} />
          <Text variant="label" className="text-center font-normal text-muted">
            Not loaded
          </Text>
        </View>
      ) : video ? (
        <VideoThumb uri={attachment.uri} size={size} accessibilityLabel="" />
      ) : (
        <Image
          source={{ uri: attachment.uri }}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
    </Pressable>
  )
}

/** A voice note, playable where it sits — exactly as it is in the thread. */
function VoiceRow({ item }: { item: GalleryItem }) {
  return (
    <View className="mb-2 rounded-2xl border border-line/70 bg-surface px-3 py-2.5">
      <VoiceNotePlayer attachment={item.attachment} />
      <Text variant="label" className="mt-1.5 font-normal text-muted">
        {formatDayLabel(item.sentAt)}
      </Text>
    </View>
  )
}

/** A document, opened the way the thread opens one. See `useOpenDocument`. */
function DocumentRow({ item }: { item: GalleryItem }) {
  const { attachment } = item
  const { open, opening } = useOpenDocument(attachment)
  const size = formatBytes(attachment.size)
  // The size line doubles as the progress line, as it does in a bubble: a
  // document opens by being downloaded, and a row that says nothing while that
  // happens reads as a tap that did not register.
  const meta = [opening ? 'Opening…' : size, formatDayLabel(item.sentAt)]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.name || 'document'}`}
      accessibilityState={{ busy: opening }}
      onPress={open}
      className="mb-2 min-h-11 flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-2.5 active:opacity-70"
    >
      <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
        <FileText color={colors.primary} size={22} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="meta" numberOfLines={1} className="font-semibold text-ink">
          {attachment.name || 'Document'}
        </Text>
        <Text variant="label" className="mt-0.5 font-normal text-muted">
          {meta}
        </Text>
      </View>
    </Pressable>
  )
}

/** A URL somebody typed, opened in whatever this device browses with. */
function LinkRow({ link }: { link: GalleryLink }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${link.url}`}
      onPress={() => void Linking.openURL(link.url).catch(() => {})}
      className="mb-2 min-h-11 flex-row items-start gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-2.5 active:opacity-70"
    >
      <View className="mt-0.5 size-8 items-center justify-center rounded-xl bg-primary-soft">
        <LinkIcon color={colors.primary} size={16} />
      </View>
      <View className="min-w-0 flex-1">
        {/* Not truncated to one line: a URL's meaning is spread along it, and the
            end is as often the part somebody is looking for as the start. */}
        <Text variant="meta" className="font-medium text-primary">
          {link.url}
        </Text>
        <Text variant="label" className="mt-0.5 font-normal text-muted">
          {formatDayLabel(link.sentAt)}
        </Text>
      </View>
    </Pressable>
  )
}

/**
 * A tab with nothing under it.
 *
 * Says what would be here rather than only that there is nothing, because the
 * way to fill a gallery is not visible from a gallery — it is back in the
 * thread, which the header's Back is one tap from.
 */
function EmptyTab({ category }: { category: GalleryCategory }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-8 py-16">
      {category === 'links' ? (
        <LinkIcon color={colors.muted} size={28} />
      ) : (
        <ImageIcon color={colors.muted} size={28} />
      )}
      <Text variant="title" className="text-ink">
        {galleryEmptyText(category)}
      </Text>
      <Text variant="meta" className="text-center text-muted">
        Anything shared in this conversation appears here. Scroll down to look
        further back through the thread.
      </Text>
    </View>
  )
}
