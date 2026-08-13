export type UserRole = 'admin' | 'agent' | 'contact'

export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
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
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: MessageStatus
}

export type InternalNote = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
}
