import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  listMessages,
  sendMessage,
  uploadAttachment,
  type ApiFailure,
} from '@/lib/conversation-api'
import { isDeviceUri, sendMessageType } from '@/lib/attachment-upload'
import {
  attachmentKindFromType,
  toAttachmentView,
  toMessageAttachment,
} from '@/lib/attachment-view'
import {
  applyIncomingMessage,
  applyMessagePage,
  applySentMessage,
  beginSend,
  beginUpload,
  deliveryStates,
  draftMessage,
  emptyThread,
  failSend,
  findUnsent,
  isLocalId,
  LOCAL_ID_PREFIX,
  threadMessages,
  withoutPages,
  type DeliveryState,
  type MessageAuthor,
  type SendDraft,
  type ThreadState,
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
        applyMessagePage(cursor ? thread : withoutPages(thread), page.value, {
          role,
          conversationType,
        }),
      )
      setLoading(false)
      setLoadingOlder(false)
      setRefreshing(false)
    },
    [conversationId, conversationType, role],
  )

  useEffect(() => {
    const mine = ++generation.current
    setState(emptyThread())
    setFailure(null)
    onScreen.current = conversationId

    if (!conversationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    void fetchPage(undefined, mine)

    return () => {
      generation.current += 1
      inFlight.current = false
      onScreen.current = null
      delivering.current.clear()
    }
  }, [conversationId, fetchPage])

  const loadOlder = useCallback(() => {
    if (loading || loadingOlder || refreshing) return
    if (!state.hasMore || !state.cursor) return
    setLoadingOlder(true)
    void fetchPage(state.cursor, generation.current)
  }, [fetchPage, loading, loadingOlder, refreshing, state.cursor, state.hasMore])

  /**
   * Re-read the newest page and rebuild the thread from it.
   *
   * The mode is what separates the two callers: a pull-to-refresh, which the
   * person asked for and expects to see, and a resync after a reconnect, which
   * nobody asked for and which a spinner appearing on its own would make look
   * like something going wrong.
   */
  const reload = useCallback(
    (mode: 'refresh' | 'resync') => {
      if (!conversationId) return
      const mine = ++generation.current
      inFlight.current = false
      if (mode === 'refresh') setRefreshing(true)
      void fetchPage(undefined, mine)
    },
    [conversationId, fetchPage],
  )

  const refresh = useCallback(() => reload('refresh'), [reload])

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
