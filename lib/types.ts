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
