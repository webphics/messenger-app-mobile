import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Pressable,
  View,
  type ViewInstance,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useReducedMotion } from 'react-native-reanimated'

import { AlertCircle, X } from '@/components/icons'
import { Composer, type ComposerSendPayload } from '@/components/chat/composer'
import { InvitationCard } from '@/components/chat/invitation-card'
import { MessageActions } from '@/components/chat/message-actions'
import { NoteSheet } from '@/components/chat/note-sheet'
import { MessageEditSheet } from '@/components/chat/message-edit-sheet'
import { ReportSheet, type ReportTarget } from '@/components/moderation/report-sheet'
import { MessageHistorySheet } from '@/components/chat/message-history-sheet'
import { ThreadDayPill } from '@/components/chat/thread-day-pill'
import { MessageBubble, type QuotedMessage } from '@/components/chat/message-bubble'
import { ThreadHeader } from '@/components/chat/thread-header'
import { TypingIndicator } from '@/components/chat/typing-indicator'
import { InScreenHeader } from '@/components/in-screen-header'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { attachmentViews, primaryAttachmentView } from '@/lib/attachment-view'
import type { Capability } from '@/lib/capabilities'
import { chatMessageInfoHref } from '@/lib/chat-route-id'
import { readStampLabel } from '@/lib/message-read-stamp'
import { useMessageReceipts } from '@/lib/use-message-receipts'
import { rejectUploadReason } from '@/lib/attachment-upload'
import {
  composerView,
  messageActions,
  messageNoteOffered,
  type WayOut,
  type WayOutButton,
} from '@/lib/conversation-access'
import type { ApiFailure } from '@/lib/conversation-api'
import type { Typist } from '@/lib/realtime-events'
import { conversationTitle } from '@/lib/conversation-title'
import {
  isLocalId,
  isOutgoing,
  isSystemMessage,
  messageSenderName,
  type DeliveryState,
  type SendDraft,
} from '@/lib/thread-state'
import { useKeyboardInset } from '@/lib/keyboard-inset'
import {
  isImageOrVideo,
  quoteAttachmentText,
  quoteLayoutMode,
  type BubbleContent,
} from '@/lib/message-attachment'
import { offersEditHistory } from '@/lib/message-history'
import { confirmDeleteMessage } from '@/lib/confirm-delete-message'
import { messageModeration } from '@/lib/message-moderation'
import { useBlockPerson } from '@/lib/use-block-person'
import { adminOnlyLabel } from '@/lib/message-invitation'
import { groupReactions } from '@/lib/message-react'
import { colors } from '@/lib/tokens'
import { makeRefreshControl } from '@/lib/simulated-refresh'
import { threadNotice, type ThreadNotice } from '@/lib/thread-notice'
import { onNoteJump, takeNoteJump } from '@/lib/note-jump'
import { jumpStep } from '@/lib/thread-jump'
import { buildThreadRows, threadDayMarks, type ThreadRow } from '@/lib/thread-rows'
import {
  anchorFromPayload,
  type OpenMenuPayload,
  type ReactionAnchor,
} from '@/lib/overlay-frame'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, Message, UserRole } from '@/lib/types'
import { useWallPostReplyDraft } from '@/lib/use-wall-post-reply-draft'
import { wallPostHref } from '@/lib/wall-route'

export type ThreadViewer = {
  id: string
  name: string
  role: UserRole
  /** The session's effective set, for controls the API gates on a capability. */
  capabilities: readonly Capability[]
}

type ThreadScreenProps = {
  conversation: Conversation
  /** Oldest first. Owned by the caller, which is what fetches and pages it. */
  messages: Message[]
  viewer: ThreadViewer
  /**
   * Whether Support DMs are worked by assignment, or as a Shared queue where any
   * staff member answers one. See `lib/support-assignment`.
   */
  supportAssignment: boolean
  organizationNames?: ReadonlyMap<string, string>
  /**
   * The Post a Reply on a Post (#77) opened this thread with, read once on
   * mount. It waits in the composer and goes out as a card with the next
   * message, or on its own; the person can leave it out.
   */
  initialWallPostId?: string
  /** True only while the first page is out and there is nothing yet to draw. */
  loading?: boolean
  /**
   * Why the thread could not be read, when it could not be.
   *
   * Drawn over an empty thread, and beside a thread that is not. A page that
   * failed while Messages are already on screen — a scroll into history with no
   * signal, a refresh that did not land — takes nothing away from what is there:
   * the Messages are still the Messages, and it goes in one line above the
   * composer instead. `threadNotice` is where the two are told apart.
   */
  failure?: ApiFailure | null
  /** Ask for the first page again. Offered beside the reason it did not arrive. */
  onRetry?: () => void
  /** Put away a read failure reported beside Messages that are still drawn. */
  onDismissFailure?: () => void
  /**
   * After the Customer joins an organization from an Invitation card, so the inbox learns the
   * membership it now has. Absent where nothing needs telling.
   */
  onInvitationJoined?: () => void
  /** Scrolling to the top of the thread asks for the page before it. */
  onLoadOlder?: () => void
  loadingOlder?: boolean
  /** Whether `onLoadOlder` has anything left to fetch. Bounds a jump to a quoted message. */
  hasOlder?: boolean
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
   * A reaction tapped on a bubble, on its way to the API.
   *
   * This screen decides nothing about it — not what the tap means, not what it
   * leaves the message holding. It reports the tap and draws whatever comes back
   * in `messages`, so the reaction on screen is the one that has been written
   * rather than one this screen is remembering.
   *
   * Required, like `onSendMessage` and for the same reason: a reaction row that
   * reported nowhere is exactly what this screen used to have.
   */
  onToggleReaction: (messageId: string, emoji: string) => void
  /**
   * Rewrite a message this person sent, and answer the refusal to show or null.
   *
   * Required for the same reason `onToggleReaction` is: the menu item is offered
   * from here, and one that reported nowhere would be a control that does
   * nothing. Who may edit is `messageActions`'s in `lib/conversation-access`,
   * judged where the menu opens. This only carries the words.
   */
  onEditMessage: (messageId: string, body: string) => Promise<string | null>
  /**
   * Delete a message for everyone, and answer the refusal to show or null.
   *
   * Offered only where `messageActions` in `lib/conversation-access` says so,
   * which is the API's `deletable` and `deleteMessages`. This screen asks first
   * and says why when it is refused; the removal and the rollback are the
   * thread's. Absent where nothing can delete, which offers no Delete at all.
   */
  onDeleteMessage?: (messageId: string) => Promise<string | null>
  /**
   * Write an internal note about a message, and answer the refusal to show or
   * null. Offered only where `messageNoteOffered` says the conversation's
   * `access` has `writeNotes`; absent where nothing writes notes.
   */
  onAddNote?: (messageId: string, text: string) => Promise<string | null>
  /**
   * Take the way out of a read-only thread the API offered: engage it, take it
   * over, or reopen it.
   *
   * Which one, and whether there is one at all, is the conversation's `access`.
   * An announcement, a restricted Group and an Agent looking at a conversation
   * another Agent engaged all have a reason and no way out of it.
   */
  onAssign?: (wayOut: WayOut) => void
  /** True from the tap until the API answers, so the button says it is working. */
  assigning?: boolean
  /** What the API said when the last attempt was refused. */
  assignError?: string | null
  /** Who else is composing here, as the API reported it for this viewer. */
  typists?: Typist[]
  /** A draft with words in it changed. The caller throttles it into a heartbeat. */
  onTyping?: () => void
  /** The draft emptied or went out. */
  onStopTyping?: () => void
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
 * Module-level because FlatList keeps the first config it is given and throws
 * outright on a changed one: a constant cannot change, which is the guarantee
 * the list wants, stated where nobody can accidentally make it per-render.
 */
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 }

/**
 * Why there is no composer, where there is none.
 *
 * Sits where the composer would, because that is where someone looks to write —
 * an absent control with the explanation elsewhere reads as a thread that failed
 * to load rather than as one this person may only read.
 */
function ReadOnlyNotice({
  reason,
  wayOut,
  onAssign,
  assigning = false,
  error = null,
}: {
  reason: string
  wayOut: WayOutButton | null
  onAssign?: (wayOut: WayOut) => void
  assigning?: boolean
  error?: string | null
}) {
  const insets = useSafeAreaInsets()
  const offered = wayOut && onAssign ? wayOut : null

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
          onPress={() => onAssign?.(offered.wayOut)}
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
 * A red line above the composer, and a way to put it away.
 *
 * Two things use it and both sit beside a thread that is still on screen: a send
 * that did not land, in the API's own words, and a page of the thread that did
 * not arrive. Neither takes anything away from what is drawn, which is why both
 * are a strip rather than a screen, and both are dismissed rather than retried —
 * the Message is still there to send again, and the page comes back on the next
 * pull or the next reconnect.
 */
function FailureStrip({
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
          // A 14px glyph, so the touchable it stands for is drawn out to the 44px
          // a finger needs rather than to the icon a design put there.
          hitSlop={16}
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

/**
 * A thread with nothing in it, and why.
 *
 * Over the list rather than inside it: an inverted `FlatList` renders its empty
 * component through the same flip as its rows, which would stand this on its
 * head. There is nothing under it to reach past — the list is empty, which is
 * the only reason this is here.
 *
 * The header and the composer stay where they are. Somewhere to write and a way
 * back are what keep a thread that could not be read from being a dead end, and
 * an empty thread is often exactly right: a conversation nobody has said
 * anything in yet.
 *
 * Which of the three it is, is `threadNotice`'s decision rather than this one's.
 */
function ThreadPlaceholder({
  notice,
  onRetry,
}: {
  notice: ThreadNotice
  onRetry?: () => void
}) {
  if (notice.kind === 'loading') {
    return (
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading messages…" />
      </View>
    )
  }

  if (notice.kind !== 'empty' && notice.kind !== 'failed') return null

  return (
    <View
      accessibilityLiveRegion="polite"
      // Lets a pull-to-refresh through on an empty thread: nothing here is a
      // touch responder except the button, and there is a list underneath.
      pointerEvents="box-none"
      className="absolute inset-0 items-center justify-center gap-1 px-8"
    >
      <Text variant="title" className="text-center text-ink">
        {notice.title}
      </Text>
      <Text variant="meta" className="text-center text-muted">
        {notice.hint}
      </Text>
      {notice.kind === 'failed' && onRetry ? (
        <Button variant="outline" className="mt-4" onPress={onRetry}>
          <Text>Try again</Text>
        </Button>
      ) : null}
    </View>
  )
}

export function ThreadScreen({
  conversation,
  messages,
  viewer,
  supportAssignment,
  organizationNames,
  initialWallPostId,
  loading = false,
  failure = null,
  onRetry,
  onDismissFailure,
  onInvitationJoined,
  onLoadOlder,
  loadingOlder = false,
  hasOlder = false,
  refreshing = false,
  onRefresh,
  onSendMessage,
  delivery,
  onRetrySend,
  sendError = null,
  onDismissSendError,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
  onAddNote,
  onAssign,
  assigning = false,
  assignError = null,
  typists = [],
  onTyping,
  onStopTyping,
}: ThreadScreenProps) {
  const keyboardInset = useKeyboardInset()
  const hostRef = useRef<ViewInstance>(null)
  const listRef = useRef<FlatList<ThreadRow>>(null)
  const reduceMotion = useReducedMotion()
  const stickToLatestRef = useRef(false)
  const [draft, setDraft] = useState('')
  const pendingPost = useWallPostReplyDraft(initialWallPostId, conversation.organizationId)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  /**
   * The next message marked as a Complaint, and what it is about (null: the app itself). Cleared
   * once it is sent, so each Complaint is marked on purpose.
   */
  const [complaint, setComplaint] = useState<{ organizationId: string | null } | null>(null)
  /**
   * The organizations a Complaint may be about: a Customer, in their General Support only, about
   * one of the organizations they belong to now.
   */
  const complaintOrganizations = useMemo(() => {
    if (viewer.role !== 'customer') return null
    if (conversation.type !== 'support_dm' || conversation.organizationId) return null
    return [...(organizationNames ?? new Map<string, string>())]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [viewer.role, conversation.type, conversation.organizationId, organizationNames])
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
   * Whether this person may write here, as the API said in the conversation's
   * `access`. See `lib/conversation-access`.
   *
   * Read-only covers every surface that writes, not only the composer: replies,
   * reactions and edits all follow it. An `access` this build could not read is
   * read-only too, until the refetch replaces the row.
   */
  const access = composerView(conversation.access, {
    writePolicy: 'writePolicy' in conversation ? conversation.writePolicy : null,
  })
  const readOnly = access.kind === 'read-only'

  /**
   * Why the last message did not go, whichever of the two reasons it was.
   *
   * Rendered above the composer *and* above the read-only line, because a thread
   * can become read-only between a send and its answer — an Admin takes it while
   * a message is in flight — and a failure that only ever appeared over a
   * composer would vanish exactly when it stopped being recoverable.
   */
  const notice = refusal ?? sendError ?? pendingPost.notice
  const dismissPostNotice = pendingPost.dismissNotice
  const dismissNotice = useCallback(() => {
    setRefusal(null)
    onDismissSendError?.()
    dismissPostNotice()
  }, [onDismissSendError, dismissPostNotice])


  /**
   * Saved responses in the composer: staff only, since the API refuses a
   * Customer's read. Every staff thread offers the viewer's personal ones; a
   * thread that belongs to an organization offers that organization's too.
   */
  const isStaffViewer = viewer.role !== 'customer'
  const savedResponsesOrganizationId = conversation.organizationId ?? null
  const placeholderCustomer = isStaffConversation(conversation)
    ? (conversation.customer?.name ?? null)
    : null
  const placeholderOrganization = isStaffConversation(conversation)
    ? (conversation.organizationName ??
      (conversation.organizationId ? organizationNames?.get(conversation.organizationId) : null) ??
      null)
    : null
  const savedResponses = useMemo(
    () =>
      isStaffViewer
        ? {
            organizationId: savedResponsesOrganizationId,
            placeholders: {
              name: placeholderCustomer,
              myName: viewer.name,
              organization: placeholderOrganization,
            },
          }
        : null,
    [
      isStaffViewer,
      savedResponsesOrganizationId,
      placeholderCustomer,
      placeholderOrganization,
      viewer.name,
    ],
  )
  const rows = useMemo(
    () =>
      buildThreadRows(messages, {
        viewer: { id: viewer.id, role: viewer.role },
        conversationType: conversation.type,
      }),
    [messages, viewer.id, viewer.role, conversation.type],
  )

  /**
   * Which day each row sits under, and where that day begins. Worked out once
   * per page rather than on every scroll frame — see `threadDayMarks`.
   */
  const dayMarks = useMemo(() => threadDayMarks(rows), [rows])

  /**
   * The newest *bubble* in the thread: the one that states its time unasked, and
   * the only one worth spending a request on.
   *
   * Not simply the last of `messages`. An Engage, take-over or transfer notice is
   * a statement about the thread rather than a message in it, and it is drawn as
   * a divider with no bubble to hang a time on — so a thread whose newest entry
   * is one would have had no time on it anywhere. Staff see those; a Customer's
   * have already been filtered out by here, which is why this looks past them
   * rather than at `rows`.
   */
  const latest = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!
      if (!isSystemMessage(message)) return message
    }
    return undefined
  }, [messages])
  const latestIsMine = latest ? isOutgoing(latest, viewer.id) : false

  /*
    Only for the viewer's own newest message. Somebody else's receipts are a 403,
    and a message this device is still carrying has no id the server knows.
  */
  const { state: latestReceipts } = useMessageReceipts(
    latest && latestIsMine && !isLocalId(latest.id) ? conversation.id : null,
    latest && latestIsMine && !isLocalId(latest.id) ? latest.id : null,
    latest?.receiptStatus,
  )

  const latestStamp = useMemo(() => {
    if (!latest) return undefined
    return readStampLabel({
      isMine: latestIsMine,
      status: latest.receiptStatus,
      createdAt: latest.createdAt,
      receipts: latestReceipts.status === 'ready' ? latestReceipts.receipts : null,
    })
  }, [latest, latestIsMine, latestReceipts])

  /**
   * The row the floating pill is speaking for: the topmost one on screen.
   *
   * The list is inverted, so the topmost visible row is the *last* of the
   * viewable ones rather than the first — which is also why this is a row index
   * rather than a scroll offset. Held as an index so the label and the jump both
   * fall out of `dayMarks` rather than being tracked separately.
   */
  const [topRowIndex, setTopRowIndex] = useState(0)
  const activeDay = dayMarks[topRowIndex]

  /**
   * Withheld while the day's own divider is the topmost row, which is exactly
   * where a tap on the pill leaves the reader: the label would otherwise be drawn
   * twice, a few pixels apart, with the pill covering the divider it is echoing.
   * No measurement needed — the divider being the top row is the same fact.
   */
  const dayPillLabel =
    activeDay && activeDay.dividerIndex !== topRowIndex ? activeDay.label : ''

  /*
    Stable for the life of the mount because FlatList keeps the first callback it
    is given and ignores a later identity. Nothing here closes over a rendered
    value — `setTopRowIndex` is itself stable — so an empty dependency list is
    the whole of it, and the topmost row is the largest index on an inverted list.
  */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | undefined }[] }) => {
      let top = -1
      for (const item of viewableItems) {
        if (item.index !== undefined && item.index > top) top = item.index
      }
      if (top >= 0) setTopRowIndex(top)
    },
    [],
  )

  /**
   * Where the row a scroll asked for should land: the top of the screen for a
   * day's start, the middle for a quoted message. Read by the retry below, which
   * is handed the index and nothing about why it was asked for.
   */
  const scrollViewPositionRef = useRef(1)

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      })
      // One frame is not enough on a cold window: the rows have to mount and
      // measure before the second attempt has anything better to go on.
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          animated: false,
          viewPosition: scrollViewPositionRef.current,
        })
      }, 80)
    },
    [],
  )

  /**
   * A tap on a reply's quote: the original it answers, and how many older pages
   * have been asked for while looking for it. Null when nothing is being looked
   * for. See `jumpStep`.
   */
  const [jump, setJump] = useState<{
    targetId: string
    pagesLoaded: number
    /** Said when the walk gives up: a quote and a note name different things. */
    missing: string
  } | null>(null)
  /** The original a jump landed on, flashed so the eye finds it. */
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- the walk advances when a
     page of history lands, which is the outside world answering; each step is
     decided by what arrived, so it cannot move into the tap that started it. */
  useEffect(() => {
    if (!jump) return
    const step = jumpStep(rows, jump.targetId, {
      pagesLoaded: jump.pagesLoaded,
      loadingOlder,
      canLoadOlder: hasOlder && Boolean(onLoadOlder),
    })

    if (step.kind === 'wait') return
    if (step.kind === 'scroll') {
      setJump(null)
      scrollViewPositionRef.current = 0.5
      listRef.current?.scrollToIndex({
        index: step.index,
        animated: !reduceMotion,
        viewPosition: 0.5,
      })
      setHighlightedId(jump.targetId)
      return
    }
    if (step.kind === 'give-up') {
      setJump(null)
      setRefusal(jump.missing)
      return
    }

    // Counted whether or not the load fetched anything. One that had nothing to
    // ask for changes no rows, and the count is what still brings this to an end.
    onLoadOlder?.()
    setJump({ ...jump, pagesLoaded: jump.pagesLoaded + 1 })
  }, [jump, rows, loadingOlder, hasOlder, onLoadOlder, reduceMotion])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!highlightedId) return
    const done = setTimeout(() => setHighlightedId(null), 1600)
    return () => clearTimeout(done)
  }, [highlightedId])

  /** Asked by a bubble whose quote was tapped, with the reply's own id. */
  const jumpToQuoted = useCallback(
    (replyId: string) => {
      const reply = messages.find((message) => message.id === replyId)
      const targetId = reply?.replyTo?.id
      if (!targetId) return
      setHighlightedId(null)
      setJump({ targetId, pagesLoaded: 0, missing: 'The original message is no longer available.' })
    },
    [messages],
  )

  /**
   * "Jump to message" from a note on Conversation details, through the same
   * walk a quote takes. Taken on mount (details opened with no thread behind
   * it) and whenever one is asked for while this thread sits underneath.
   */
  useEffect(() => {
    const take = () => {
      const targetId = takeNoteJump(conversation.id)
      if (!targetId) return
      setHighlightedId(null)
      setJump({
        targetId,
        pagesLoaded: 0,
        missing: 'The message this note is about is no longer in the conversation.',
      })
    }
    take()
    return onNoteJump(take)
  }, [conversation.id])

  const jumpToDayStart = useCallback(() => {
    const mark = dayMarks[topRowIndex]
    if (!mark) return
    // `viewPosition: 1` is the top of the screen on an inverted list: the
    // transform flips the axis, so the scroll's "end" is what the reader sees
    // first.
    scrollViewPositionRef.current = 1
    listRef.current?.scrollToIndex({
      index: mark.dividerIndex,
      animated: !reduceMotion,
      viewPosition: 1,
    })
  }, [dayMarks, topRowIndex, reduceMotion])

  /**
   * What the thread says about itself, beyond its Messages.
   *
   * Counted off `messages` rather than off `rows`, because a day separator is a
   * row and is not something anybody wrote. The second count is what the API has
   * answered with: an Unsent Message is on screen and is not the thread having
   * been read, which is the difference between a strip in the corner and a
   * screen that says this device could not find out.
   */
  const confirmed = useMemo(
    () => messages.reduce((count, message) => (isLocalId(message.id) ? count : count + 1), 0),
    [messages],
  )

  const pageNotice = useMemo(
    () => threadNotice({ drawn: messages.length, confirmed, loading, failure, readOnly }),
    [messages.length, confirmed, loading, failure, readOnly],
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

  /**
   * The one bubble whose time a tap has asked for.
   *
   * One rather than a set: the question is "when was *that* one sent", asked of
   * one message at a time, and keeping every previous answer on screen would
   * slowly turn the thread into the wall of timestamps that showing the time
   * once per run exists to avoid. Tapping the same bubble again puts it away.
   */
  const [revealedTimeId, setRevealedTimeId] = useState<string | null>(null)
  const revealTime = useCallback((messageId: string) => {
    setRevealedTimeId((current) => (current === messageId ? null : messageId))
  }, [])

  /**
   * Message info is the sender's own record of who has seen what they wrote, so
   * it is offered on their messages and nobody else's — the API's rule, mirrored
   * here so the control is absent rather than present and answered with a 403.
   * A message this device is still carrying has no id the server would know.
   */
  const canShowInfo = useCallback(
    (anchor: ReactionAnchor) => anchor.mine && !isLocalId(anchor.messageId),
    [],
  )

  /**
   * Report and Block on somebody else's message (`messageModeration`). Report
   * opens one sheet for the thread, like the edit sheet; Block asks, and the
   * thread drops the sender's Messages itself once it lands
   * (`useThreadMessages` reads who is blocked).
   */
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const blockPerson = useBlockPerson()

  const moderationFor = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      return message
        ? messageModeration(message, viewer.id, conversation.type)
        : { report: false, block: null }
    },
    [messages, viewer.id, conversation.type],
  )

  const menuModeration = useMemo(
    () => (menu ? moderationFor(menu.messageId) : null),
    [menu, moderationFor],
  )
  const menuSender = menuModeration?.block ?? null

  /** The words Copy puts on the clipboard, or null where there are none. */
  const menuCopyText = useMemo(() => {
    if (!menu) return null
    const body = messages.find((item) => item.id === menu.messageId)?.body.trim()
    return body ? body : null
  }, [menu, messages])

  const copyMessage = useCallback((text: string) => {
    setMenu(null)
    void Clipboard.setStringAsync(text)
  }, [])

  const reportMessage = useCallback(
    (messageId: string) => {
      setMenu(null)
      setReportTarget({ targetKind: 'message', targetId: messageId, conversationId: conversation.id })
    },
    [conversation.id],
  )

  const blockSender = useCallback(
    (person: { id: string; name: string }) => {
      setMenu(null)
      void blockPerson(person)
    },
    [blockPerson],
  )

  const showMessageInfo = useCallback(
    (messageId: string) => {
      setMenu(null)
      router.push(chatMessageInfoHref(conversation.id, messageId))
    },
    [conversation.id],
  )

  /**
   * Whether this message can be reacted to at all.
   *
   * Two ways it cannot: the API refuses a reaction from someone who may only
   * read the thread, and a message this device is still carrying has no id the
   * server would recognise. Both are decided here rather than swallowed in the
   * handler, because a control that does nothing is worse than no control —
   * where this is false the emoji tray is not offered and the chips are not
   * buttons.
   */
  const canReact = useCallback(
    (messageId: string) => !readOnly && !isLocalId(messageId),
    [readOnly],
  )

  /**
   * The message the edit sheet is open on, held whole rather than by id.
   *
   * By id it would re-resolve against the thread, and the thread changes under
   * an edit — the author's own optimistic write lands in it — so the sheet would
   * be re-seeded from the body it just wrote while they were still typing.
   */
  const [messageToEdit, setMessageToEdit] = useState<Message | null>(null)

  /**
   * Whether this message can be rewritten, judged when the menu renders.
   *
   * Edit lives only in the long-press menu, and the menu is rebuilt each time it
   * opens, so reading the clock here is enough for Edit to be gone once the
   * window has passed, however long the thread stays open. Nothing ticks: a
   * window that closes while the menu is open is the API's refusal to give,
   * shown in the sheet. The adapter holds the whole rule (the conversation's
   * `editMessages`, the message's `editableUntil` and the unsent-message check)
   * and is table-tested.
   */
  const canEdit = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      if (!message) return false
      return messageActions(conversation.access, message, Date.now()).edit
    },
    [conversation.access, messages],
  )

  /**
   * Whether this message can be deleted, judged when the menu renders, like
   * `canEdit`. The whole rule is `messageActions`'s and is table-tested.
   */
  const canDelete = useCallback(
    (messageId: string) => {
      if (!onDeleteMessage) return false
      const message = messages.find((item) => item.id === messageId)
      if (!message) return false
      return messageActions(conversation.access, message, Date.now()).delete
    },
    [conversation.access, messages, onDeleteMessage],
  )

  /**
   * Ask, then delete. The thread drops the message on the confirm and puts it
   * back on a refusal, so all this adds is the question before and the reason
   * after.
   */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      setMenu(null)
      if (!message || !onDeleteMessage) return
      if (!(await confirmDeleteMessage(message))) return
      const refusal = await onDeleteMessage(messageId)
      if (refusal) Alert.alert('Could not delete message', refusal)
    },
    [messages, onDeleteMessage],
  )

  /** The message the note sheet is open on, held whole like `messageToEdit`. */
  const [noteTarget, setNoteTarget] = useState<Message | null>(null)

  /** Whether Add note is offered on this message. `messageNoteOffered` holds the rule. */
  const canAddNote = useCallback(
    (messageId: string) => {
      if (!onAddNote) return false
      const message = messages.find((item) => item.id === messageId)
      if (!message) return false
      return messageNoteOffered(conversation.access, message)
    },
    [conversation.access, messages, onAddNote],
  )

  const openNoteSheet = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      setMenu(null)
      if (message) setNoteTarget(message)
    },
    [messages],
  )

  const noteAbout = useMemo(() => {
    if (!noteTarget) return null
    return {
      name:
        messageSenderName(noteTarget) ??
        (isOutgoing(noteTarget, viewer.id)
          ? 'You'
          : conversationTitle(conversation, organizationNames)),
      body: quoteAttachmentText(contentOf(noteTarget)),
    }
  }, [noteTarget, viewer.id, conversation, organizationNames])

  const openEditSheet = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      if (!message) return
      setMenu(null)
      setMessageToEdit(message)
    },
    [messages],
  )

  /**
   * The message whose edit history is open, by id rather than whole, unlike the
   * edit sheet: the history should follow the message as it changes, so an edit
   * landing over the socket while it is open re-reads it (`useMessageHistory`).
   */
  const [historyMessageId, setHistoryMessageId] = useState<string | null>(null)
  const historyMessage = useMemo(
    () => (historyMessageId ? (messages.find((item) => item.id === historyMessageId) ?? null) : null),
    [historyMessageId, messages],
  )

  /** Any edited message the server holds, whoever sent it and whatever the thread allows. */
  const canShowHistory = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId)
      return message !== undefined && offersEditHistory(message)
    },
    [messages],
  )

  const openEditHistory = useCallback((messageId: string) => {
    setMenu(null)
    setHistoryMessageId(messageId)
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
      onToggleReaction?.(messageId, emoji)
      setMenu(null)
    },
    [onToggleReaction],
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
  /**
   * Every change to the draft, which is also what tells the room this person is
   * writing. Whitespace is not writing: a draft of spaces is an empty one.
   */
  function changeDraft(text: string) {
    setDraft(text)
    if (text.trim()) onTyping?.()
    else onStopTyping?.()
  }

  function send(payload: ComposerSendPayload): boolean {
    const body = payload.body.trim()
    const wallPost = pendingPost.wallPost
    if (!body && !payload.attachment && !wallPost) return false

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
    // The words have gone, so the bubble on everyone else's screen goes with
    // them rather than standing until the server's expiry.
    onStopTyping?.()
    const quoted = replyTo
    setReplyTo(null)
    // MVCP keeps the prior newest row fixed; after layout, pin offset 0 so the
    // sent bubble clears the composer (autoscroll threshold alone skips if the
    // user had scrolled up slightly).
    stickToLatestRef.current = true

    const complaintOrganizationId = complaint?.organizationId ?? null
    onSendMessage({
      body,
      replyTo: quoted,
      ...(wallPost ? { wallPost } : {}),
      ...(payload.attachment ? { attachments: [payload.attachment] } : {}),
      ...(complaint && complaintOrganizations
        ? {
            complaint: {
              organization: complaintOrganizationId
                ? {
                    id: complaintOrganizationId,
                    name: organizationNames?.get(complaintOrganizationId) ?? '',
                  }
                : null,
            },
          }
        : {}),
    })
    // One card per Post: it goes with this message and not the next.
    if (wallPost) pendingPost.clear()
    setComplaint(null)
    return true
  }

  const onContentSizeChange = useCallback(() => {
    if (!stickToLatestRef.current) return
    stickToLatestRef.current = false
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
  }, [])

  /** A Reply to a Post's card opens the Post, judged again for this reader there. */
  const openWallPost = useCallback((postId: string) => {
    router.push(wallPostHref(postId))
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
        if (item.message.invitation) {
          return (
            <InvitationCard
              invitation={item.message.invitation}
              sentAt={item.message.createdAt}
              canAnswer={viewer.role === 'customer'}
              onJoined={onInvitationJoined}
            />
          )
        }
        return <SystemNotice body={item.message.body} />
      }
      const content = contentOf(item.message)
      return (
        <MessageBubble
          messageId={item.message.id}
          body={content.body}
          attachments={attachmentViews(item.message.attachments)}
          outgoing={item.stance.isMine}
          colleague={item.stance.variant === 'colleague'}
          status={item.message.receiptStatus}
          createdAt={item.message.createdAt}
          edited={Boolean(item.message.editedAt)}
          onOpenEditHistory={offersEditHistory(item.message) ? openEditHistory : undefined}
          endsRun={item.endsRun}
          showTime={item.message.id === latest?.id}
          timeLabel={item.message.id === latest?.id ? latestStamp : undefined}
          timeRevealed={revealedTimeId === item.message.id}
          onRevealTime={revealTime}
          senderName={item.senderName}
          senderRole={item.senderRole}
          quoted={quotedById.get(item.message.id)}
          onPressQuote={item.message.replyTo ? jumpToQuoted : undefined}
          wallPost={item.message.wallPost}
          onOpenWallPost={openWallPost}
          privateLabel={adminOnlyLabel(item.message)}
          highlighted={highlightedId === item.message.id}
          reactions={groupReactions(item.message.reactions)}
          currentUserId={viewer.id}
          selected={menuId === item.message.id}
          enter={isLocalId(item.message.id)}
          delivery={delivery?.get(item.message.id)}
          onRetrySend={onRetrySend}
          // Nothing for it to open in a thread this person may only read: they
          // can neither reply nor react in one.
          onOpenMenu={readOnly ? undefined : openMenu}
          onReply={handleReply}
          onToggleReaction={canReact(item.message.id) ? handleToggleReaction : undefined}
        />
      )
    },
    [
      canReact,
      handleReply,
      handleToggleReaction,
      viewer.id,
      menuId,
      openMenu,
      readOnly,
      quotedById,
      delivery,
      onRetrySend,
      revealedTimeId,
      revealTime,
      latest?.id,
      latestStamp,
      jumpToQuoted,
      highlightedId,
      openEditHistory,
      openWallPost,
      viewer.role,
      onInvitationJoined,
    ],
  )

  const host = (
    <View ref={hostRef} collapsable={false} className="flex-1">
      {/* Its own box, so what is drawn over an empty thread covers the list and
          not the composer under it. */}
      <View className="flex-1">
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
          viewabilityConfig={VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          /*
            The day pill can ask for a row far outside the rendered window, and
            `scrollToIndex` throws for one the list has not measured -- with
            `windowSize={5}` that is most of a long thread, so the jump would fail
            exactly when it is most useful. The fallback is the documented one:
            land on an estimate, which renders the rows around it, then ask again
            now that the real offset is knowable.
          */
          onScrollToIndexFailed={onScrollToIndexFailed}
          ListFooterComponent={
            loadingOlder ? (
              <View className="items-center py-3">
                <ActivityIndicator accessibilityLabel="Loading older messages…" />
              </View>
            ) : undefined
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
        {/* Over the list rather than in it, so it stays put while the thread
            scrolls underneath.

            Withheld for the three notices that cover the list whole — there is no
            thread drawn underneath to say the day of. `none` and `stale` both
            leave one drawn, which is why this tests the kind rather than the
            notice: `pageNotice` is a union that is always present, so testing it
            for truth hid the pill in every thread. */}
        {pageNotice.kind === 'none' || pageNotice.kind === 'stale' ? (
          <ThreadDayPill label={dayPillLabel} onPress={jumpToDayStart} />
        ) : null}
        <ThreadPlaceholder notice={pageNotice} onRetry={onRetry} />
      </View>
      {/*
        Above the composer rather than the newest row of the thread: it sits by
        the field the typing is happening in, in the same place whether the
        thread holds a thousand messages or none, and it never moves the list.
      */}
      <TypingIndicator typists={typists} isGroup={conversation.type === 'group'} />
      {pageNotice.kind === 'stale' ? (
        <FailureStrip message={pageNotice.message} onDismiss={onDismissFailure} />
      ) : null}
      {notice ? <FailureStrip message={notice} onDismiss={dismissNotice} /> : null}
      {access.kind === 'read-only' ? (
        <ReadOnlyNotice
          reason={access.reason}
          wayOut={access.wayOut}
          onAssign={onAssign}
          assigning={assigning}
          error={assignError}
        />
      ) : (
        <Composer
          value={draft}
          onChangeText={changeDraft}
          onSend={send}
          replyTo={replyQuote}
          onCancelReply={() => setReplyTo(null)}
          wallPost={pendingPost.wallPost}
          onRemoveWallPost={pendingPost.clear}
          keyboardInset={keyboardInset}
          savedResponses={savedResponses}
          complaintOrganizations={complaintOrganizations}
          complaint={complaint}
          onComplaintChange={setComplaint}
        />
      )}
      {menu ? (
        <MessageActions
          anchor={menu}
          onDismiss={dismissMenu}
          onReact={
            canReact(menu.messageId)
              ? (emoji) => handleToggleReaction(menu.messageId, emoji)
              : undefined
          }
          onReply={readOnly ? undefined : () => handleReply(menu.messageId)}
          onCopy={menuCopyText ? () => copyMessage(menuCopyText) : undefined}
          onEdit={canEdit(menu.messageId) ? () => openEditSheet(menu.messageId) : undefined}
          onHistory={
            canShowHistory(menu.messageId) ? () => openEditHistory(menu.messageId) : undefined
          }
          onInfo={canShowInfo(menu) ? () => showMessageInfo(menu.messageId) : undefined}
          onReport={menuModeration?.report ? () => reportMessage(menu.messageId) : undefined}
          onBlock={menuSender ? () => blockSender(menuSender) : undefined}
          blockLabel={menuSender ? `Block ${menuSender.name}` : undefined}
          onDelete={canDelete(menu.messageId) ? () => void deleteMessage(menu.messageId) : undefined}
          onAddNote={canAddNote(menu.messageId) ? () => openNoteSheet(menu.messageId) : undefined}
        />
      ) : null}

      <ReportSheet
        visible={reportTarget !== null}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />

      {/*
        Mounted beside the overlay rather than per bubble: one sheet serves the
        thread, and a Modal per row on a virtualised list is a window per row.
      */}
      {messageToEdit ? (
        <MessageEditSheet
          visible
          message={messageToEdit}
          onClose={() => setMessageToEdit(null)}
          onSave={(body) => onEditMessage(messageToEdit.id, body)}
        />
      ) : null}

      <NoteSheet
        visible={noteTarget !== null && Boolean(onAddNote)}
        title="Add note"
        about={noteAbout}
        onClose={() => setNoteTarget(null)}
        onSave={(text) =>
          noteTarget && onAddNote ? onAddNote(noteTarget.id, text) : Promise.resolve(null)
        }
      />

      <MessageHistorySheet
        conversationId={conversation.id}
        message={historyMessage}
        onClose={() => setHistoryMessageId(null)}
      />
    </View>
  )

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
        <ThreadHeader
          conversation={conversation}
          organizationNames={organizationNames}
          supportAssignment={supportAssignment}
        />
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

