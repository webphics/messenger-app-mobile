import { useMemo, useState } from 'react'
import { Linking, View } from 'react-native'

import { ExternalLink, MoreVertical } from '@/components/icons'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { WallPostActionsSheet } from '@/components/wall/wall-post-actions'
import { WallPostBody } from '@/components/wall/wall-post-body'
import { WallPostCollage } from '@/components/wall/wall-post-collage'
import { WallPostMedia } from '@/components/wall/wall-post-media'
import { formatRelativeTime, initials } from '@/lib/display'
import { colors } from '@/lib/tokens'
import { wallPostActions } from '@/lib/wall-actions'
import { groupWallAttachments, linkHost } from '@/lib/wall-card'
import type { WallPost } from '@/lib/types'

/**
 * One Post, as a card rather than as a row.
 *
 * The images are the first thing in it, before the byline and running to all
 * four edges of the top — which is what a Post leading with an image means once
 * it is something to look at rather than a record to read. An image inset inside
 * the padding under a line of grey metadata is an attachment to a form; one that
 * fills the top of the card is what the card is showing.
 *
 * Under it the byline, then the body, then whatever else the Post carries, then
 * a meta row. Nothing on it offers or implies commenting: a Post has no replies,
 * no reply count and no comment box, and the one thing a reader can say about
 * one is a reaction (which arrives with its own ticket). The counts here are
 * quiet for the same reason — they report, they do not invite.
 *
 * Only the byline is grouped for a screen reader, and deliberately only that:
 * a name, a stamp and an edit mark read as three fragments apart and as one
 * sentence together. Grouping the *card* would have been the tempting version
 * and is the wrong one — an `accessible` container swallows its children, so
 * the overflow control, the link and every image would stop being reachable at
 * all. Everything else on the card already says what it is.
 */
export function WallPostCard({ post }: { post: WallPost }) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const { images, videos, documents } = useMemo(
    () => groupWallAttachments(post.attachments),
    [post.attachments],
  )

  const age = formatRelativeTime(post.createdAt)
  const actions = wallPostActions(post)
  const link = post.link

  return (
    <View className="overflow-hidden rounded-3xl border border-line/70 bg-surface shadow-md shadow-black/8">
      <WallPostCollage images={images} />

      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <Avatar alt="" className="size-11">
            <AvatarFallback className="bg-primary-soft">
              <Text variant="title" className="text-primary">
                {initials(post.author.name)}
              </Text>
            </AvatarFallback>
          </Avatar>

          <View
            accessible
            accessibilityLabel={`${post.author.name}, ${age}${post.editedAt ? ', edited' : ''}`}
            className="min-w-0 flex-1"
          >
            <Text variant="title" numberOfLines={1} className="text-ink">
              {post.author.name}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <Text variant="meta" className="text-muted">
                {age}
              </Text>
              {/*
                An edit cannot change what somebody reacted to without saying so,
                which is the whole reason a Post carries an edit stamp from its
                first version. The time beside it stays the time it was
                published; when it was edited is not the headline.
              */}
              {post.editedAt ? (
                <>
                  <Text variant="meta" className="text-muted" aria-hidden>
                    ·
                  </Text>
                  <Text variant="meta" className="text-muted">
                    Edited
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          {/*
            Present when there is something behind it and absent when there is
            not: a control that opens an empty sheet is a dead end, and what a
            reader can do to somebody else's Post is still arriving.
          */}
          {actions.length > 0 ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`More about this post by ${post.author.name}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => setActionsOpen(true)}
              className="size-10 items-center justify-center rounded-full"
            >
              <MoreVertical color={colors.muted} size={20} />
            </TactilePressable>
          ) : null}
        </View>

        {post.body ? <WallPostBody body={post.body} hasImages={images.length > 0} /> : null}

        <WallPostMedia videos={videos} documents={documents} />

        {/*
          The host is under the label rather than behind it. A link's label is
          free text its author chose, so a reader pressing one has to be able to
          see where it actually goes first.
        */}
        {link ? (
          <TactilePressable
            accessibilityRole="link"
            accessibilityLabel={`${link.label}, opens ${linkHost(link.url)}`}
            onPress={() => void Linking.openURL(link.url)}
            className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-line/80 bg-surface px-3.5 py-2.5 shadow-xs shadow-black/8"
          >
            <View className="min-w-0 flex-1">
              <Text variant="title" numberOfLines={1} className="text-ink">
                {link.label}
              </Text>
              <Text variant="meta" numberOfLines={1} className="text-muted">
                {linkHost(link.url)}
              </Text>
            </View>
            <ExternalLink color={colors.muted} size={18} />
          </TactilePressable>
        ) : null}

        {post.reactions.length > 0 ? (
          <View className="flex-row items-center border-t border-line/60 pt-3">
            <Text variant="meta" className="text-muted tabular-nums">
              {post.reactions.length === 1 ? '1 reaction' : `${post.reactions.length} reactions`}
            </Text>
          </View>
        ) : null}
      </View>

      <WallPostActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        post={post}
        actions={actions}
      />
    </View>
  )
}
