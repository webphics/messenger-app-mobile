import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Dimensions, FlatList, View } from 'react-native'

import { Composer, type ComposerSendPayload } from '@/components/chat/composer'
import { MessageActions } from '@/components/chat/message-actions'
import { MessageBubble, type QuotedMessage } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { InScreenHeader } from '@/components/in-screen-header'
import { Text } from '@/components/ui/text'
import { primaryAttachmentView, toMessageAttachment } from '@/lib/attachment-view'
import { conversationTitle } from '@/lib/conversation-title'
import {
  draftMessage,
  isLocalId,
  isOutgoing,
  LOCAL_ID_PREFIX,
  mergeMessages,
  messageSenderName,
  type DeliveryState,
  type SendDraft,
} from '@/lib/conversation-state'
import { useKeyboardInset } from '@/lib/keyboard-inset'
import { formatDayLabel, shouldShowDayDivider } from '@/lib/message-day'
import {
  isImageOrVideo,
  quoteAttachmentText,
  quoteLayoutMode,
  type BubbleContent,
} from '@/lib/message-attachment'
import { groupReactions, toggleReaction } from '@/lib/message-react'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import {
  anchorFromPayload,
  type OpenMenuPayload,
  type ReactionAnchor,
} from '@/lib/overlay-frame'
import type { Conversation, Message, UserRole } from '@/lib/types'

export type ThreadViewer = {
  id: string
  name: string
  role: UserRole
}

type ThreadScreenProps = {
  conversation: Conversation
  /** Oldest first. Owned by the caller, which is what fetches and pages it. */
  messages: Message[]
  viewer: ThreadViewer
  organizationNames?: ReadonlyMap<string, string>
  /** Scrolling to the top of the thread asks for the page before it. */
  onLoadOlder?: () => void
  loadingOlder?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  /**
   * Where a typed message goes.
   *
   * Absent on a thread that still has nowhere to send one, where the composer
   * falls back to echoing locally so it is not a dead control.
   */
  onSendMessage?: (draft: SendDraft) => void
  /** How far each message this device is still carrying has got, by id. */
  delivery?: ReadonlyMap<string, DeliveryState>
  onRetrySend?: (messageId: string) => void
}

type Row =
  | { type: 'day'; id: string; label: string }
  | { type: 'message'; id: string; message: Message; senderName?: string }

/** What a bubble draws out of a message: its caption and the one attachment shown beside it. */
function contentOf(message: Message): BubbleContent {
  return { body: message.body, attachment: primaryAttachmentView(message.attachments) }
}

function keyExtractor(item: Row) {
  return item.id
}

/** How near inverted offset 0 (newest) before MVCP reveals inserted rows. */
const NEAR_LATEST_PX = 80

function buildRows(messages: Message[], viewerId: string, namesSenders: boolean): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!
    const previous = messages[i - 1]
    if (shouldShowDayDivider(message.createdAt, previous?.createdAt)) {
      rows.push({
        type: 'day',
        id: `day-${message.id}`,
        label: formatDayLabel(message.createdAt),
      })
    }
    rows.push({
      type: 'message',
      id: message.id,
      message,
      senderName:
        namesSenders && !isOutgoing(message, viewerId)
          ? messageSenderName(message)
          : undefined,
    })
  }
  return rows.reverse()
}

export function ThreadScreen({
  conversation,
  messages: fetched,
  viewer,
  organizationNames,
  onLoadOlder,
  loadingOlder = false,
  refreshing = false,
  onRefresh,
  onSendMessage,
  delivery,
  onRetrySend,
}: ThreadScreenProps) {
  const keyboardInset = useKeyboardInset()
  const hostRef = useRef<View>(null)
  const listRef = useRef<FlatList<Row>>(null)
  const stickToLatestRef = useRef(false)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [menu, setMenu] = useState<ReactionAnchor | null>(null)

  /**
   * What this screen did to the thread: a message typed into the composer, and a
   * reaction tapped on one that came from the server.
   *
   * Held apart from the fetched pages and merged over them during render, rather
   * than copied into one list an effect keeps in step. Both are keyed by id, so
   * a local edit of a fetched message shadows it and a locally-typed message
   * simply joins — and a new page never has to be reconciled with anything.
   */
  const [local, setLocal] = useState<Message[]>([])
  const messages = useMemo(() => mergeMessages(fetched, local), [fetched, local])

  const isGroup =
    conversation.type === 'group' || conversation.type === 'community_announcement'
  const rows = useMemo(
    () => buildRows(messages, viewer.id, isGroup),
    [messages, viewer.id, isGroup],
  )

  /**
   * The quote strip above a reply.
   *
   * A reply carries the id of what it answers and a preview of it. The full
   * message is used when this thread has it loaded — it is what a thumbnail and
   * a sender name come from — and the preview stands in when the reply is older
   * than the pages held.
   */
  const quotedById = useMemo(() => {
    const byId = new Map(messages.map((message) => [message.id, message]))
    const out = new Map<string, QuotedMessage>()

    for (const message of messages) {
      if (!message.replyTo) continue
      const quoted = byId.get(message.replyTo.id)

      if (!quoted) {
        out.set(message.id, {
          name: 'Message',
          body: message.replyTo.preview ?? 'Message',
          isMe: false,
          layoutMode: 'standard',
        })
        continue
      }

      const quotedContent = contentOf(quoted)
      out.set(message.id, {
        name: messageSenderName(quoted) ?? conversationTitle(conversation, organizationNames),
        body: quoteAttachmentText(quotedContent),
        isMe: isOutgoing(quoted, viewer.id),
        attachmentKind: quotedContent.attachment?.kind,
        thumbUri: isImageOrVideo(quotedContent.attachment)
          ? quotedContent.attachment.uri
          : undefined,
        layoutMode: quoteLayoutMode(quotedContent, contentOf(message)),
      })
    }

    return out
  }, [messages, conversation, organizationNames, viewer.id])

  const replyQuote = useMemo(() => {
    if (!replyTo) return null
    const quoted = quotedById.get(replyTo.id)
    const content = contentOf(replyTo)
    return {
      name: messageSenderName(replyTo) ?? (isOutgoing(replyTo, viewer.id) ? 'You' : 'Message'),
      body: quoteAttachmentText(content),
      thumbUri: isImageOrVideo(content.attachment) ? content.attachment.uri : undefined,
      kind: content.attachment?.kind ?? quoted?.attachmentKind,
    }
  }, [replyTo, quotedById, viewer.id])

  const menuOpen = menu !== null
  const menuId = menu?.messageId ?? null

  useEffect(() => {
    if (!menuOpen) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMenu(null)
      return true
    })
    return () => sub.remove()
  }, [menuOpen])

  const dismissMenu = useCallback(() => {
    setMenu(null)
  }, [])

  const openMenu = useCallback((payload: OpenMenuPayload) => {
    const host = hostRef.current
    if (!host) return
    const screen = Dimensions.get('window')
    host.measureInWindow((hx, hy, hw, hh) => {
      const next = anchorFromPayload(
        payload,
        { x: hx, y: hy, width: hw, height: hh },
        screen,
      )
      if (next) setMenu(next)
    })
  }, [])

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const target = messages.find((message) => message.id === messageId)
      if (target) {
        const reacted = {
          ...target,
          reactions: toggleReaction(target.reactions, emoji, viewer.id),
        }
        setLocal((held) => [
          ...held.filter((message) => message.id !== messageId),
          reacted,
        ])
      }
      setMenu(null)
    },
    [messages, viewer.id],
  )

  const handleReply = useCallback(
    (messageId: string) => {
      const target = messages.find((message) => message.id === messageId)
      if (target) setReplyTo(target)
      setMenu(null)
    },
    [messages],
  )

  /**
   * A message typed here.
   *
   * Text goes to the API through `onSendMessage`, and the caller owns it from
   * there — the bubble it puts on screen arrives back in `messages` with a
   * delivery state, so nothing about a send is held twice.
   *
   * An attachment does not: the API's shape names an uploaded object and Phase
   * 5a produces a device URI, so a message carrying one has nowhere to go and
   * stays the local echo it has been since. Same for a thread with no
   * `onSendMessage` at all — Agent and Admin, still on local data until #32.
   */
  function send(payload: ComposerSendPayload) {
    const body = payload.body.trim()
    if (!body && !payload.attachment) return

    const quoted = replyTo
    setReplyTo(null)
    // MVCP keeps the prior newest row fixed; after layout, pin offset 0 so the
    // sent bubble clears the composer (autoscroll threshold alone skips if the
    // user had scrolled up slightly).
    stickToLatestRef.current = true

    if (onSendMessage && !payload.attachment) {
      onSendMessage({ body, replyTo: quoted })
      return
    }

    setLocal((held) => [...held, localEcho(payload, viewer, quoted)])
  }

  const onContentSizeChange = useCallback(() => {
    if (!stickToLatestRef.current) return
    stickToLatestRef.current = false
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === 'day') {
        return (
          <View className="my-2 items-center">
            <Text variant="label" className="font-medium text-muted">
              {item.label}
            </Text>
          </View>
        )
      }
      const content = contentOf(item.message)
      return (
        <MessageBubble
          messageId={item.message.id}
          body={content.body}
          attachment={content.attachment}
          outgoing={isOutgoing(item.message, viewer.id)}
          status={item.message.receiptStatus}
          senderName={item.senderName}
          quoted={quotedById.get(item.message.id)}
          reactions={groupReactions(item.message.reactions)}
          currentUserId={viewer.id}
          selected={menuId === item.message.id}
          enter={isLocalId(item.message.id)}
          delivery={delivery?.get(item.message.id)}
          onRetrySend={onRetrySend}
          onOpenMenu={openMenu}
          onReply={handleReply}
          onToggleReaction={handleToggleReaction}
        />
      )
    },
    [
      handleReply,
      handleToggleReaction,
      viewer.id,
      menuId,
      openMenu,
      quotedById,
      delivery,
      onRetrySend,
    ],
  )

  const host = (
    <View ref={hostRef} collapsable={false} className="flex-1">
      <FlatList
        ref={listRef}
        inverted
        className="flex-1"
        scrollEnabled={!menuOpen}
        extraData={menuId}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="px-4 py-2"
        data={rows}
        keyExtractor={keyExtractor}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={onContentSizeChange}
        // Inverted, so the end of the list is the top of the thread: this fires
        // when someone scrolls back into history, which is when older pages load.
        onEndReached={onLoadOlder}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingOlder ? (
            <View className="items-center py-3">
              <ActivityIndicator accessibilityLabel="Loading older messages…" />
            </View>
          ) : null
        }
        // Anchor mid-thread when rows insert. Without MVCP, composer height
        // changes yank to offset 0. Without autoscrollToTopThreshold, new
        // index-0 rows stay under the composer while you were near latest.
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
          autoscrollToTopThreshold: NEAR_LATEST_PX,
        }}
        renderItem={renderItem}
        refreshControl={
          onRefresh
            ? makeRefreshControl(refreshing, onRefresh, { inverted: true })
            : undefined
        }
      />
      <Composer
        value={draft}
        onChangeText={setDraft}
        onSend={send}
        replyTo={replyQuote}
        onCancelReply={() => setReplyTo(null)}
        keyboardInset={keyboardInset}
      />
      {menu ? (
        <MessageActions
          anchor={menu}
          onDismiss={dismissMenu}
          onReact={(emoji) => handleToggleReaction(menu.messageId, emoji)}
          onReply={() => handleReply(menu.messageId)}
        />
      ) : null}
    </View>
  )

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <ThreadHeader conversation={conversation} organizationNames={organizationNames} />
      </InScreenHeader>
      {/*
        Android too: edge-to-edge sets `setDecorFitsSystemWindows(false)`, which
        makes `softwareKeyboardLayoutMode: "resize"` a no-op — the window never
        resizes and MainActivity pads only for system bars, so the composer and
        its reply banner sit behind the IME unless something lifts them.
        `useKeyboardInset` reports residual overlap only (raw height minus what
        a host like Expo Go already absorbed via window resize). See
        lib/keyboard-inset.ts. KeyboardAvoidingView cannot, because it measures
        against a parent-relative frame.
      */}
      <View className="flex-1" style={{ paddingBottom: keyboardInset }}>
        {host}
      </View>
    </View>
  )
}

/** A message this screen shows and does not send. See `send`. */
function localEcho(
  payload: ComposerSendPayload,
  viewer: ThreadViewer,
  replyTo: Message | null,
): Message {
  return draftMessage({
    id: `${LOCAL_ID_PREFIX}${Date.now()}`,
    body: payload.body.trim(),
    author: viewer,
    replyTo,
    attachments: payload.attachment ? [toMessageAttachment(payload.attachment)] : [],
  })
}
