export type UserRole = 'admin' | 'agent' | 'contact'

export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
  isOnline: boolean
  lastActiveLabel: string
}

export type ConversationKind = 'direct' | 'group'

export type Label = {
  id: string
  name: string
  color: string
}

export type Conversation = {
  id: string
  kind: ConversationKind
  subject: string | null
  participantIds: string[]
  assigneeId: string | null
  labelIds: string[]
  lastMessagePreview: string
  updatedAt: string
  unreadCount: number
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document'

/** Local-URI attachment on a Message (no server upload this phase). */
export type MessageAttachment = {
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

export type MessageReaction = {
  emoji: string
  userIds: string[]
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  /** Caption or plain text; may be empty when only an Attachment is present. */
  body: string
  createdAt: string
  status: MessageStatus
  replyToId?: string
  reactions?: MessageReaction[]
  attachment?: MessageAttachment
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
