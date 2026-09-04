import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  FlatList,
  Pressable,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AlertCircle, X } from '@/components/icons'
import { Composer, type ComposerSendPayload } from '@/components/chat/composer'
import { MessageActions } from '@/components/chat/message-actions'
import { MessageBubble, type QuotedMessage } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { InScreenHeader } from '@/components/in-screen-header'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { attachmentViews, primaryAttachmentView } from '@/lib/attachment-view'
import { rejectUploadReason } from '@/lib/attachment-upload'
import { composerAccess, type ComposerAction } from '@/lib/composer-access'
import { conversationTitle } from '@/lib/conversation-title'
import {
  isLocalId,
  isOutgoing,
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
   * Where a typed message goes. Required: every thread this screen opens has a
   * conversation behind it, and a composer whose send goes nowhere is worse
   * than no composer at all.
   */
  onSendMessage: (draft: SendDraft) => void
  /** How far each message this device is still carrying has got, by id. */
  delivery?: ReadonlyMap<string, DeliveryState>
  onRetrySend?: (messageId: string) => void
  /** Why the last send did not land, in the API's own words. See `useThreadMessages`. */
  sendError?: string | null
  onDismissSendError?: () => void
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

/**
 * What a quote strip or a preview line draws out of a message.
 *
 * One attachment, because those have room for one label. A *bubble* draws every
 * attachment the message carries — see `attachmentViews` — and the two are
 * deliberately different questions.
 */
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
 * Why the last send did not land.
 *
 * Directly above the composer rather than as an alert, because the bubble it is
 * about is still on screen a few rows up, still marked *Not sent*, and still
 * offering a retry — a modal over all of that would hide the thing it is
 * explaining. Dismissible, so a refusal a person has read and acted on does not
 * sit over the composer for the rest of the conversation.
 */
function SendErrorNotice({
  message,
  onDismiss,
}: {
  message: string
  onDismiss?: () => void
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2 border-t border-line/60 bg-danger/10 px-4 py-2"
    >
      <AlertCircle color={colors.danger} size={14} />
      <Text variant="meta" className="min-w-0 flex-1 text-danger">
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={10}
          onPress={onDismiss}
          className="shrink-0 active:opacity-60"
        >
          <X color={colors.danger} size={14} />
        </Pressable>
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
  sendError = null,
  onDismissSendError,
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
   * A file this screen refused before it was ever sent.
   *
   * Held here rather than by the caller because the caller never heard about it:
   * nothing was sent. It shares the one notice with `sendError`, which is what a
   * *sent* message came back with — two sources, one line, because to the person
   * reading it they are the same sentence about the same message.
   */
  const [refusal, setRefusal] = useState<string | null>(null)

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

  /**
   * Why the last message did not go, whichever of the two reasons it was.
   *
   * Rendered above the composer *and* above the read-only line, because a thread
   * can become read-only between a send and its answer — an Admin takes it while
   * a message is in flight — and a failure that only ever appeared over a
   * composer would vanish exactly when it stopped being recoverable.
   */
  const notice = refusal ?? sendError
  const dismissNotice = useCallback(() => {
    setRefusal(null)
    onDismissSendError?.()
  }, [onDismissSendError])

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
   * Everything goes to the API through `onSendMessage`, attachments included:
   * the caller uploads the file and then sends the message naming it, and the
   * bubble it put on screen arrives back in `messages` with a delivery state, so
   * nothing about a send is held twice.
   *
   * A file the API would refuse is refused here instead, before anything is
   * spent carrying it up a mobile connection — the same rules, mirrored from
   * `conversations.upload.ts`, and the same reason the web client mirrors them.
   * The refusal goes to the notice above the composer, beside the file it is
   * about.
   *
   * Answers whether the message was taken, which is what tells the composer
   * whether to clear: a refused file stays staged beside the caption it had, so
   * the person can drop it and keep what they wrote.
   */
  function send(payload: ComposerSendPayload): boolean {
    const body = payload.body.trim()
    if (!body && !payload.attachment) return false

    if (payload.attachment) {
      const reason = rejectUploadReason(payload.attachment)
      if (reason) {
        // Into the same line every other send failure lands in, rather than an
        // alert: the file it is about is staged an inch below, and a modal over
        // the thing it is explaining is the one place it cannot be read beside.
        setRefusal(reason)
        // Refused, so the composer keeps the file and the caption: the person
        // has been told what is wrong and can act on it.
        return false
      }
    }

    setRefusal(null)
    const quoted = replyTo
    setReplyTo(null)
    // MVCP keeps the prior newest row fixed; after layout, pin offset 0 so the
    // sent bubble clears the composer (autoscroll threshold alone skips if the
    // user had scrolled up slightly).
    stickToLatestRef.current = true

    onSendMessage({
      body,
      replyTo: quoted,
      ...(payload.attachment ? { attachments: [payload.attachment] } : {}),
    })
    return true
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
          attachments={attachmentViews(item.message.attachments)}
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
      {notice ? <SendErrorNotice message={notice} onDismiss={dismissNotice} /> : null}
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

