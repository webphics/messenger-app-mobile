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

export type ConversationType =
  | 'support_dm'
  | 'staff_dm'
  | 'group'
  | 'community_announcement'

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
  organizationId: string
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

export type CustomerAnnouncementConversation = ConversationBase & {
  type: 'community_announcement'
  title: string
  description: string | null
  avatarUrl: string | null
  members: ConversationStaffPerson[]
}

export type CustomerConversation =
  | CustomerSupportConversation
  | CustomerGroupConversation
  | CustomerAnnouncementConversation

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
  createdAt: string
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
 * Three lists rather than a success flag, because the API answers with three:
 * an invitation was created, the person was already a member, or one was
 * already pending. Only the first is news, and the other two are the reason a
 * repeated invite is not an error.
 */
export type InviteOutcome = {
  invited: Organization[]
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
 * to a conversation's participants, carries Receipts and cannot be edited; a
 * Post belongs to its author, is readable by an organization rather than sent to
 * anybody, carries no Receipt at all, and can be edited. The two share a
 * reactions shape and nothing else, which is why this is its own type rather
 * than a `Message` with fields switched off — see the API's
 * `docs/adr/ADR-0007-the-wall-is-not-a-conversation.md`.
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

export type WallPost = {
  id: string
  author: WallPostAuthor
  /** The Post's whole audience, set once. A Wall spanning several needs it. */
  organizationId: string
  body: string | null
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
