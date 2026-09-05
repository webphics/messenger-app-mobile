import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  listMessages,
  sendMessage,
  uploadAttachment,
  MESSAGE_PAGE_LIMIT,
  type ApiFailure,
} from '@/lib/conversation-api'
import {
  restoreOlderMessages,
  restoreOutbox,
  restoreThread,
  saveMessages,
  saveOutbox,
  saveThreadPaging,
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
  isLocalId,
  refuseSend,
  LOCAL_ID_PREFIX,
  threadContinues,
  threadMessages,
  visibleMessages,
  type DeliveryState,
  type MessageAuthor,
  type SendDraft,
  type ThreadState,
  type ThreadViewer,
} from '@/lib/conversation-state'
import { useRealtimeEvents, type RealtimeEvent } from '@/lib/realtime-context'
import type { Conversation, Message, MessageAttachment, UserRole } from '@/lib/types'

/**
 * One thread: its history a page at a time, and the messages typed into it.
 *
 * The decisions this makes are all in `lib/conversation-state`, which is where
 * they are tested: what a page does to the thread already held, how far back the
 * next one asks from, when there is nothing further back to ask for, and what
 * becomes of a message between the tap on send and the API's answer. What is
 * left here is the part that cannot be pure — when to ask, and how to ignore an
 * answer that arrived for a thread nobody is looking at any more.
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
  refreshing: boolean
  failure: ApiFailure | null
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
 * Filtered on the way in, exactly as a page from the API is. The Store holds
 * what was already visible — nothing withheld was ever written — but the rule
 * that decides what a viewer may see is not one to hold in a single place and
 * hope, and a database is the one input to this app that an older build of it
 * wrote. See `isMessageVisibleTo`.
 *
 * The frontier comes back with the Messages, which is what makes the scroll back
 * pick up where it stopped instead of reading the thread again from the top.
 */
function restoredThread(
  ownerId: string | null,
  conversationId: string | null,
  viewer: ThreadViewer | null,
): ThreadState {
  if (!ownerId || !conversationId || !viewer) return emptyThread()

  // Read whether or not there is any history to draw it into. A thread whose
  // first message never got away has nothing else on this device, and it is the
  // one this feature is most obviously for.
  const unsent = restoreOutbox(ownerId, conversationId)
  const held = restoreThread(ownerId, conversationId, MESSAGE_PAGE_LIMIT)
  if (!held) return { ...emptyThread(), unsent }

  return {
    ...emptyThread(),
    messages: visibleMessages(viewer.role, viewer.conversationType, held.messages),
    unsent,
    hasMore: held.paging.hasMore,
    cursor: held.paging.cursor,
  }
}

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

  const viewer = useMemo<ThreadViewer | null>(
    () => (conversationType ? { role, conversationType } : null),
    [role, conversationType],
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
      if (!conversationId || !conversationType) return
      if (inFlight.current) return
      inFlight.current = true

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
      setState((thread) =>
        cursor
          ? applyMessagePage(thread, page.value, { role, conversationType })
          : applyNewestPage(thread, page.value, { role, conversationType }),
      )
      setLoading(false)
      setLoadingOlder(false)
      setRefreshing(false)
    },
    [conversationId, conversationType, role],
  )

  useEffect(() => {
    const mine = ++generation.current
    onScreen.current = conversationId

    if (!conversationId) {
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
      delivering.current.clear()
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
    if (event.kind !== 'message') return
    if (event.conversationId !== conversationId || !conversationType) return

    setState((thread) =>
      applyIncomingMessage(thread, event.message, {
        // Empty for the roles still on local data, which send nothing and so
        // have no echo to confirm.
        id: author?.id ?? '',
        role,
        conversationType,
      }),
    )
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
        setSendError(sendFailureMessage(uploaded.failure))
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
    })

    delivering.current.delete(message.id)
    if (onScreen.current !== id) return

    if (sent.ok) {
      setState((thread) => applySentMessage(thread, message.id, sent.value))
      return
    }
    setState((thread) => failSend(thread, message.id))
    setSendError(sendFailureMessage(sent.failure))
  }, [])

  const send = useCallback(
    (draft: SendDraft) => {
      // Both are guaranteed by the only screen that passes this on: it renders
      // no composer without a conversation and a signed-in person.
      if (!conversationId || !author) return
      const body = draft.body.trim()
      const attachments = draft.attachments ?? []
      // The API refuses a message that is neither, and so does the composer.
      if (!body && attachments.length === 0) return

      void deliver(
        conversationId,
        draftMessage({
          id: `${LOCAL_ID_PREFIX}${Date.now()}-${++localSequence.current}`,
          body,
          author,
          replyTo: draft.replyTo,
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
   * Every confirmed Message this thread reaches, written through to the Store.
   *
   * Observed here rather than written at each transition, the way the shared
   * Conversation list does it: a fetched page, a page read back off the disk, a
   * socket event and a send that has just been confirmed all end up in this one
   * piece of state, so watching it persists all four — and the fifth, added by
   * somebody who would have had no idea there was a writer to call.
   *
   * Confirmed only. `state.unsent` is not here and must not be: a Message this
   * device is still carrying is its own word about something the server may
   * never have heard, and the Outbox is its own ticket.
   *
   * `replace` is for the one case where the Messages are not more of the thread
   * but a different run of it — a newest page that turned out not to continue
   * what was held, because enough was said while this phone was away. What was
   * dropped from the screen has to leave the disk with it; see `applyNewestPage`.
   */
  const persisted = useRef<{ id: string; messages: Message[] } | null>(null)
  useEffect(() => {
    if (!ownerId || !conversationId) return

    const last = persisted.current
    const replaced =
      last?.id === conversationId && !threadContinues(last.messages, state.messages)
    persisted.current = { id: conversationId, messages: state.messages }
    void saveMessages(ownerId, conversationId, state.messages, replaced ? 'replace' : 'merge')
  }, [conversationId, ownerId, state.messages])

  /**
   * And how far back it has been read.
   *
   * On the conversation's own row rather than beside the Messages, because there
   * is exactly one of these per thread — see `lib/store-rows`. It is what makes
   * a restart continue the scroll rather than start it again, and what stops a
   * thread with nothing before it from asking after one.
   */
  useEffect(() => {
    if (!ownerId || !conversationId) return
    void saveThreadPaging(ownerId, conversationId, {
      hasMore: state.hasMore,
      cursor: state.cursor,
    })
  }, [conversationId, ownerId, state.cursor, state.hasMore])

  /**
   * And everything it did not manage to send, written through to the Outbox.
   *
   * Observed the same way the confirmed Messages are, and for the same reason: a
   * send that failed, a retry that failed again, an upload that stopped partway
   * and a message the API finally confirmed all end up in this one piece of
   * state, so watching it persists all of them.
   *
   * Every Unsent Message, not only the failed ones. A message still in flight is
   * exactly the one worth having on disk — if this process dies with the request
   * out, nobody knows whether it landed, and the row is what lets it come back
   * to be sent again rather than disappearing with the process that was carrying
   * it. It comes back *failed* either way; see `OutboxRow` in `lib/store-rows`.
   *
   * Nothing reads this back and sends it. `restoredThread` is the only reader,
   * and all it does is draw.
   */
  useEffect(() => {
    if (!ownerId || !conversationId) return
    void saveOutbox(
      ownerId,
      conversationId,
      state.unsent.map((entry) => entry.message),
    )
  }, [conversationId, ownerId, state.unsent])

  const messages = useMemo(() => threadMessages(state), [state])
  const delivery = useMemo(() => deliveryStates(state.unsent), [state.unsent])

  const dismissSendError = useCallback(() => setSendError(null), [])

  return {
    messages,
    delivery,
    loading,
    loadingOlder,
    refreshing,
    failure,
    sendError,
    dismissSendError,
    loadOlder,
    refresh,
    retry,
    send,
    retrySend,
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
