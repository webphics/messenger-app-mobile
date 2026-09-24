export type UserRole = 'admin' | 'agent' | 'customer'

/**
 * A role as it may arrive in somebody *else's* row.
 *
 * The API's enum is `['admin', 'agent', 'customer', 'developer']` — four, not
 * three. `UserRole` stays at three deliberately, because it is the role this
 * app routes on: there is no developer Hub, and `lib/auth-response` refuses a
 * session whose role this client cannot place.
 *
 * But a directory lists other people, and one of them being a developer is not
 * a reason to drop their row or to relabel them as something they are not.
 * That is what this is for, and it is only ever read — nothing here routes on
 * it.
 */
export type DirectoryRole = UserRole | 'developer'

/**
 * The signed-in person as the API reports them. The role is server-owned: it
 * arrives on this payload and the client has no way to set it.
 */
export type SessionUser = {
  id: string
  name: string
  email: string
  role: UserRole
  /**
   * Whether this account has a password at all, which is what the password
   * screen reads to decide whether it is setting a first one or changing an
   * existing one.
   *
   * A magic-link-only or Google-only account has none. `lib/account-state` asks
   * the same question of an identifier before sign-in, and that path stops being
   * usable once there is a session, so for anybody already signed in this is the
   * answer. See
   * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`.
   */
  hasPassword: boolean
  /** Whether two-factor is on, which is the state the two-factor row reports. */
  twoFactorEnabled: boolean
  /**
   * Whether Support DMs are worked by assignment — Engage, Takeover, Transfer,
   * the Unassigned pool — or as a Shared queue, where any staff member who can
   * see one answers it. A server-wide switch rather than anything about this
   * person, sent on every role's session. Read it through
   * `isSupportAssignmentEnabled` in `lib/support-assignment`.
   */
  supportAssignmentEnabled: boolean
}

/** A mock directory entry. Only the Agent and Admin screens still read this. */
export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
  isOnline: boolean
  lastActiveLabel: string
}

/**
 * The conversation and message shapes below mirror the API's responses in
 * `conversations.schema.ts` rather than describing anything this client invents.
 * Two things they mirror were lies in the mock shape they replace.
 *
 * They are discriminated twice. Once by `type` — a Support DM, a group, a staff
 * DM, an announcement — and again by who is doing the looking: Staff receive
 * assignee, customer and presence detail that a Customer's payload does not
 * carry at all, and a message reaches Staff with a named `sender` where a
 * Customer's Support DM message carries only `fromCompany`. A Customer reading a
 * *group* receives the staff-shaped message: the sender is another member and
 * naming them is the point. `isStaffConversation` and `isStaffMessage` are how a
 * screen asks which of the two it is holding.
 *
 * And a message carries `attachments` — plural, and in the API's shape, where
 * the URL is a server object rather than a device URI. `AttachmentView` is the
 * separate local shape a bubble renders and the picker produces;
 * `lib/attachment-view.ts` turns one into the other.
 */

/**
 * The four shapes a conversation arrives as, and they are the API's four —
 * `chatConversationTypes` in `chat.mongo.constants.ts`, which is the list this
 * has to match exactly.
 *
 * `broadcast_inbox` is the read-only Announcements thread. One of them belongs
 * to the person — where a Broadcast addressed to them lands — and the rest
 * belong to Communities, which is what `communityId` tells apart.
 *
 * It replaces a `community_announcement` that this client invented and the API
 * has never sent. The cost of that was not cosmetic: `parseConversation` drops
 * a row whose type it does not recognise, so every Announcements thread there
 * is — the personal one and every Community's — was discarded on arrival, and a
 * Broadcast notification pointed at a thread the app did not hold.
 */
export type ConversationType =
  | 'support_dm'
  | 'staff_dm'
  | 'group'
  | 'broadcast_inbox'

/** Assignment state of a Support DM. Null on every other conversation type. */
export type SupportStatus = 'unassigned' | 'engaged' | 'closed'

/**
 * Who may send into a Group (messenger-api#46): everyone in it, only the
 * people who run it, or a chosen set of writers. Group-only; every other
 * conversation type carries no policy at all.
 */
export type GroupWritePolicy = 'everyone' | 'admins' | 'named'

export type MessageType = 'text' | 'media' | 'voice' | 'system'

/** How far a message the viewer sent has got. Not a local send state. */
export type ReceiptStatus = 'sent' | 'delivered' | 'read'

export type LabelColor =
  | 'slate'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'violet'
  | 'pink'

export type Label = {
  id: string
  name: string
  color: LabelColor
  archived: boolean
}

/**
 * An internal note on a Support DM.
 *
 * Staff-only, and never shown to the Customer — the API refuses one a Customer
 * asks for, and nothing on a Customer's screens asks. `messageId` names the
 * message it was written about, where it was written about one.
 */
export type ConversationNote = {
  id: string
  text: string
  author: { id: string; name: string }
  messageId: string | null
  createdAt: string
}

/** A person named on a conversation. Presence is staff-facing and absent from a Customer's payload. */
export type ConversationPerson = {
  id: string
  name: string
  isOnline?: boolean
  lastOnlineAt?: string | null
}

export type ConversationStaffPerson = ConversationPerson & { role: UserRole }

/** What every conversation row reports about its newest message, resolved for the viewer. */
type ConversationBase = {
  id: string
  /**
   * The organization this thread belongs to, or null for the two that belong to none: a
   * person's own Announcements thread, and the onboarding Support DM a Customer holds
   * before they belong anywhere. The API stops sending the second the moment they join an
   * organization.
   */
  organizationId: string | null
  /**
   * The Community this thread belongs to, or null for one that belongs to no
   * Community.
   *
   * What separates a Community's room from an ordinary group chat, which share a
   * `type` and are not the same thing to a person: a Community's rooms are read
   * in the Communities tab, and a group three colleagues started is read in the
   * inbox beside their DMs. `lib/conversation-scope` is where that question is
   * asked; nothing else should read this field directly.
   *
   * Optional for the reason `writePolicy` below is: the fixtures in this
   * codebase predate it and carry none. A real payload always sends it, and an
   * absent one reads as "belongs to no Community" — which is the safe way
   * round, because it leaves a thread in the inbox rather than hiding it inside
   * a Community nobody can name.
   */
  communityId?: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageMine: boolean
  lastMessageReceiptStatus: ReceiptStatus | null
  lastMessageRead: boolean
  /** Null outside the list endpoint, where the API declines to count. */
  unreadCount: number | null
}

/** What an Agent or an Admin receives, for any conversation type. */
export type StaffConversation = ConversationBase & {
  type: ConversationType
  status: SupportStatus | null
  title: string | null
  description: string | null
  avatarUrl: string | null
  customer: ConversationPerson | null
  assignedAgent: ConversationPerson | null
  otherUser: ConversationStaffPerson | null
  members: ConversationStaffPerson[]
  labels: Label[]
  /**
   * Group-only; `null` for every other type. Always resolves `true` for
   * Staff on the API's own mapper — an Admin or a participating Agent bypasses
   * the policy entirely — so nothing on this client's staff screens ever reads
   * a group as locked. Optional because most fixtures in this codebase predate
   * it and carry no group at all; a real payload always sends it.
   */
  writePolicy?: GroupWritePolicy | null
  canWrite?: boolean
}

/** A Customer's own support thread. Carries no assignee-facing detail at all. */
export type CustomerSupportConversation = ConversationBase & {
  type: 'support_dm'
}

export type CustomerGroupConversation = ConversationBase & {
  type: 'group'
  title: string
  description: string | null
  avatarUrl: string | null
  members: ConversationStaffPerson[]
  /** Whether this Customer may write here, resolved by the API against the policy below. */
  writePolicy: GroupWritePolicy
  canWrite: boolean
}

/**
 * A read-only Announcements thread: a Community's, or the person's own.
 *
 * One shape for every role, unlike every other conversation type — the API maps
 * it through a single mapper because the thread has one reader and no second
 * viewer whose copy would differ.
 *
 * `organizationId` is the one field that does not come from `ConversationBase`,
 * because on this type alone it may be null: the personal Announcements thread
 * belongs to a person rather than to an organization, so that somebody who
 * belongs to none still has somewhere to receive a Broadcast.
 */
export type BroadcastInboxConversation = Omit<ConversationBase, 'organizationId'> & {
  type: 'broadcast_inbox'
  organizationId: string | null
  title: string
}

export type CustomerConversation =
  | CustomerSupportConversation
  | CustomerGroupConversation
  | BroadcastInboxConversation

export type Conversation = StaffConversation | CustomerConversation

/**
 * How the Conversation fetch behind the list is doing — the second half of the
 * Launch gate.
 *
 * `failed` is a settled outcome, not a held one: with the Store there is
 * something to draw either way, and an animation held open on a bad network is
 * the failure the gate exists to prevent. The two are kept apart rather than
 * collapsed to a boolean so the gate's table can say which is which.
 *
 * `abandoned` is the third settled outcome: the Launch deadline passed with a
 * load still out. See #52 — a Resync restarts the load underneath the gate, so
 * a socket that flaps bounds every round trip and never the launch. It is not
 * terminal: the load it gave up on may still answer, and is free to overwrite
 * it when it does.
 *
 * Produced by `lib/conversation-inbox` and read by `lib/launch-route`; here
 * rather than in either, so neither has to import the other.
 */
export type ConversationFetch =
  | 'outstanding'
  | 'answered'
  | 'failed'
  | 'abandoned'

/**
 * Which shape a conversation arrived in.
 *
 * `labels` is the discriminator because it is the one field only the staff
 * payload carries on every type — `members` is absent from a Customer's Support
 * DM and present on their group, and `status` is null on a staff group.
 */
export function isStaffConversation(
  conversation: Conversation,
): conversation is StaffConversation {
  return 'labels' in conversation
}

/** An attachment as the API stores it: a server URL and a MIME type, not a device URI. */
export type MessageAttachment = {
  /** MIME type, e.g. `image/png`. */
  type: string
  url: string
  fileName: string | null
  size: number | null
  durationSeconds: number | null
  waveform: number[] | null
}

export type MessageReplyTo = {
  id: string
  preview: string | null
}

/** One reaction by one person. The API does not group them; `lib/message-react` does. */
export type MessageReaction = {
  emoji: string
  userId: string
}

type MessageBase = {
  id: string
  /** Caption or plain text; empty when the message is only attachments. */
  body: string
  messageType: MessageType
  /**
   * Whether a `system` notice is addressed to the Customer rather than recording a staff
   * action. The onboarding thread's welcome is the one that is; every other system message
   * the product writes is internal and withheld from a Customer.
   *
   * Optional, and absent reads as "internal" -- which is the behaviour every system message
   * had before the welcome existed, and what a payload from an older API carries.
   */
  addressedToCustomer?: boolean
  createdAt: string
  /**
   * Null until the author rewrote it, within the API's fifteen-minute edit window.
   * Presence is the flag and the value is the timestamp — one field, because there
   * is no state where a separate boolean could disagree with it.
   *
   * `createdAt` is untouched by an edit, so a message does not move in the thread
   * because somebody fixed a typo.
   */
  editedAt: string | null
  replyTo: MessageReplyTo | null
  reactions: MessageReaction[]
  attachments: MessageAttachment[]
  receiptStatus: ReceiptStatus
}

/** What Staff receive, and what a Customer receives in a group. */
export type StaffMessage = MessageBase & {
  sender: ConversationStaffPerson
}

/** What a Customer receives in their Support DM: the company speaks as one voice. */
export type CustomerMessage = MessageBase & {
  fromCompany: boolean
}

export type Message = StaffMessage | CustomerMessage

/**
 * One person's receipt on one message: who, and when.
 *
 * `user` is null where the reader must not be named. A Customer in a support DM
 * is answered by the company as one voice, so the API withholds the Agent behind
 * it here exactly as it does on every message in the thread — and withholds the
 * id with the name, since an id is stable across messages and would separate one
 * Agent from another just as well.
 */
export type MessageReceipt = {
  user: ConversationStaffPerson | null
  at: string
}

/**
 * Read implies delivered, so nobody stands in both lists, and the sender stands
 * in neither: their own copy of what they wrote is not a receipt.
 */
export type MessageReceipts = {
  readBy: MessageReceipt[]
  deliveredTo: MessageReceipt[]
}

export function isStaffMessage(message: Message): message is StaffMessage {
  return 'sender' in message
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document'

/**
 * An attachment as this app renders and captures it.
 *
 * The picker and the recorder produce one of these directly; an attachment that
 * arrived from the API becomes one through `lib/attachment-view.ts`. It exists
 * because a bubble needs a kind, a playable URI and a duration in milliseconds,
 * while the API's shape carries a MIME type, a possibly-relative URL and seconds.
 */
export type AttachmentView = {
  kind: AttachmentKind
  uri: string
  name: string
  size: number | null
  /** Voice notes and videos when known. */
  durationMs?: number
  /** Natural pixel size for images and videos when the picker reported it. */
  width?: number
  height?: number
  /** Downsampled 0..1 levels for voice-note waveforms (~32–64 bars). */
  peaks?: number[]
}

/**
 * A staff member as `GET /conversations/staff` lists them.
 *
 * Not a `ConversationStaffPerson`: it carries the organizations the viewer and
 * this person share, which is what a staff DM binds to and what decides whether
 * one can exist at all. Null where the API did not say — a row that names no
 * shared organization is a row no DM can be started with, and the two must not
 * read the same.
 */
export type StaffDirectoryUser = {
  id: string
  name: string
  /** A directory of staff: the API sends no Customer here. */
  role: 'admin' | 'agent'
  isOnline?: boolean
  lastOnlineAt?: string | null
  sharedOrganizations: Organization[] | null
}

export type InternalNote = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
}

export type OfferVisual = 'payouts' | 'zero-fee' | 'verify'

export type Offer = {
  id: string
  title: string
  subtitle: string
  ctaLabel: string
  visual: OfferVisual
  chatId: 'offers'
}

export type FaqItem = {
  id: string
  question: string
  answer: string
}

export type KnowledgeArticle = {
  id: string
  title: string
  body: string
  tags: string[]
}

export type ChartKind = 'bar' | 'line' | 'pie' | 'donut'

export type ChartSlice = {
  label: string
  value: number
}

export type ChartMetric = {
  id: string
  title: string
  hint: string
  value: string
  deltaLabel: string
  kind: ChartKind
  series: number[]
  slices?: ChartSlice[]
}

/**
 * What `GET /analytics/overview` answers with, for the Admin Hub's charts.
 *
 * Only the parts a chart is drawn from. The response also carries `agents` — a
 * per-actor breakdown the web dashboard renders as a table — and this client
 * has no screen for it, so it is deliberately not parsed (`lib/wall-parse`'s
 * rule: the parts nothing renders yet are not read).
 *
 * `snapshot` is a right-now reading and `resolution`/`series` are bound to the
 * range, which is the one thing about this payload worth keeping straight: they
 * travel together and answer on different clocks (the API's own schema doc).
 */
export type AnalyticsSeriesPoint = {
  /** `YYYY-MM-DD`, UTC. One point per day in the range, gaps included as zeroes. */
  date: string
  conversationsOpened: number
  messagesSent: number
}

export type AnalyticsUserCounts = {
  admin: number
  agent: number
  customer: number
}

/** Current state, whatever range was asked for. */
export type AnalyticsSnapshot = {
  unassigned: number
  engaged: number
  closed: number
  /**
   * Support DMs not closed, and of those, the ones whose latest message came
   * from the Customer. Both answered in either mode, and both null rather than
   * zero from an API that predates them: unknown is not the same as none.
   */
  open: number | null
  awaitingReply: number | null
  groups: number
  users: AnalyticsUserCounts
}

/**
 * What arrived and what was resolved inside the range. `closed` may exceed
 * `opened` — a team working down a backlog resolves more than arrived — so
 * nothing may treat the pair as a ratio bounded at 1.
 */
export type AnalyticsResolution = {
  opened: number
  closed: number
}

export type AnalyticsOverview = {
  /** Echoed by the API, so a client that sent no range can say what it is showing. */
  range: { from: string; to: string }
  snapshot: AnalyticsSnapshot
  resolution: AnalyticsResolution
  series: AnalyticsSeriesPoint[]
}

/** An organization the signed-in person belongs to, from `GET /memberships/mine`. */
export type Organization = {
  id: string
  name: string
}

/**
 * What a contact is, which is not the same as who a person is.
 *
 * `GET /conversations/contacts` answers with everyone the signed-in person can
 * begin a conversation with, and the API decides that per role: a Customer
 * receives one row per organization they belong to — the company, reached as
 * one voice — an Agent receives the Customers whose Support DMs they can see
 * plus every other staff member, and an Admin receives the whole directory.
 *
 * `conversationId` is the thread that already exists between the two, where one
 * does. Null is not an error: it is the row a tap has to create something for,
 * and `lib/contact-directory` is where that decision is written down.
 */
export type ContactKind = 'company' | 'customer' | 'staff'

export type Contact = {
  /** A person's id, or — for a company — the organization's. */
  id: string
  name: string
  kind: ContactKind
  /** Null on a company, which is an organization rather than somebody. */
  role: DirectoryRole | null
  conversationId: string | null
}

/**
 * An organization as the Admin directory lists it, which is more than the
 * `Organization` a membership answers with: the counts are what the list is
 * for, and they are the API's rather than anything this client tallies.
 */
export type OrganizationSummary = Organization & {
  memberCount: number
  conversationCount: number
  createdAt: string
  updatedAt: string
}

/** One accepted member of an organization, from `GET /memberships/organization/:id`. */
export type OrganizationMember = {
  id: string
  name: string
  /** A free string on the API's schema rather than the role enum, so it is read as one. */
  role: string
}

/** An invitation addressed to the signed-in person, from `GET /invitations/mine`. */
export type Invitation = {
  id: string
  organization: Organization
  createdAt: string
}

/**
 * What an invite attempt did, per organization.
 *
 * Lists rather than a success flag, because the API answers with lists: an
 * invitation was created, the person joined outright, they were already a
 * member, or an invitation was already pending. Only the first two are news,
 * and the other two are the reason a repeated invite is not an error.
 *
 * `invited` and `joined` never both carry entries. A Customer joins the moment
 * they are invited and everybody else is offered an invitation (ADR 0013), and
 * the role belongs to the person, so one call takes one path.
 */
export type InviteOutcome = {
  invited: Organization[]
  /** Memberships this call wrote, with no invitation in between. */
  joined: Organization[]
  alreadyMembers: Organization[]
  alreadyInvited: Organization[]
}

/**
 * A saved filter over the conversation list: a name and the organizations it
 * keeps. From `GET /inboxes`, and per person rather than per organization.
 */
export type CustomInbox = {
  id: string
  name: string
  organizationIds: string[]
}

/** What an Agent may do beyond reading and writing. Admin bypasses all four. */
export type AgentPermission = 'transfer' | 'close' | 'manage_labels' | 'staff_dm'

/**
 * A person as the Admin directory holds them, which is a great deal more than
 * a `Contact`: the account itself, its state, and where it belongs.
 *
 * `isBanned` is the API's computed answer rather than the raw column — bans
 * expire lazily, so the column stays true after the expiry passes and only
 * this field accounts for it.
 */
export type ManagedUser = {
  id: string
  name: string | null
  email: string
  phone: string | null
  role: DirectoryRole
  emailVerified: boolean
  is2faEnabled: boolean
  isBanned: boolean
  banReason: string | null
  banExpires: string | null
  activeSessionCount: number
  /** Accepted memberships. Invitations are the two lists beside it. */
  organizations: Organization[]
  pendingInvitations: { id: string; organization: Organization }[]
  declinedInvitations: { id: string; organization: Organization }[]
  createdAt: string
  updatedAt: string
}

/**
 * A Post, and the pieces it is made of.
 *
 * Not a Message, and the glossary is emphatic about it: a Message is addressed
 * to a conversation's participants and carries Receipts; a Post belongs to its
 * author, is readable by an organization rather than sent to anybody, and
 * carries no Receipt at all. The two share a reactions shape and nothing else,
 * which is why this is its own type rather than a `Message` with fields switched
 * off — see the API's `docs/adr/ADR-0007-the-wall-is-not-a-conversation.md`.
 *
 * This once read "and cannot be edited", which was the sharpest line between the
 * two and is no longer true: a Message is editable by its author for fifteen
 * minutes. The distinction survives in the shape of the two edits rather than in
 * one having none. A Post is its author's to revise for as long as it stands,
 * because it is a thing they published. A Message was handed to somebody, so the
 * window closes — what can be rewritten is bounded to what has probably not been
 * read yet, and `editedAt` says so permanently either way.
 *
 * Nothing here is a Delivery state, because a Post has no delivery to report: it
 * is published rather than sent, and there is no Outbox row for one.
 */
export type WallAttachmentKind = 'image' | 'video' | 'document'

/**
 * The API's own three-way kind rather than a MIME type, so a client never
 * re-derives one. A value this app does not know is dropped at the parse rather
 * than rendered as a broken image.
 */
export type WallPostAttachment = {
  kind: WallAttachmentKind
  url: string
  fileName: string | null
  size: number | null
}

/** The one labelled link a Post may carry. The label is its author's free text. */
export type WallPostLink = {
  label: string
  url: string
}

export type WallPostAuthor = {
  id: string
  name: string
}

export type WallPostReaction = {
  emoji: string
  userId: string
}

/** A push up or down on a Post — the Wall's ranking signal, never both at once. */
export type WallVoteDirection = 'up' | 'down'

/**
 * How a Wall is read: newest first, or by what people responded to.
 *
 * `recent` is the default and is byte-identical to reading with no `sort` at
 * all — see `lib/wall-api`'s `listWallPosts`. `popular` ranks within a rolling
 * window the API owns and freezes its own paging order per reader per Wall
 * scope, which is why switching between the two has to reset paging rather
 * than reuse a cursor the other order minted.
 */
export type WallSort = 'recent' | 'popular'

/**
 * What a Post is for — the one fact the Wall cannot derive from the Post itself.
 * Mirrors `wallPostKinds` in the API. Set once at creation and never editable,
 * the same way `organizationId` is: a kind is what a reader filtered on and what
 * the card is drawn from, so re-kinding a Post people have already acted on
 * rewrites what they responded to.
 */
export const wallPostKinds = ['promotion', 'giveaway', 'news', 'ad', 'community'] as const

export type WallPostKind = (typeof wallPostKinds)[number]

export type WallPost = {
  id: string
  author: WallPostAuthor
  /** The Post's whole audience, set once. A Wall spanning several needs it. */
  organizationId: string
  /**
   * Never null. A Post written before kinds existed reads as `community`, which
   * the API defaults on both write and read — so there is one shape to render
   * and the kind filter has no nameless sixth bucket.
   */
  kind: WallPostKind
  /** The headline, separate from `body`. A community Post is a remark and may omit it. */
  title: string | null
  body: string | null
  /**
   * When a promotion or giveaway stops being one. Nothing hides an ended Post —
   * an expired offer is still a record of what was offered — so a card draws it
   * as ended rather than dropping it. Null on every other kind: the API refuses
   * a deadline on a Post nothing happens to.
   */
  endsAt: string | null
  /** When somebody pinned this Post, null when it is not pinned. */
  pinnedAt: string | null
  attachments: WallPostAttachment[]
  link: WallPostLink | null
  reactions: WallPostReaction[]
  /**
   * Upvotes minus downvotes — may be negative. There is deliberately no
   * downvote count anywhere, on this type or the API's: `score` already
   * carries it, and a public downvote tally is not offered at all.
   */
  score: number
  /** The upvote total alone. */
  upvoteCount: number
  /**
   * How many distinct people have seen this Post, its author excluded and
   * counted once per person ever — public and global, not per-organization
   * or per-Wall (`docs/api/wall.md`'s `POST /wall/posts/:id/view`). Never
   * present on a `post-created`/`post-updated` realtime payload, since
   * recording a view raises no broadcast at all.
   */
  viewCount: number
  /**
   * Whether the asking person has bookmarked this Post. Private and
   * caller-specific — never a count, and never present in what the API
   * broadcasts to an organization's realtime room (`docs/planning/wall-bookmarks.md`),
   * so nothing here should ever expect it on a `post-created` or `post-updated`
   * socket event to read true for anyone but the person who bookmarked it.
   */
  isBookmarked: boolean
  /** Null until somebody edits it, which is what lets a card say "Edited". */
  editedAt: string | null
  createdAt: string
}

/**
 * A named Wall: a saved query over organizations, shared by handing its id
 * around. It holds no Posts and no Post points back at one — see `CONTEXT.md`
 * and the API's `docs/api/wall.md` — which is what lets anyone create one,
 * share it, and read `GET /wall/posts?wall=<id>` through it.
 *
 * `organizationIds` is already narrowed to what the reader may see of it: the
 * API intersects a Wall's saved organizations with the caller's live
 * memberships before answering, an Admin excepted, so a stranger opening a
 * shared link never learns which organization ids are real. This client never
 * widens it further and never offers to rename, re-scope, or delete one —
 * authoring a Wall stays on web.
 */
export type NamedWall = {
  id: string
  name: string
  organizationIds: string[]
}

/**
 * A Community, and the rows one holds.
 *
 * A named container of Groups inside one Organization, created by an Admin on
 * web. What a phone gets is the member's half — see `CONTEXT.md` — so nothing
 * here describes administering one, and the fields an administrator would need
 * are deliberately not parsed.
 *
 * `memberIds` is the exception, and it is here for one question: whether the
 * viewer is in this Community. An Admin's `GET /communities` answers with every
 * Community in the product, including ones they never joined, and a Community
 * somebody is not in has to be invisible rather than refused — so the list is
 * narrowed on this device before anything is drawn or written. See
 * `lib/community-list`.
 */
export type Community = {
  id: string
  name: string
  description: string | null
  avatarUrl: string | null
  memberCount: number
  /** How many Groups are linked to it, the viewer's membership of them aside. */
  linkedGroupCount: number
  memberIds: string[]
  createdAt: string
}

/** How somebody gets into a Group: an ask a Moderator answers, or a walk-in. */
export type GroupJoinPolicy = 'request' | 'open'

/**
 * One row of `GET /communities/:id/groups`, in the API's own three shapes.
 *
 * Three rather than one row with optional fields, because the three are
 * different claims: the Community's pinned Announcements thread, a Group the
 * viewer is in — which carries everything a conversation row draws — and one
 * they are not, which carries a member count and structurally nothing else,
 * because membership is the read boundary. A client that flattened them would
 * have to invent an unread count for a room nobody has let it into.
 *
 * The third is parsed and not yet drawn. Joining is #73's, and dropping the
 * shape here would make the Store's copy of a feed a different thing from the
 * API's answer — a row that vanished on the way to disk and came back missing.
 */
export type CommunityAnnouncementsRow = {
  kind: 'announcements'
  id: string
  title: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  /**
   * How much of it the viewer has not read.
   *
   * The feed does not say — the API's Announcements shape carries no count —
   * so this arrives from the Conversation list, which holds the same thread and
   * is the copy the socket keeps moving. Zero until it does, which is what a row
   * with nothing to report looks like anyway. See `withLiveThread`.
   */
  unreadCount: number
}

export type CommunityMemberGroupRow = {
  kind: 'member_group'
  id: string
  title: string
  avatarUrl: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  muted: boolean
  joinPolicy: GroupJoinPolicy
}

export type CommunityJoinableGroupRow = {
  kind: 'joinable_group'
  id: string
  title: string
  avatarUrl: string | null
  memberCount: number
  joinPolicy: GroupJoinPolicy
  /** Whether an ask is already open, which is never derivable from the policy. */
  joinState: 'pending' | 'may_request'
}

export type CommunityFeedRow =
  | CommunityAnnouncementsRow
  | CommunityMemberGroupRow
  | CommunityJoinableGroupRow

/**
 * What `POST /communities/:id/groups/:groupId/join` answers: whether the tap
 * put the person straight in, or opened an ask a Moderator answers.
 *
 * `open` returns the joined Group's own conversation, because the next step is
 * to open it. `request` returns nothing further — #73 draws the pending state
 * from a re-read of the feed rather than from anything in this answer, and
 * withdrawing an ask (or being told it was answered) is #88's.
 */
export type GroupJoinOutcome =
  | { outcome: 'joined'; conversation: Conversation }
  | { outcome: 'requested' }

/** The rows a Community's feed opens a conversation from: everything but a Group nobody is in. */
export type CommunityThreadRow = CommunityAnnouncementsRow | CommunityMemberGroupRow

/**
 * What `GET /notifications/settings` answers, and what every write to it answers
 * with: one document per person, holding the three standing answers the API keeps
 * about who may notify them.
 *
 * `postOrganizationIds` is the one this client writes, and it is opt-*in*: an
 * organization is in the list only because somebody put it there, and a Post
 * notifies nobody who has not. The other two are the opposite direction — a
 * Broadcast reaches everyone who has not opted out, a thread notifies until it
 * is muted — and are parsed rather than used, because they are what the document
 * is and a write answers with all three.
 */
export type NotificationSettings = {
  broadcastOptOut: boolean
  mutedConversationIds: string[]
  postOrganizationIds: string[]
}

/**
 * One session on this account, as `GET /sessions` answers it.
 *
 * The sessions screen's shape rather than the API's whole row. What is dropped
 * is what nothing on a phone reads: the raw `userAgent`, which is the string
 * `deviceName` and `deviceType` were derived from and is 200 characters of
 * nothing a person recognises themselves by; `expiresAt`, which is the API's
 * own bookkeeping and not a fact about a device; and `status` with `isRevoked`,
 * because this screen asks for active sessions only, so every row it holds is
 * active by construction. See
 * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`.
 *
 * `isCurrent` is the API's answer to which of these is the device in hand, and
 * is the only place that answer comes from. `lib/account-session-rows` is what
 * follows from it, and a phone never guesses at it from a device name.
 */
export type AccountSession = {
  id: string
  /** What the API made of the user agent, such as `Windows 11 - Chrome`. */
  deviceName: string
  /** `desktop`, `mobile`, `tablet` or `unknown`. */
  deviceType: string
  ipAddress: string | null
  /** `email`, `magic-link`, `google`, or null for a session that predates the column. */
  loginMethod: string | null
  isCurrent: boolean
  createdAt: string
  /** Last touched, which is as close to "last used" as the API keeps. */
  updatedAt: string
}
