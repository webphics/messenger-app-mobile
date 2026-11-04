import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addReaction,
  editMessage,
  listMessages,
  removeReaction,
  sendMessage,
  uploadAttachment,
  MESSAGE_PAGE_LIMIT,
  type ApiFailure,
} from '@/lib/conversation-api'
import { assignmentSwitchedOnNotice } from '@/lib/conversation-failure'
import { messageEditRefusal, withRefreshedQuotes } from '@/lib/message-edit'
import {
  forgetMessages,
  restoreOlderMessages,
  restoreThread,
  saveThread,
} from '@/lib/conversation-store'
import { missingStagedFiles } from '@/lib/staged-file'
import { isDeviceUri, missingFilesMessage, sendMessageType } from '@/lib/attachment-upload'
import {
  attachmentKindFromType,
  toAttachmentView,
  toMessageAttachment,
} from '@/lib/attachment-view'
import {
  applyIncomingMessage,
  applyMessagePage,
  applyNewestPage,
  applySentMessage,
  beginSend,
  beginUpload,
  deliveryStates,
  draftMessage,
  emptyThread,
  failSend,
  findUnsent,
  isFinalSendRefusal,
  isLocalId,
  mergeMessages,
  refuseSend,
  LOCAL_ID_PREFIX,
  threadMessages,
  vanishedFromNewestPage,
  withdrawSend,
  withoutMessages,
  withoutSenders,
  type DeliveryState,
  type MessageAuthor,
  type SendDraft,
  type ThreadState,
  type ThreadViewer,
} from '@/lib/thread-state'
import { toggleReaction } from '@/lib/message-react'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'
import { useBlockedIds } from '@/lib/blocks-context'
import { blocksApplyTo } from '@/lib/message-moderation'
import { useSupportAssignment } from '@/lib/use-support-assignment'
import { useConversationWriteRefused } from '@/lib/use-conversation-write-refused'
import type { Conversation, Message, MessageAttachment, UserRole } from '@/lib/types'

/**
 * One thread: its history a page at a time, and the messages typed into it.
 *
 * The decisions this makes are all in `lib/thread-state`, which is where
 * they are tested: what a page does to the thread already held, how far back the
 * next one asks from, when there is nothing further back to ask for, and what
 * becomes of a message between the tap on send and the API's answer. What that
 * state costs to keep is `lib/conversation-store`'s, which is handed the thread
 * whole and works out for itself which of its tables that moved. What is left
 * here is the part that is neither — when to ask, and how to ignore an answer
 * that arrived for a thread nobody is looking at any more.
 *
 * ## The thread opens on what this device already knows
 *
 * A thread that has been opened before is Restored from SQLite while the screen
 * is deciding what to draw, so its Messages are on the first frame rather than
 * after a round trip, and a phone with no signal opens it at all. The fetch that
 * follows confirms that rather than being the only thing that can draw it.
 *
 * Scrolling back reads this device before it reads the API: a page already held
 * comes off the disk, and only history that was never fetched costs a request.
 *
 * ## And on what it failed to send
 *
 * A message that did not get away is Restored with the thread, in its place,
 * marked *failed*, offering to go again. Nothing here sends one: the Outbox is
 * read on the way in and written on every change, and the only thing that
 * carries a message to the API is a tap. A support message somebody typed and
 * abandoned on Tuesday must not leave on Thursday because a phone was unlocked
 * — that is the whole difference between this and a send queue.
 */

export type ThreadMessages = {
  /** What to render: the pages fetched, with anything still sending folded in. */
  messages: Message[]
  /** How far each unconfirmed message has got, by id. Empty for a settled thread. */
  delivery: ReadonlyMap<string, DeliveryState>
  /** True only for the first page: paging older has its own flag. */
  loading: boolean
  loadingOlder: boolean
  /** Whether the API has history before the oldest page held — what a jump to a quote walks. */
  hasOlder: boolean
  refreshing: boolean
  failure: ApiFailure | null
  /**
   * Put away a read failure reported beside Messages that are still drawn.
   *
   * Only that one: over a thread with nothing to draw the failure is the whole
   * screen, and there is nothing underneath for putting it away to reveal.
   */
  dismissFailure: () => void
  /**
   * Why the last send did not land, in the API's own words.
   *
   * Separate from `failure`, which is about reading the thread and replaces what
   * is on screen. This one sits beside a bubble that is still there and marked
   * *Not sent*: the mark says that something went wrong, and this says what — a
   * file over the limit, a type the server refuses — which is the difference
   * between retrying and knowing not to.
   */
  sendError: string | null
  dismissSendError: () => void
  loadOlder: () => void
  refresh: () => void
  /**
   * Ask for the first page again, after one that did not arrive.
   *
   * Not `refresh`: that is a pull, and it reports itself through the control the
   * person pulled. This is a button on an empty thread, and what it has to show
   * is the thread loading — which is the state it left when the request failed.
   */
  retry: () => void
  /** Write a message to the thread. Answers nothing: the outcome arrives as state. */
  send: (draft: SendDraft) => void
  /** Send a failed message again, in place. */
  retrySend: (localId: string) => void
  /**
   * React to a message, or take back the reaction already on it.
   *
   * One call for both, because to the person it is one tap: `toggleReaction`
   * reads what they are holding and answers what they should be holding, and
   * this carries whichever of the two endpoints that turned out to mean.
   */
  react: (messageId: string, emoji: string) => void
  /**
   * Rewrite a message this person sent, inside the API's edit window.
   *
   * Answers the refusal to show, or null when it landed — unlike everything else
   * here, which reports itself through state. The sheet that calls this stays
   * open on a refusal with the reason under the box, so it needs the answer
   * rather than a flag somewhere else: an edit that failed has a draft the person
   * is still holding, and closing the sheet to show a banner would throw it away.
   */
  edit: (messageId: string, body: string) => Promise<string | null>
}

/**
 * What a failed send says out loud, or null when there is nothing worth saying.
 *
 * A refusal speaks in the API's own words, which are the ones worth showing: an
 * oversized file and an unsupported type both arrive that way. A request that
 * never landed gets a sentence written here, because "no connection" is
 * something a person can act on and the transport has nothing to say for itself.
 *
 * The other two say nothing. An expired session is already ending the session
 * around this, and a body this client could not read is a bug rather than
 * something to explain at a composer — for both, the bubble marked *Not sent*
 * has already said the useful part.
 */
function sendFailureMessage(failure: ApiFailure): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. The message is still here — try again.'
  return null
}

/**
 * What this device already holds for a thread, as a thread.
 *
 * Read while the screen is deciding what to draw rather than in an effect, so
 * the Messages are on the first frame: an effect runs after its children have
 * rendered, which would put one empty thread in front of the person before the
 * thing this exists to avoid.
 *
 * A thread nobody is signed in to, or none open, is an empty one. Everything
 * else — the Messages, the frontier they were read to, the Outbox, and the
 * filtering the rows get on the way out — is `lib/conversation-store`'s.
 */
function restoredThread(
  ownerId: string | null,
  conversationId: string | null,
  viewer: ThreadViewer | null,
): ThreadState {
  if (!ownerId || !conversationId || !viewer) return emptyThread()
  return restoreThread(ownerId, conversationId, viewer, MESSAGE_PAGE_LIMIT)
}

/** Nobody's Messages hidden: a Support DM, which blocks do not reach. */
const NO_BLOCKED_SENDERS: ReadonlySet<string> = new Set()

export function useThreadMessages(
  conversation: Conversation | null,
  role: UserRole,
  author: MessageAuthor | null = null,
): ThreadMessages {
  const [state, setState] = useState<ThreadState>(emptyThread)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const conversationId = conversation?.id ?? null
  const conversationType = conversation?.type ?? null
  /** Whose copy of this thread is on this device. A phone is shared; a Store is not. */
  const ownerId = author?.id ?? null

  /**
   * Who is reading this thread — one object, because a page, a socket event and
   * the Store must not be told different things about the same person.
   *
   * The id is empty for the roles still on local data, which sign nothing in and
   * so have no Store, no Outbox and no echo to resolve.
   */
  const viewer = useMemo<ThreadViewer | null>(
    () => (conversationType ? { id: ownerId ?? '', role, conversationType } : null),
    [ownerId, role, conversationType],
  )

  /** Which thread the answers coming back belong to, and which load of it. */
  const generation = useRef(0)
  /** One request at a time: `onEndReached` fires more than once per scroll. */
  const inFlight = useRef(false)
  /**
   * The thread on screen right now.
   *
   * A send is guarded against this rather than against `generation`, which a
   * refresh bumps: an answer landing after a pull-to-refresh is still an answer
   * about a message the person can see, and dropping it would leave that message
   * marked as sending for good.
   */
  const onScreen = useRef<string | null>(null)
  /** Makes each local id unique when two sends share a millisecond. */
  const localSequence = useRef(0)
  /**
   * The local ids with a request out for them.
   *
   * Retry reads the rendered state, and two taps inside one frame both read the
   * same failed message — this is what stops the second from sending the body a
   * second time under a second server id.
   */
  const delivering = useRef(new Set<string>())
  /**
   * How many reactions this screen has sent for each message.
   *
   * A tap answers immediately and the request follows it, so two taps on one
   * bubble put two requests out and the second is the one on screen. This is
   * what tells the first one's answer that it is stale — the same job
   * `generation` does for a page, kept per message because reacting to one
   * bubble says nothing about another.
   */
  const reacting = useRef(new Map<string, number>())
  /**
   * How many edits this screen has sent for each message.
   *
   * The same job `reacting` does one line up, and kept apart from it: a person
   * who edits a message and then reacts to it has two requests out on one bubble
   * that settle different fields, and one counter would let either answer
   * discard the other's.
   */
  const editing = useRef(new Map<string, number>())
  /**
   * The current state, for the callbacks that must read it without being rebuilt
   * by it. Retry lives on a memoised bubble, and a callback that changed
   * identity on every page and every send would re-render every bubble in the
   * thread. Written after commit, which is always before anyone can tap.
   */
  const held = useRef(state)
  useEffect(() => {
    held.current = state
  }, [state])

  /**
   * The assignment switch as this session read it, for the same callbacks: a
   * write refused because the switch came back on gets its own sentence.
   */
  const supportAssignment = useSupportAssignment()
  const assignmentEnabled = useRef(supportAssignment)
  useEffect(() => {
    assignmentEnabled.current = supportAssignment
  }, [supportAssignment])

  /**
   * The conversation write path's answer to a refusal (see
   * `useConversationWriteRefused`): the conversation is fetched again when the
   * refusal says this device's copy is stale, and the session is re-read when
   * the Shared queue switch moved. Answers the sentence to show instead of the
   * usual one, or null to keep the usual one. Called before any on-screen
   * check, because the list and the session are stale wherever the person has
   * gone since.
   */
  const writeRefused = useConversationWriteRefused()
  const refusedWrite = useCallback(
    (id: string, failure: ApiFailure): string | null => {
      void writeRefused(id, failure)
      return assignmentSwitchedOnNotice(failure, assignmentEnabled.current)
    },
    [writeRefused],
  )
  /**
   * The Message this device turned out to hold nothing before.
   *
   * `onEndReached` fires repeatedly while somebody keeps scrolling at the end of
   * a thread, and the disk read below is synchronous. Nothing ever writes a
   * Message *older* than the oldest one on screen without also putting it on
   * screen, so once the disk has answered nothing about a Message the answer
   * cannot change while that Message is still the oldest.
   */
  const drained = useRef<string | null>(null)

  /**
   * Which thread the state above describes.
   *
   * Adjusted during render rather than in an effect, because an effect runs
   * after its children have already rendered: a thread this device is holding
   * would get one frame of an empty list before its Messages appeared under the
   * person. This is React's own way of adjusting state to a changed input — it
   * re-renders before anything is committed — and it is what the shared
   * Conversation list does for the same reason.
   */
  const [describes, setDescribes] = useState<string | null>(null)
  if (describes !== conversationId) {
    setDescribes(conversationId)
    // Here rather than in the effect below, which runs a tick later: a request
    // for the thread being left can answer inside that tick, and it would find
    // a generation it still matched and a thread that is no longer the one it
    // asked about. Bumping it twice costs nothing — the effect takes its own
    // number afterwards, and all this does is strand answers nobody wants.
    // eslint-disable-next-line react-hooks/refs -- generation bumped during render on purpose: answers for the thread being left must be stranded before the effect below runs (see the comment).
    generation.current += 1
    const restored = restoredThread(ownerId, conversationId, viewer)
    setState(restored)
    setFailure(null)
    setSendError(null)
    // A thread with nothing to draw is loading; one this device is holding is
    // not, whatever the fetch underneath it goes on to do.
    setLoading(conversationId !== null && restored.messages.length === 0)
    setLoadingOlder(false)
    setRefreshing(false)
  }

  const fetchPage = useCallback(
    async (cursor: string | undefined, mine: number) => {
      if (!conversationId || !viewer) return
      if (inFlight.current) return
      inFlight.current = true
      // What was held before asking, so a Message the socket delivers while the
      // request is out is not read as deleted. See `vanishedFromNewestPage`.
      const heldBefore = held.current.messages

      const page = await listMessages(conversationId, cursor ? { cursor } : {})
      inFlight.current = false
      if (generation.current !== mine) return

      if (!page.ok) {
        setFailure(page.failure)
        setLoading(false)
        setLoadingOlder(false)
        setRefreshing(false)
        return
      }

      setFailure(null)
      const vanished = cursor ? [] : vanishedFromNewestPage(heldBefore, page.value)
      setState((thread) =>
        cursor
          ? applyMessagePage(thread, page.value, viewer)
          : applyNewestPage(withoutMessages(thread, vanished), page.value, viewer),
      )
      if (ownerId) void forgetMessages(ownerId, conversationId, vanished)
      setLoading(false)
      setLoadingOlder(false)
      setRefreshing(false)
    },
    [conversationId, ownerId, viewer],
  )

  useEffect(() => {
    const mine = ++generation.current
    onScreen.current = conversationId

    if (!conversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
      setLoading(false)
      return
    }

    // Fetched even when this device Restored the thread: what is on screen is
    // the last thing this phone knew, and the request is what confirms it.
    void fetchPage(undefined, mine)

    return () => {
      generation.current += 1
      inFlight.current = false
      onScreen.current = null
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter/set this effect owns, not a DOM node: the cleanup has to touch the current one.
      delivering.current.clear()
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter/set this effect owns, not a DOM node: the cleanup has to touch the current one.
      reacting.current.clear()
    }
  }, [conversationId, fetchPage])

  /**
   * The page before the one on screen — off this device first.
   *
   * A thread that has been scrolled back through before is already on the disk
   * down to wherever it was left, and re-asking the API for it would spend a
   * request and a wait on Messages this phone is holding. So the disk answers
   * while it can, and the request is what happens when it runs out.
   *
   * The read is synchronous and bounded — one indexed page, keyed on the oldest
   * Message on screen — and it goes through `applyMessagePage` like any other
   * page, which is what walks `cursor` back with it. So when the disk does run
   * out, the request that follows asks from the oldest Message this device
   * holds rather than from the top of the thread.
   *
   * `hasMore` is the last word either way: a thread the API has already said has
   * nothing before it stops asking, which is what keeps a fully-read thread from
   * ending a scroll on a request that cannot be made with no signal.
   */
  const loadOlder = useCallback(() => {
    if (loading || loadingOlder || refreshing) return

    const oldest = state.messages[0]
    if (ownerId && conversationId && viewer && oldest && drained.current !== oldest.id) {
      const older = restoreOlderMessages(ownerId, conversationId, oldest, MESSAGE_PAGE_LIMIT)
      if (older.length > 0) {
        setState((thread) => applyMessagePage(thread, older, viewer))
        return
      }
      drained.current = oldest.id
    }

    if (!state.hasMore || !state.cursor) return
    setLoadingOlder(true)
    void fetchPage(state.cursor, generation.current)
  }, [
    conversationId,
    fetchPage,
    loading,
    loadingOlder,
    ownerId,
    refreshing,
    state.cursor,
    state.hasMore,
    state.messages,
    viewer,
  ])

  /**
   * Re-read the newest page and rebuild the thread from it.
   *
   * The mode is what separates the two callers: a pull-to-refresh, which the
   * person asked for and expects to see, and a resync after a reconnect, which
   * nobody asked for and which a spinner appearing on its own would make look
   * like something going wrong.
   */
  const reload = useCallback(
    (mode: 'refresh' | 'resync' | 'retry') => {
      if (!conversationId) return
      const mine = ++generation.current
      inFlight.current = false
      if (mode === 'refresh') setRefreshing(true)
      if (mode === 'retry') {
        setFailure(null)
        setLoading(true)
      }
      void fetchPage(undefined, mine)
    },
    [conversationId, fetchPage],
  )

  const refresh = useCallback(() => reload('refresh'), [reload])
  const retry = useCallback(() => reload('retry'), [reload])

  /**
   * What the socket says, in the thread.
   *
   * A message merges by id, so the copy the socket delivered and the copy a
   * later page brings back are one message — which is what makes the resync
   * below safe to run over a thread that has been live the whole time.
   *
   * A reconnect re-reads the newest page rather than trusting what is held: the
   * connection was down for some length of time and anything emitted into it
   * went nowhere. It rebuilds from that page, exactly as a pull-to-refresh does,
   * and shows nothing while it runs — nobody asked for it, and a spinner
   * appearing on its own reads as something having gone wrong. History scrolled
   * into before the drop is dropped with it; scrolling up asks for it again.
   */
  useRealtimeEvents((event: RealtimeEvent) => {
    if (event.kind === 'resync') {
      reload('resync')
      return
    }

    // `conversation.updated` arrives beside every message and says nothing a
    // thread needs: the message itself is already here, and re-reading the
    // whole thread for a row's preview would put the largest request in the app
    // on the path of every message anyone sends.
    if (event.kind === 'message-deleted') {
      // The disk is the Conversation list's to clear, since it hears this
      // whether or not the thread is open. See `lib/conversation-inbox`.
      if (event.conversationId === conversationId) {
        setState((thread) => withoutMessages(thread, [event.messageId]))
      }
      return
    }
    if (event.kind !== 'message') return
    if (event.conversationId !== conversationId || !viewer) return

    setState((thread) => applyIncomingMessage(thread, event.message, viewer))
  })

  /**
   * Carry one message to the API and record what came back.
   *
   * Two round trips when the message carries a file, and in this order: the file
   * goes into the object store, and only then does the message naming it go into
   * the thread. The other order would put a message in front of everyone else
   * pointing at a URI only this phone can open.
   *
   * The bubble is on screen for both, holding the device URI, so a photo is
   * visible from the moment it was sent rather than from the moment the server
   * had it. What the upload answered with is written back onto the message
   * before the send, which is what makes a retry after a failed *send* re-send
   * rather than re-upload — nothing is carried up twice.
   *
   * A reply to a message the server has never seen carries no
   * `replyToMessageId`: the API validates it as a UUID of a real row, and a
   * local id is neither. The reply still sends — losing the quote is a smaller
   * failure than refusing the message.
   */
  const deliver = useCallback(async (id: string, message: Message) => {
    if (delivering.current.has(message.id)) return
    delivering.current.add(message.id)
    setSendError(null)

    let carried = message
    if (message.attachments.some((attachment) => isDeviceUri(attachment.url))) {
      // Before the upload rather than during it, because of what a Restored
      // message can be pointing at: the Outbox brings a staged Attachment back
      // whole, but the picker's copy of the file lives in the system cache and
      // the system reclaims that. Retrying into a file that has gone would fail
      // on a read and tell the person only that their message did not send. See
      // `lib/staged-file`.
      const missing = missingStagedFiles(message.attachments)
      if (missing.length > 0) {
        delivering.current.delete(message.id)
        // `refuseSend` rather than `failSend`, because this is the one failure
        // that can happen before the message is in the thread: a first send
        // reaches here having put nothing on screen yet, and a mark that only
        // marks would lose the bubble along with what the person wrote.
        setState((thread) => refuseSend(thread, message))
        setSendError(missingFilesMessage(missing.map((one) => toAttachmentView(one))))
        return
      }

      setState((thread) => beginUpload(thread, message))

      const uploaded = await uploadFiles(id, message.attachments)
      const uploadNotice = uploaded.ok ? null : refusedWrite(id, uploaded.failure)
      if (onScreen.current !== id) {
        delivering.current.delete(message.id)
        return
      }
      if (!uploaded.ok) {
        delivering.current.delete(message.id)
        // Marked failed holding whatever did go up, so a retry carries only what
        // is still local. Discarding them would orphan an object in the store
        // for every attempt.
        setState((thread) =>
          failSend(thread, message.id, { ...message, attachments: uploaded.value }),
        )
        setSendError(uploadNotice ?? sendFailureMessage(uploaded.failure))
        return
      }
      carried = { ...message, attachments: uploaded.value }
    }

    setState((thread) => beginSend(thread, carried))

    const quoted = carried.replyTo?.id
    const sent = await sendMessage(id, {
      body: carried.body,
      messageType: sendMessageType(
        carried.attachments.map((attachment) => attachmentKindFromType(attachment.type)),
      ),
      ...(carried.attachments.length > 0 ? { attachments: carried.attachments } : {}),
      ...(quoted && !isLocalId(quoted) ? { replyToMessageId: quoted } : {}),
      // Carried on the message itself rather than beside it, so a send the
      // Outbox brings back still names its Post when somebody taps Retry.
      ...(carried.wallPost ? { wallPostId: carried.wallPost.id } : {}),
      // Carried on the message for the same reason.
      ...(carried.complaint
        ? { complaint: { organizationId: carried.complaint.organization?.id ?? null } }
        : {}),
    })

    delivering.current.delete(message.id)
    const sendNotice = sent.ok ? null : refusedWrite(id, sent.failure)
    if (onScreen.current !== id) return

    if (sent.ok) {
      setState((thread) => applySentMessage(thread, message.id, sent.value))
      return
    }
    // Refused for its words, or because the other person blocked this one: a
    // retry would be refused again, so it leaves the thread rather than waiting
    // under *Retry*, and the notice says why.
    setState((thread) =>
      isFinalSendRefusal(sent.failure) ? withdrawSend(thread, message.id) : failSend(thread, message.id),
    )
    setSendError(sendNotice ?? sendFailureMessage(sent.failure))
  }, [refusedWrite])

  const send = useCallback(
    (draft: SendDraft) => {
      // Both are guaranteed by the only screen that passes this on: it renders
      // no composer without a conversation and a signed-in person.
      if (!conversationId || !author) return
      const body = draft.body.trim()
      const attachments = draft.attachments ?? []
      // The API refuses a message that is none of the three, and so does the composer.
      if (!body && attachments.length === 0 && !draft.wallPost) return

      void deliver(
        conversationId,
        draftMessage({
          id: `${LOCAL_ID_PREFIX}${Date.now()}-${++localSequence.current}`,
          body,
          author,
          replyTo: draft.replyTo,
          wallPost: draft.wallPost,
          complaint: draft.complaint,
          // Device URIs for now. `deliver` uploads them and writes back what the
          // API stored, so the bubble is drawn from this phone until it can be
          // drawn from the server.
          attachments: attachments.map(toMessageAttachment),
        }),
      )
    },
    [author, conversationId, deliver],
  )

  const retrySend = useCallback(
    (localId: string) => {
      if (!conversationId) return
      // From the ref rather than from inside a `setState` updater, which has to
      // be pure and this one would be starting a request.
      const unsent = findUnsent(held.current, localId)
      if (unsent) void deliver(conversationId, unsent.message)
    },
    [conversationId, deliver],
  )

  /**
   * A reaction tapped on a bubble.
   *
   * The same three steps a send has, in the same order: the bubble changes
   * first, the request goes after it, and a refusal puts the bubble back. It is
   * the smallest thing in the app that does all three, which is the point of it
   * — if the arrangement is wrong anywhere it is wrong here too.
   *
   * What a tap means is `toggleReaction`'s to decide and not this one's: one
   * reaction per person per message, so a second emoji replaces the first rather
   * than joining it, and the same emoji twice takes it off. Whether that comes
   * out as an add or a remove is read off the answer rather than off the tap.
   *
   * A message this device is still carrying is not one to react to. It has no
   * id the server would recognise; the screen does not offer the row on one, and
   * this refuses it again.
   *
   * The optimistic reaction reaches the disk, because everything in
   * `state.messages` does — so a process that dies with the request out restores
   * a reaction that may never have been written. That is the Store being a few
   * seconds behind, which ADR-0008 accepts everywhere but assignment: the next
   * page of this thread carries the server's copy and replaces it. It is not the
   * Outbox's case, where the *message* itself may never have existed.
   */
  const react = useCallback(
    (messageId: string, emoji: string) => {
      if (!conversationId || !author || isLocalId(messageId)) return

      // From the ref for the same reason a retry is: this is about to start a
      // request, which a `setState` updater may not do.
      const before = held.current.messages.find((message) => message.id === messageId)
      if (!before) return

      const reactions = toggleReaction(before.reactions, emoji, author.id)
      const added = reactions.some(
        (reaction) => reaction.userId === author.id && reaction.emoji === emoji,
      )

      const mine = (reacting.current.get(messageId) ?? 0) + 1
      reacting.current.set(messageId, mine)
      setState((thread) => ({
        ...thread,
        messages: mergeMessages(thread.messages, [{ ...before, reactions }]),
      }))

      void (async () => {
        const answer = added
          ? await addReaction(conversationId, messageId, emoji)
          : await removeReaction(conversationId, messageId)
        const notice = answer.ok ? null : refusedWrite(conversationId, answer.failure)

        if (onScreen.current !== conversationId) return
        // A later tap on the same bubble is already on screen, and its own
        // answer is the one worth having. Rolling this one back would undo a
        // reaction the person can see and has not been refused.
        if (reacting.current.get(messageId) !== mine) return

        setState((thread) => {
          const now = thread.messages.find((message) => message.id === messageId)
          if (!now) return thread

          // Onto the copy the thread holds now rather than onto the one the tap
          // read: a receipt can have advanced while the request was out, and
          // putting the whole older copy back would take that with it. Only this
          // person's reaction is put back for the same reason — somebody else's,
          // arriving over the socket in that window, did happen.
          const settled = answer.ok
            ? answer.value
            : {
                ...now,
                reactions: [
                  ...now.reactions.filter((reaction) => reaction.userId !== author.id),
                  ...before.reactions.filter((reaction) => reaction.userId === author.id),
                ],
              }
          return { ...thread, messages: mergeMessages(thread.messages, [settled]) }
        })
        // A reaction's refusal is otherwise silent — the bubble going back says
        // it — but a switch that moved is news, and the strip is where it goes.
        if (notice) setSendError(notice)
      })()
    },
    [author, conversationId, refusedWrite],
  )

  /**
   * Rewrite a message, optimistically, and put it back if the API refuses.
   *
   * `react` above is the shape: the bubble changes on the tap, a per-message
   * counter marks this attempt, and a stale answer is dropped rather than
   * allowed to overwrite a newer one. What differs is the answer — this one is
   * awaited by the sheet, because a refusal leaves a draft the person is still
   * holding and the sheet has to stay open around it.
   *
   * `editedAt` is stamped locally as well as the body, so the "edited" marker
   * arrives with the new wording rather than a round trip later. The server's own
   * stamp replaces it on success, and a refusal takes both back together.
   *
   * Quotes of this message move with it. The API rewrites the stored copies but
   * re-broadcasts only the message itself, so `withRefreshedQuotes` does here
   * what the server did there — otherwise the old wording stays legible in every
   * reply quoting it until the thread is fetched again.
   */
  const edit = useCallback(
    async (messageId: string, body: string): Promise<string | null> => {
      if (!conversationId || !author) return 'This conversation is not ready yet.'
      if (isLocalId(messageId)) return 'That message has not been sent yet.'

      // From the ref rather than from state, for the reason `react` gives: this
      // is about to start a request, which a `setState` updater may not do.
      const before = held.current.messages.find((message) => message.id === messageId)
      if (!before) return 'That message is no longer here.'

      const mine = (editing.current.get(messageId) ?? 0) + 1
      editing.current.set(messageId, mine)

      const optimistic = { ...before, body, editedAt: new Date().toISOString() }
      setState((thread) => ({
        ...thread,
        messages: withRefreshedQuotes(mergeMessages(thread.messages, [optimistic]), optimistic),
      }))

      const answer = await editMessage(conversationId, messageId, body)
      const notice = answer.ok ? null : refusedWrite(conversationId, answer.failure)

      if (onScreen.current !== conversationId) return null
      // A later edit of the same bubble is already on screen and its own answer
      // is the one worth having. Rolling this one back would take away wording
      // the person can see and has not been refused.
      if (editing.current.get(messageId) !== mine) return null

      setState((thread) => {
        const now = thread.messages.find((message) => message.id === messageId)
        if (!now) return thread

        // Onto the copy the thread holds now rather than the one the sheet read:
        // a receipt or a reaction can have landed while the request was out, and
        // putting the whole older copy back would take those with it.
        const settled = answer.ok
          ? answer.value
          : { ...now, body: before.body, editedAt: before.editedAt }

        return {
          ...thread,
          messages: withRefreshedQuotes(mergeMessages(thread.messages, [settled]), settled),
        }
      })

      return answer.ok ? null : (notice ?? messageEditRefusal(answer.failure))
    },
    [author, conversationId, refusedWrite],
  )

  /**
   * Every state this thread reaches, written through to the Store.
   *
   * Observed here rather than written at each transition, the way the shared
   * Conversation list does it: a fetched page, a page read back off the disk, a
   * socket event, a send that has just been confirmed, a reaction and a send
   * that failed all end up in this one piece of state, so watching it persists
   * all six — and the seventh, added by somebody who would have had no idea
   * there was a writer to call.
   *
   * One effect over the whole state rather than one per table. What of it has
   * moved, whether these Messages are more of the thread or a different run of
   * it, and which of the three writes that means are all
   * `lib/conversation-store`'s to work out — it is the side that knows what is
   * on the disk, and it was keeping that record either way.
   *
   * Nothing read back here is ever sent. `restoredThread` is the only reader of
   * the Outbox, and all it does is draw.
   */
  useEffect(() => {
    if (!ownerId || !conversationId) return
    void saveThread(ownerId, conversationId, state)
  }, [conversationId, ownerId, state])

  /**
   * Who this reader blocked. Their Messages are hidden from what is drawn
   * (`withoutSenders`), except in a Support DM, which blocks do not reach
   * (`blocksApplyTo`). A block or an unblock landing while the thread is open
   * re-reads its newest page: the API filters its pages, so after an unblock
   * the Messages it left out while the block stood come back only by asking.
   */
  const allBlockedIds = useBlockedIds()
  const blockedIds =
    conversation && !blocksApplyTo(conversation.type) ? NO_BLOCKED_SENDERS : allBlockedIds
  const blockedCount = useRef(blockedIds.size)
  useEffect(() => {
    const changed = blockedIds.size !== blockedCount.current
    blockedCount.current = blockedIds.size
    if (changed) reload('resync')
  }, [blockedIds, reload])

  const messages = useMemo(
    () => withoutSenders(threadMessages(state), blockedIds),
    [state, blockedIds],
  )
  const delivery = useMemo(() => deliveryStates(state.unsent), [state.unsent])

  const dismissFailure = useCallback(() => setFailure(null), [])
  const dismissSendError = useCallback(() => setSendError(null), [])

  return {
    messages,
    delivery,
    loading,
    loadingOlder,
    // Not gated on `cursor`: a Restored thread pages back off the disk first,
    // before it has a cursor to ask the API with.
    hasOlder: state.hasMore,
    refreshing,
    failure,
    dismissFailure,
    sendError,
    dismissSendError,
    loadOlder,
    refresh,
    retry,
    send,
    retrySend,
    react,
    edit,
  }
}

/**
 * Every file a message is still holding locally, put where the API can reach it.
 *
 * One at a time rather than all at once: a phone uploading three videos in
 * parallel on a mobile connection finishes the first later than it would have
 * alone, and the first one to fail is the answer for the whole message anyway.
 *
 * An attachment already carrying a server URL is passed through untouched, which
 * is what makes this safe to run again — after a send that failed on the second
 * of its two round trips, and after an upload that failed partway through a
 * message carrying several.
 *
 * `value` is the list either way, which is why it is outside the `ok`. A failure
 * reports how far it got, and how far it got is worth keeping: the objects
 * before the one that failed are in the store whatever happens next, and the
 * only thing that can still use them is the retry.
 */
async function uploadFiles(
  conversationId: string,
  attachments: MessageAttachment[],
): Promise<
  | { ok: true; value: MessageAttachment[] }
  | { ok: false; failure: ApiFailure; value: MessageAttachment[] }
> {
  const uploaded: MessageAttachment[] = []

  for (const [index, attachment] of attachments.entries()) {
    if (!isDeviceUri(attachment.url)) {
      uploaded.push(attachment)
      continue
    }

    const result = await uploadAttachment(conversationId, toAttachmentView(attachment))
    if (!result.ok) {
      // What went up, then the one that did not and everything behind it, in the
      // order the message holds them — a list of the same length, so the caller
      // has a message rather than a fragment of one.
      return { ok: false, failure: result.failure, value: [...uploaded, ...attachments.slice(index)] }
    }
    uploaded.push(result.value)
  }

  return { ok: true, value: uploaded }
}
