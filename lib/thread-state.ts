import type {
  AttachmentView,
  ConversationType,
  Message,
  MessageAttachment,
  UserRole,
} from '@/lib/types'
import { isStaffMessage } from '@/lib/types'

/**
 * What an answer means for one thread — whether it was asked for or not.
 *
 * Everything here is pure: state in, state out, no network and no React. It is
 * where the rules that would otherwise be scattered through the thread screen
 * live — which messages a viewer may see, how a page of history joins the pages
 * already held, how far back the next page should ask for, and what becomes of a
 * message someone typed while the request carrying it is out.
 *
 * The Conversation list's own reducers are next door in
 * `lib/conversation-list.ts`, which reads two of the predicates here and is read
 * back by nothing. They split where their readers do: a thread is read by one
 * screen and the Store's thread tables, the list by the Hub, the inbox, the tab
 * badge and the Store's `conversations` table, and neither has any use for the
 * other's reducers.
 *
 * A REST page and a socket event fold in through the same functions, which is
 * why merging was written as a merge rather than as an append: a resync after a
 * reconnect re-fetches messages the socket has already delivered, and folding by
 * id is what makes that arrive as nothing rather than as a second copy.
 */

/**
 * How far a message typed on this device has got — which is not a receipt.
 *
 * `receiptStatus` is the server's word about a message it already holds; this is
 * this device's word about one it may not hold yet. The two never overlap: an
 * unsent message has no receipt until the API answers with one, and by then it
 * is no longer unsent.
 *
 * `uploading` is a separate state rather than a longer `sending` because it is a
 * separate wait: a photo goes up before the message naming it goes out, and on a
 * phone that is the part that takes time. A message stuck on *Sending…* for
 * thirty seconds reads as broken; one that says *Uploading…* reads as working.
 *
 * Deliberately not called *outgoing*: `isOutgoing` already means "sent by the
 * person reading it", which is what a bubble's `outgoing` prop is, and a message
 * can be outgoing in that sense for the rest of its life.
 */
export type DeliveryState = 'uploading' | 'sending' | 'failed'

/** A message typed here, from the tap on send until the API confirms it. */
export type UnsentMessage = {
  /** Carries a local id. The one the API assigns replaces it rather than joining it. */
  message: Message
  state: DeliveryState
  /**
   * Read back from the Outbox, rather than failed in front of the person reading
   * it.
   *
   * The two look identical on screen — both say *Not sent*, both offer to go
   * again — and they are not the same claim. A send that failed in this session
   * failed while somebody watched: they were told, and the bubble is the record
   * of it. A Restored one comes back *failed* because a send in flight when the
   * process died did not survive the thing that was sending it, and nobody knows
   * whether it landed. This session has told them nothing about it.
   *
   * That is the difference `withoutEcho` needed and could not read. A Restored
   * entry the API turns out to hold is resolved by the copy that arrives; a
   * session failure keeps its place and its offer to go again. It is a property
   * of the entry rather than a reading of one, so the rule is one a table can be
   * written for.
   *
   * Set on the way out of `fromOutboxRows` and nowhere else, and it lasts only
   * until somebody acts on the entry: a retry goes through `beginSend`, which
   * replaces the entry whole, and what comes back is an ordinary send of this
   * session — watched, and so kept, if it fails again.
   */
  restored?: boolean
}

/** What the composer hands whatever is going to send it. */
export type SendDraft = {
  body: string
  /** The message being answered, or null when this is not a reply. */
  replyTo: Message | null
  /**
   * Staged on this device and not yet uploaded — device URIs, in the shape the
   * picker and the recorder produce. Whatever sends this uploads them first;
   * see `useThreadMessages`.
   */
  attachments?: AttachmentView[]
}

export type ThreadState = {
  /** Oldest first, deduplicated by id. What the API has confirmed. */
  messages: Message[]
  /**
   * Sent from here and not yet confirmed, kept apart from the confirmed pages so
   * that a page arriving mid-send — a refresh, a scroll into history — cannot
   * overwrite one, and so that nothing has to guess whether an id is the
   * server's.
   */
  unsent: UnsentMessage[]
  /** Whether asking for another page is still worth a request. */
  hasMore: boolean
  /**
   * The id the next page reads backwards from: the oldest message the API has
   * handed over, including one it handed over and this viewer may not see.
   */
  cursor: string | undefined
}

export function emptyThread(): ThreadState {
  return { messages: [], unsent: [], hasMore: true, cursor: undefined }
}

/**
 * The pages dropped and the unsent messages kept: what a refresh rebuilds from.
 *
 * A refresh re-reads the newest page and starts the thread over from it, which
 * must not take a message still in flight down with it — the person typed it,
 * can see it, and the request carrying it is still out.
 */
export function withoutPages(state: ThreadState): ThreadState {
  return { ...emptyThread(), unsent: state.unsent }
}

/**
 * Whether this message reports something that happened rather than something
 * someone said: an Engage, a Takeover or a Transfer notice.
 *
 * One place, because two things read it and they must not disagree — the rule
 * below, which withholds these from a Customer, and `buildThreadRows`, which
 * draws the ones that survive as a centred line rather than as a bubble.
 */
export function isSystemMessage(message: Pick<Message, 'messageType'>): boolean {
  return message.messageType === 'system'
}

/**
 * Whether a message may be shown to the person looking at it.
 *
 * The rule: a Customer never sees an *internal* `system` message in a Support DM.
 * The internal ones are the Engage, Takeover and Transfer notices, and each
 * reports an assignment event and names the staff member who caused it.
 * Assignment is internal, and the company is meant to reach a Customer as one
 * voice rather than as whoever is currently holding the thread.
 *
 * `addressedToCustomer` is what separates those from the onboarding thread's
 * welcome, a system message written *for* the Customer. It still draws as a
 * centred line rather than a bubble, which is what it wants to be.
 *
 * The API enforces this and withholds those messages from a Customer's payload
 * before it is sent — the same predicate, under the same name, lives in its
 * `conversations.mapper.ts`. This copy is the second lock on a door that is
 * already locked: a client filter is not a security boundary, but the client
 * should not be assuming every message it receives is a normal chat bubble
 * either. The web client keeps the same copy for the same reason.
 */
export function isMessageVisibleTo(
  role: UserRole,
  conversationType: ConversationType,
  message: Pick<Message, 'messageType' | 'addressedToCustomer'>,
): boolean {
  if (role !== 'customer' || conversationType !== 'support_dm') return true
  return !isSystemMessage(message) || message.addressedToCustomer === true
}

export function visibleMessages(
  role: UserRole,
  conversationType: ConversationType,
  messages: Message[],
): Message[] {
  return messages.filter((message) => isMessageVisibleTo(role, conversationType, message))
}

/**
 * Who is reading a thread, and what kind of thread it is.
 *
 * The pair decides what may be shown; the id decides what is theirs. Named
 * because the same fields travel together into everything that folds a message
 * into a thread, and a page and a socket event must not answer them differently.
 */
export type ThreadViewer = {
  id: string
  role: UserRole
  conversationType: ConversationType
}

function byCreatedAt(a: Message, b: Message): number {
  const difference = Date.parse(a.createdAt) - Date.parse(b.createdAt)
  // Two messages can share a timestamp on a busy thread; the id keeps the order
  // of a rendered list from changing under someone between two renders.
  return difference !== 0 ? difference : a.id.localeCompare(b.id)
}

/**
 * Folds messages into a thread, keyed by id so one that arrives twice replaces
 * rather than duplicates — which is what a page fetched again after a reconnect,
 * or a message re-broadcast once its receipts are applied, actually is.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing

  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of incoming) {
    byId.set(message.id, message)
  }

  return [...byId.values()].sort(byCreatedAt)
}

/**
 * One page of history, applied to what is already on screen.
 *
 * Three things here are deliberate and none is obvious.
 *
 * The cursor advances from the *raw* page, not from the messages that survived
 * the visibility filter. Advancing it from the visible ones would stall on a
 * page that happened to hold nothing but system notices: the next request would
 * ask from the same place and get the same page, forever.
 *
 * And only an empty page ends the thread. A short page does not, because the API
 * takes its page first and filters it afterwards — forty-eight messages back
 * from a fifty-message request can mean two system notices were withheld, not
 * that history has run out. The cost of being wrong the other way is one extra
 * request that answers with nothing; the cost of guessing from the length is a
 * thread that silently refuses to scroll further back.
 *
 * The third thing is newer: a page can be carrying the copy the API kept of a
 * Restored Outbox entry, and drawing both would put the same words on screen
 * twice, one confirmed and one marked *Not sent* beside a *Retry* that would
 * post a third. So the entry goes when the page confirms it — see
 * `withoutRestoredEchoes`, which is the only thing here that touches `unsent`
 * and touches nothing a send of this session put there.
 *
 * It is asked about the *visible* page rather than the raw one, which is the one
 * place the two differ from the cursor's reading of them: an entry resolved by a
 * Message that is then withheld would be a bubble taken away and nothing drawn
 * in its place.
 */
export function applyMessagePage(
  state: ThreadState,
  page: Message[],
  viewer: ThreadViewer,
): ThreadState {
  const visible = visibleMessages(viewer.role, viewer.conversationType, page)

  return {
    ...state,
    messages: mergeMessages(state.messages, visible),
    unsent: withoutRestoredEchoes(state.unsent, state.messages, visible, viewer.id),
    hasMore: page.length > 0,
    cursor: page[0]?.id ?? state.cursor,
  }
}

/**
 * The newest page of a thread, applied to whatever is already on screen.
 *
 * A thread that has just been Restored from this device is already holding
 * Messages, and already knows how far back it has read — so the page that
 * confirms it is not the page the thread begins from. What this decides is
 * whether the two are the same run of history.
 *
 * They are, if they touch. A page of the newest fifty Messages fetched against a
 * thread this phone was reading a moment ago overlaps it: the Messages in common
 * merge by id, and the frontier stays where it was, because re-reading the
 * newest page has asked the API nothing about how far back the thread goes.
 * Moving `cursor` forward to this page's oldest Message would make the next
 * scroll back re-read history the device is already holding.
 *
 * They are not, if nothing is in common. Enough was said while this phone was
 * away that a whole page of it is new, and there is history between what is held
 * and what has arrived that nobody has fetched. The Messages held are a fragment
 * of a thread this page no longer continues, so they go — the alternative is a
 * thread that reads straight from today into last month with a hole in between
 * and no way to ask for it. That is `withoutPages`, which is what every fetch of
 * the newest page did before there was anything to Restore.
 *
 * Either way the page may be carrying the copy the API kept of a Restored
 * Outbox entry, and either way that entry goes rather than sitting beside its
 * own confirmed self; see `withoutRestoredEchoes`. The two branches ask it the
 * same question despite one of them having just dropped the Messages it reads:
 * what it reads them for is which of this page the device had seen before, and
 * a page that does not continue the thread shares nothing with it by
 * definition — which is how it got down that branch.
 */
export function applyNewestPage(
  state: ThreadState,
  page: Message[],
  viewer: ThreadViewer,
): ThreadState {
  if (!threadContinues(state.messages, page)) {
    return applyMessagePage(withoutPages(state), page, viewer)
  }

  const visible = visibleMessages(viewer.role, viewer.conversationType, page)

  return {
    ...state,
    messages: mergeMessages(state.messages, visible),
    unsent: withoutRestoredEchoes(state.unsent, state.messages, visible, viewer.id),
  }
}

/**
 * Whether a newer run of Messages and the ones already held are one run of
 * history, or whether something nobody has fetched fell between them.
 *
 * By id, rather than by comparing the two ends: an id shared between them is the
 * proof that nothing fell between, and there is no arithmetic in it to be wrong
 * about. A thread holding nothing continues anything — there is no history there
 * to disconnect from.
 *
 * A page carrying only Messages this viewer may not see is a page with nothing
 * in common with anything, which is why the raw page is compared rather than the
 * filtered one: the ids are the evidence, and a System notice a Customer will
 * never be shown is still evidence that the two pages meet.
 *
 * A thread holding nothing does not continue, and neither does a page holding
 * nothing. Both send the page down the rebuild path deliberately: the first
 * because a thread beginning from this page has to take its `cursor` from it,
 * and the second because a newest page with nothing in it is a thread with
 * nothing left in it.
 */
export function threadContinues(held: readonly Message[], page: readonly Message[]): boolean {
  if (held.length === 0 || page.length === 0) return false
  const ids = new Set(held.map((message) => message.id))
  return page.some((message) => ids.has(message.id))
}

/**
 * A message that arrived over the socket, folded into the open thread.
 *
 * The same visibility rule and the same merge a fetched page goes through, for
 * the same reasons — which is what makes a resync after a reconnect harmless:
 * the page comes back holding the message the socket already delivered, and
 * folding by id replaces it rather than showing it twice.
 *
 * `hasMore` and `cursor` are untouched. Both describe how far *back* the thread
 * has read, and a message arriving at the newest end says nothing about that.
 */
export function applyIncomingMessage(
  state: ThreadState,
  message: Message,
  viewer: ThreadViewer,
): ThreadState {
  if (!isMessageVisibleTo(viewer.role, viewer.conversationType, message)) return state

  return {
    ...state,
    messages: mergeMessages(state.messages, [message]),
    unsent: withoutEcho(state.unsent, message, viewer.id),
  }
}

/**
 * The echo an arriving message is the confirmation of, dropped.
 *
 * A message this device sent comes back twice: once as the API's answer to the
 * request that carried it, and once over the socket, because the sender is in
 * the conversation too. Whichever arrives first is the moment the message is
 * confirmed — and before this, the socket arriving first left the person looking
 * at their own message twice, once delivered and once still marked *sending*,
 * until the round trip caught up. On a slow connection that is not a flicker.
 *
 * There is no id to match on: a local id is this device's and the arriving one
 * is the server's, and nothing relates them until the request answers. So the
 * match is on what the two copies do share, and which of the two that is depends
 * on what the message is — see `isSameMessage`.
 *
 * Only the viewer's own messages are considered, and only an entry with nobody
 * watching it — a send still in flight, or one Restored from the Outbox into a
 * session that has said nothing about it. A send that failed in front of the
 * person keeps its place and its offer to go again: they were told about it, and
 * taking it away on the strength of a match would leave them with nothing to
 * retry. A send that fails *after* an arrival confirmed it finds nothing left to
 * mark, which is right — the socket has shown that it landed.
 */
function withoutEcho(
  unsent: UnsentMessage[],
  message: Message,
  viewerId: string,
): UnsentMessage[] {
  if (unsent.length === 0) return unsent
  if (!isOutgoing(message, viewerId)) return unsent

  const echo = unsent.find((entry) => isEchoOf(entry, message))
  return echo ? unsent.filter((entry) => entry !== echo) : unsent
}

/**
 * The Restored entries a page turns out to be the confirmation of, dropped.
 *
 * The page path's half of `withoutEcho`, and deliberately the smaller half. A
 * page is many messages rather than one, and matching a send of this session
 * against all of them would risk taking away a bubble the person is watching on
 * the strength of an older message that happens to read the same. So this
 * considers Restored entries only: the ones no request of this session is
 * coming for, because the one that would have answered them died with the
 * process that was sending it.
 *
 * Two things narrow it further, both because a bubble kept is a message somebody
 * can send again and a bubble dropped is a message that is gone.
 *
 * Only the viewer's own messages, as on the socket path.
 *
 * And only Messages this device has never held. The copy of an Outbox entry is
 * one of those by construction: the entry exists precisely because nothing ever
 * came back for it, so no page had brought the copy here and no row on disk is
 * about it. What that rules out is the thing this would otherwise be wrong
 * about — history that reads the same, which is somebody saying *Thanks* twice
 * a fortnight apart, and which the device is holding already if it is drawing
 * it. Deliberately not a comparison of times: the entry's own timestamp is this
 * phone's clock and the arriving copy's is the server's, and a rule that reads
 * both stops working on a phone whose clock is wrong.
 *
 * Where more than one candidate says the same thing, the newest wins. The
 * Message that did not get away was the last one this person wrote, so among
 * copies that read alike it is the latest that is likeliest to be it.
 *
 * A page message confirms one entry at most: two Restored copies of the same
 * words are two messages, and one arriving copy is evidence of one of them.
 */
function withoutRestoredEchoes(
  unsent: UnsentMessage[],
  held: readonly Message[],
  page: readonly Message[],
  viewerId: string,
): UnsentMessage[] {
  if (page.length === 0) return unsent
  if (!unsent.some((entry) => entry.restored === true)) return unsent

  const seen = new Set(held.map((message) => message.id))
  const candidates = page.filter(
    (message) => !seen.has(message.id) && isOutgoing(message, viewerId),
  )
  if (candidates.length === 0) return unsent

  const taken = new Set<Message>()
  const confirmed = new Set<UnsentMessage>()
  for (const entry of unsent) {
    if (entry.restored !== true) continue
    const match = newestMatch(candidates, taken, entry)
    if (!match) continue
    taken.add(match)
    confirmed.add(entry)
  }

  if (confirmed.size === 0) return unsent
  return unsent.filter((entry) => !confirmed.has(entry))
}

/** The last unclaimed candidate that reads as this entry's own message. */
function newestMatch(
  candidates: readonly Message[],
  taken: ReadonlySet<Message>,
  entry: UnsentMessage,
): Message | undefined {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index]
    if (!taken.has(message) && isSameMessage(entry, message)) return message
  }
  return undefined
}

/**
 * Whether this arriving message is the one that unsent entry became.
 *
 * Two questions, and only the second is about the message. The first is about
 * the entry: whether anything arriving may resolve it at all. A send still in
 * flight may be — that is what this function was written for. One Restored from
 * the Outbox may be, because the session has told the person nothing and there
 * is no other answer coming for it. A send that failed while they watched may
 * not, and neither may one still uploading, which has no copy on the server for
 * anything to be an echo of.
 */
function isEchoOf(entry: UnsentMessage, message: Message): boolean {
  if (entry.state !== 'sending' && entry.restored !== true) return false
  return isSameMessage(entry, message)
}

/**
 * Whether these two are the same message: one copy this device is holding, one
 * the server has handed over.
 *
 * A message carrying attachments is matched on their URLs. That is an exact
 * match rather than a guess: by the time a send is out, the entry holds what the
 * upload answered with, and the arriving copy names the same stored objects. It
 * is also the only match available — a photo sent without a caption has an empty
 * body, which every other uncaptioned photo also has, so matching on the body
 * would confirm the wrong one.
 *
 * A message carrying none is matched on its body, which must not be empty: the
 * API refuses a message that is neither body nor attachments, so an empty one is
 * not something this device could have sent. Two identical messages in flight at
 * once confirm in the order they were sent, which is the order they were written.
 *
 * The two are never mixed. An arrival with attachments cannot confirm an entry
 * without them however well the captions agree, because it is a different
 * message — one of them is a photo.
 */
function isSameMessage(entry: UnsentMessage, message: Message): boolean {
  // Nobody typed a system notice, so no entry is ever the one it confirms.
  if (isSystemMessage(message)) return false

  const held = entry.message.attachments
  const arriving = message.attachments
  if (held.length > 0 || arriving.length > 0) {
    return (
      held.length === arriving.length &&
      held.every((attachment, index) => attachment.url === arriving[index]?.url)
    )
  }

  return message.body !== '' && entry.message.body === message.body
}

/**
 * The prefix every id minted on this device carries.
 *
 * The API's ids are UUIDs, so a prefixed one cannot collide with a real message,
 * and anything holding an id can tell whether the server has ever seen it. Two
 * places need to: a bubble, which animates an echo in and not a fetched message,
 * and a reply, which must not send the API a `replyToMessageId` no row answers to.
 */
export const LOCAL_ID_PREFIX = 'local-'

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX)
}

export type MessageAuthor = { id: string; name: string; role: UserRole }

export type MessageDraft = {
  /** Local; see `LOCAL_ID_PREFIX`. */
  id: string
  body: string
  author: MessageAuthor
  replyTo?: Message | null
  attachments?: MessageAttachment[]
  /** Defaults to now. Named so a test can fix it. */
  sentAt?: string
}

/** How much of a quoted message a reply's preview carries. Matches the API's own. */
const REPLY_PREVIEW_LENGTH = 140

/**
 * The bubble a send puts on screen before the API has answered for it.
 *
 * It is shaped as a `Message` because that is what a thread renders, and it
 * carries `receiptStatus: 'sent'` because the type demands one — a lie that is
 * never read, since a bubble showing a `DeliveryState` shows that instead of a
 * receipt. The server's answer replaces this whole object rather than patching
 * it, so nothing invented here outlives the round trip.
 */
export function draftMessage(draft: MessageDraft): Message {
  const attachments = draft.attachments ?? []
  const base = {
    id: draft.id,
    body: draft.body,
    messageType: attachments.length > 0 ? ('media' as const) : ('text' as const),
    createdAt: draft.sentAt ?? new Date().toISOString(),
    // Nothing this device is still carrying has been edited, and none of it can
    // be yet: a message has to reach the API before it can be rewritten, and
    // `messageActions` in `lib/conversation-access` refuses a `local-` id for
    // exactly that reason. The API sends the real window with the sent copy.
    editedAt: null,
    editableUntil: null,
    replyTo: draft.replyTo
      ? { id: draft.replyTo.id, preview: draft.replyTo.body.slice(0, REPLY_PREVIEW_LENGTH) }
      : null,
    reactions: [],
    attachments,
    receiptStatus: 'sent' as const,
  }

  return draft.author.role === 'customer'
    ? { ...base, fromCompany: false }
    : { ...base, sender: { id: draft.author.id, name: draft.author.name, role: draft.author.role } }
}

/**
 * A send begins, or begins again.
 *
 * Keyed by id so a retry re-marks the message already on screen rather than
 * stacking a second copy of it beneath the first.
 */
export function beginSend(state: ThreadState, message: Message): ThreadState {
  return withDelivery(state, message, 'sending')
}

/**
 * The upload the send is waiting on.
 *
 * A separate entry point rather than an argument to `beginSend`, because the two
 * are separate moments in one journey and a caller moves between them: an
 * attachment goes up, then the message naming it goes out, and a retry starts
 * again from whichever of the two never finished.
 */
export function beginUpload(state: ThreadState, message: Message): ThreadState {
  return withDelivery(state, message, 'uploading')
}

/**
 * The message, marked, replacing any earlier mark it carried.
 *
 * The replacement is what keeps a retry, and the move from uploading to sending,
 * from stacking a second copy of the bubble beneath the first. It is also what
 * ends a Restored entry's Restored-ness: the entry written here is a new one and
 * carries no `restored`, so a Restored message somebody has tapped *Retry* on is
 * from that moment an ordinary send of this session — watched, and kept if it
 * fails.
 */
function withDelivery(
  state: ThreadState,
  message: Message,
  delivery: DeliveryState,
): ThreadState {
  return {
    ...state,
    unsent: [
      ...state.unsent.filter((entry) => entry.message.id !== message.id),
      { message, state: delivery },
    ],
  }
}

/**
 * A send this device refused to make, marked before it was ever carried.
 *
 * `failSend` marks a message the thread is already holding, which every failure
 * arriving from the API is: the send began, so `beginSend` or `beginUpload` put
 * it there. This is the one failure decided on the way *out* — a staged file
 * that is no longer on the phone, found before the first upload — and on a first
 * send there is nothing in the thread yet for a mark to find. Without this the
 * message would never appear at all, which is precisely the vanishing bubble
 * `failSend` exists to prevent.
 */
export function refuseSend(state: ThreadState, message: Message): ThreadState {
  return withDelivery(state, message, 'failed')
}

/**
 * The API's answer to a send, folded into the thread.
 *
 * The echo is dropped in the same step the real message is merged, so the bubble
 * is replaced rather than briefly doubled — the two have different ids and
 * nothing else would ever remove the first.
 *
 * The merge is a merge and not an append because the answer can arrive after a
 * page that already contains it: a refresh that overlapped the send comes back
 * with the server's copy, and folding by id means the second arrival replaces
 * the first instead of showing the person their message twice.
 */
export function applySentMessage(
  state: ThreadState,
  localId: string,
  sent: Message,
): ThreadState {
  return {
    ...state,
    messages: mergeMessages(state.messages, [sent]),
    unsent: state.unsent.filter((entry) => entry.message.id !== localId),
  }
}

/**
 * A send that did not land.
 *
 * The message stays where the person put it, marked, rather than vanishing —
 * what they wrote is not the API's to discard, and a thread that quietly loses a
 * bubble is indistinguishable from one that delivered it.
 *
 * `message` replaces the one being held, for the one thing a failed send can
 * still have achieved: a message carrying three files whose third upload failed
 * has two of them in the object store already, and keeping what came back means
 * the retry sends the third rather than all three again — which would leave two
 * orphaned objects behind every attempt.
 */
export function failSend(
  state: ThreadState,
  localId: string,
  message?: Message,
): ThreadState {
  return {
    ...state,
    unsent: state.unsent.map((entry) =>
      entry.message.id === localId
        ? { message: message ?? entry.message, state: 'failed' }
        : entry,
    ),
  }
}

export function findUnsent(
  state: ThreadState,
  localId: string,
): UnsentMessage | undefined {
  return state.unsent.find((entry) => entry.message.id === localId)
}

/** Everything the thread shows: what the API confirmed, and what is still on its way. */
export function threadMessages(state: ThreadState): Message[] {
  return mergeMessages(
    state.messages,
    state.unsent.map((entry) => entry.message),
  )
}

/** Shared so a settled thread hands its bubbles the same map every render. */
const NOTHING_UNSENT: ReadonlyMap<string, DeliveryState> = new Map()

/** How far each unconfirmed message has got, for the bubbles that render them. */
export function deliveryStates(
  unsent: UnsentMessage[],
): ReadonlyMap<string, DeliveryState> {
  if (unsent.length === 0) return NOTHING_UNSENT
  return new Map(unsent.map((entry) => [entry.message.id, entry.state]))
}

/** Whether a message was sent by the person reading it. */
export function isOutgoing(message: Message, viewerId: string): boolean {
  return isStaffMessage(message) ? message.sender.id === viewerId : !message.fromCompany
}

/**
 * Who to name above an incoming bubble, when the thread names anyone.
 *
 * A Customer's Support DM messages carry no sender by design — the company
 * speaks as one voice — so there is nothing to name and this answers undefined.
 */
export function messageSenderName(message: Message): string | undefined {
  return isStaffMessage(message) ? message.sender.name : undefined
}
