import type {
  Conversation,
  InternalNote,
  Label,
  Message,
  Person,
  UserRole,
} from '@/lib/types'

export const DEV_ROLE: UserRole = 'agent'

export const PEOPLE: Person[] = [
  { id: 'admin-1', displayName: 'Amina Okonkwo', role: 'admin', avatarUrl: null },
  { id: 'agent-1', displayName: 'Jonah Reed', role: 'agent', avatarUrl: null },
  { id: 'agent-2', displayName: 'Priya Shah', role: 'agent', avatarUrl: null },
  { id: 'contact-1', displayName: 'Luis Ferreira', role: 'contact', avatarUrl: null },
  { id: 'contact-2', displayName: 'Elena Voss', role: 'contact', avatarUrl: null },
]

export const LABELS: Label[] = [
  { id: 'label-urgent', name: 'Urgent', color: '#d64545' },
  { id: 'label-billing', name: 'Billing', color: '#3452d9' },
]

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-assigned',
    kind: 'direct',
    subject: 'Cannot reset password',
    participantIds: ['contact-1', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: ['label-urgent'],
    lastMessagePreview: 'I still cannot get past the email step.',
    updatedAt: '2026-08-13T08:12:00.000Z',
  },
  {
    id: 'conv-unassigned',
    kind: 'direct',
    subject: 'Invoice discrepancy',
    participantIds: ['contact-2'],
    assigneeId: null,
    labelIds: ['label-billing'],
    lastMessagePreview: 'The March invoice does not match our PO.',
    updatedAt: '2026-08-13T09:40:00.000Z',
  },
  {
    id: 'conv-group',
    kind: 'group',
    subject: 'Warehouse onboarding',
    participantIds: ['contact-1', 'contact-2', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: [],
    lastMessagePreview: 'Sharing the access checklist here.',
    updatedAt: '2026-08-12T16:05:00.000Z',
  },
]

export const MESSAGES: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Hi, the reset link never arrives.',
    createdAt: '2026-08-13T08:00:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: 'Checking the mail logs now.',
    createdAt: '2026-08-13T08:06:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-3',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'I still cannot get past the email step.',
    createdAt: '2026-08-13T08:12:00.000Z',
    status: 'delivered',
  },
  {
    id: 'msg-4',
    conversationId: 'conv-unassigned',
    senderId: 'contact-2',
    body: 'The March invoice does not match our PO.',
    createdAt: '2026-08-13T09:40:00.000Z',
    status: 'sent',
  },
  {
    id: 'msg-5',
    conversationId: 'conv-group',
    senderId: 'agent-1',
    body: 'Sharing the access checklist here.',
    createdAt: '2026-08-12T16:05:00.000Z',
    status: 'read',
  },
]

export const INTERNAL_NOTES: InternalNote[] = [
  {
    id: 'note-1',
    conversationId: 'conv-assigned',
    authorId: 'agent-1',
    body: 'Possible typo in the contact email on file.',
    createdAt: '2026-08-13T08:08:00.000Z',
  },
]
