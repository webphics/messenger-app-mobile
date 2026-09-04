import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Dimensions, FlatList, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Composer, type ComposerSendPayload } from '@/components/chat/composer'
import { MessageActions } from '@/components/chat/message-actions'
import { MessageBubble, type QuotedMessage } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { InScreenHeader } from '@/components/in-screen-header'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { primaryAttachmentView, toMessageAttachment } from '@/lib/attachment-view'
import { composerAccess, type ComposerAction } from '@/lib/composer-access'
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
import {
  isImageOrVideo,
  quoteAttachmentText,
  quoteLayoutMode,
  type BubbleContent,
} from '@/lib/message-attachment'
import { groupReactions, toggleReaction } from '@/lib/message-react'
import { colors } from '@/lib/tokens'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import { buildThreadRows, type ThreadRow } from '@/lib/thread-rows'
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
  /**
   * Claim this thread, or take it from whoever holds it.
   *
   * Absent where nothing can be done about a read-only thread, which is the
   * common case: a closed thread, an announcement, and an Agent looking at a
   * conversation another Agent engaged all have a reason and no way out of it.
   */
  onAssign?: (action: ComposerAction) => void
  /** True from the tap until the API answers, so the button says it is working. */
  assigning?: boolean
  /** What the API said when the last attempt was refused. */
  assignError?: string | null
}

/** What a bubble draws out of a message: its caption and the one attachment shown beside it. */
function contentOf(message: Message): BubbleContent {
  return { body: message.body, attachment: primaryAttachmentView(message.attachments) }
}

function keyExtractor(item: ThreadRow) {
  return item.id
}

/** How near inverted offset 0 (newest) before MVCP reveals inserted rows. */
const NEAR_LATEST_PX = 80

/**
 * Why there is no composer, where there is none.
 *
 * Sits where the composer would, because that is where someone looks to write —
 * an absent control with the explanation elsewhere reads as a thread that failed
 * to load rather than as one this person may only read.
 */
function ReadOnlyNotice({
  reason,
  action,
  onAssign,
  assigning = false,
  error = null,
}: {
  reason: string
  action?: ComposerAction
  onAssign?: (action: ComposerAction) => void
  assigning?: boolean
  error?: string | null
}) {
  const insets = useSafeAreaInsets()
  const offered = action && onAssign ? action : null

  return (
    <View
      accessibilityLiveRegion="polite"
      className="border-t border-line/60 bg-surface px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <Text variant="meta" className="text-center text-muted">
        {reason}
      </Text>
      {error ? (
        <Text variant="meta" className="mt-1 text-center text-danger">
          {error}
        </Text>
      ) : null}
      {offered ? (
        <Button
          // Kept enabled until the request starts, then disabled with a spinner
          // beside the label it already had — the label is what says which of
          // the two actions is under way.
          disabled={assigning}
          accessibilityLabel={offered.label}
          accessibilityState={{ disabled: assigning, busy: assigning }}
          className="mt-3"
          onPress={() => onAssign?.(offered)}
        >
          {assigning ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : null}
          <Text>{offered.label}</Text>
        </Button>
      ) : null}
    </View>
  )
}

/**
 * An Engage, Takeover or Transfer notice.
 *
 * Centred and unsided, because it is the thread's own record of what happened
 * to it rather than something either party said: giving it a bubble would put
 * an assignment event in somebody's mouth and a tick beside it. Staff only —
 * the API withholds these from a Customer, and `visibleMessages` drops them
 * again on the way in.
 */
function SystemNotice({ body }: { body: string }) {
  return (
    <View className="my-2 items-center px-6">
      {/* rounded-2xl, not rounded-full: a Transfer notice names two people and
          wraps, and a stadium around three lines of text is not a pill. */}
      <View className="max-w-full rounded-2xl bg-line/60 px-3.5 py-1.5">
        <Text variant="meta" className="text-center text-ink-soft">
          {body}
        </Text>
      </View>
    </View>
  )
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
  onAssign,
  assigning = false,
  assignError = null,
}: ThreadScreenProps) {
  const keyboardInset = useKeyboardInset()
  const hostRef = useRef<View>(null)
  const listRef = useRef<FlatList<ThreadRow>>(null)
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

  /**
   * Whether this person may write here.
   *
   * Reading and writing are different permissions on the staff side — one Agent
   * holds a Support DM and the rest read it — so the composer is not a given.
   * See `lib/composer-access.ts`, which mirrors the rule the API enforces.
   */
  const access = composerAccess(conversation, viewer)
  const readOnly = access.kind === 'read-only'

  const isGroup =
    conversation.type === 'group' || conversation.type === 'community_announcement'
  const rows = useMemo(
    () => buildThreadRows(messages, { viewerId: viewer.id, namesSenders: isGroup }),
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
    ({ item }: { item: ThreadRow }) => {
      if (item.type === 'day') {
        return (
          <View className="my-2 items-center">
            <Text variant="label" className="font-medium text-muted">
              {item.label}
            </Text>
          </View>
        )
      }
      if (item.type === 'system') {
        return <SystemNotice body={item.message.body} />
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
      <FlatList<ThreadRow>
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
      {access.kind === 'read-only' ? (
        <ReadOnlyNotice
          reason={access.reason}
          action={access.action}
          onAssign={onAssign}
          assigning={assigning}
          error={assignError}
        />
      ) : (
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          replyTo={replyQuote}
          onCancelReply={() => setReplyTo(null)}
          keyboardInset={keyboardInset}
        />
      )}
      {menu ? (
        <MessageActions
          anchor={menu}
          onDismiss={dismissMenu}
          onReact={(emoji) => handleToggleReaction(menu.messageId, emoji)}
          onReply={readOnly ? undefined : () => handleReply(menu.messageId)}
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
