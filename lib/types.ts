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

export type MessageReaction = {
  emoji: string
  userIds: string[]
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: MessageStatus
  replyToId?: string
  reactions?: MessageReaction[]
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
