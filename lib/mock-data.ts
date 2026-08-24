import { Image } from 'react-native'

import type {
  ChartMetric,
  Conversation,
  FaqItem,
  InternalNote,
  KnowledgeArticle,
  Label,
  Message,
  Offer,
  Person,
} from '@/lib/types'

const DEMO_PHOTO_URI = Image.resolveAssetSource(
  require('../assets/offers/payouts.png'),
).uri
const DEMO_PHOTO_2_URI = Image.resolveAssetSource(
  require('../assets/offers/zero-fee.png'),
).uri
const DEMO_VOICE_URI = Image.resolveAssetSource(
  require('../assets/chat/voice-note-demo.wav'),
).uri

const DEMO_VOICE_PEAKS = Array.from({ length: 48 }, (_, i) => {
  const wave = 0.25 + 0.55 * Math.abs(Math.sin(i / 3.2))
  return Math.round(wave * 100) / 100
})


export const PEOPLE: Person[] = [
  {
    id: 'admin-1',
    displayName: 'Amina Okonkwo',
    role: 'admin',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'agent-1',
    displayName: 'Jonah Reed',
    role: 'agent',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'agent-2',
    displayName: 'Priya Shah',
    role: 'agent',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 12h ago',
  },
  {
    id: 'contact-1',
    displayName: 'Luis Ferreira',
    role: 'contact',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 3h ago',
  },
  {
    id: 'contact-2',
    displayName: 'Elena Voss',
    role: 'contact',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'agent-3',
    displayName: 'Kenji Ito',
    role: 'agent',
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: 'Active now',
  },
  {
    id: 'contact-3',
    displayName: 'Maya Chen',
    role: 'contact',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 2d ago',
  },
  {
    id: 'contact-4',
    displayName: 'Omar Haddad',
    role: 'contact',
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: 'Active 6h ago',
  },
]

export const LABELS: Label[] = [
  { id: 'label-urgent', name: 'Urgent', color: '#D64545' },
  { id: 'label-billing', name: 'Billing', color: '#3452D9' },
  { id: 'label-resolved', name: 'Resolved', color: '#1F9D6C' },
]

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-assigned',
    kind: 'direct',
    subject: 'Cannot reset password',
    participantIds: ['contact-1', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: ['label-urgent'],
    lastMessagePreview: 'Voice note',
    updatedAt: '2026-08-13T08:22:00.000Z',
    unreadCount: 2,
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
    unreadCount: 1,
  },
  {
    id: 'conv-group',
    kind: 'group',
    subject: 'Warehouse onboarding',
    participantIds: ['contact-1', 'contact-2', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: ['label-resolved'],
    lastMessagePreview: 'Sharing the access checklist here.',
    updatedAt: '2026-08-12T16:05:00.000Z',
    unreadCount: 0,
  },
  {
    id: 'offers',
    kind: 'group',
    subject: 'Offers',
    participantIds: ['contact-1', 'contact-2', 'agent-1', 'agent-2', 'admin-1'],
    assigneeId: 'agent-1',
    labelIds: [],
    lastMessagePreview: 'This week’s offers are live.',
    updatedAt: '2026-08-13T10:00:00.000Z',
    unreadCount: 3,
  },
]

export const MESSAGES: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Hi, the reset link never arrives 😕',
    createdAt: '2026-08-13T08:00:00.000Z',
    status: 'read',
    reactions: [{ emoji: '👍', userIds: ['agent-1'] }],
  },
  {
    id: 'msg-2',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: 'Checking the mail logs now.',
    createdAt: '2026-08-13T08:06:00.000Z',
    status: 'read',
    reactions: [{ emoji: '👍', userIds: ['contact-1'] }],
  },
  {
    id: 'msg-3',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Still stuck on the email step 📧',
    createdAt: '2026-08-13T08:12:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-8',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: 'Try the link I just resent ✅',
    createdAt: '2026-08-13T08:14:00.000Z',
    status: 'read',
    reactions: [{ emoji: '❤️', userIds: ['contact-1'] }],
  },
  {
    id: 'msg-9',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Got it, thanks! 🙏',
    createdAt: '2026-08-13T08:16:00.000Z',
    status: 'delivered',
    replyToId: 'msg-8',
    reactions: [{ emoji: '👍', userIds: ['agent-1'] }],
  },
  {
    id: 'msg-10',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'One more thing — can you confirm the code? 🔑',
    createdAt: '2026-08-13T08:18:00.000Z',
    status: 'sent',
    replyToId: 'msg-9',
  },
  {
    id: 'msg-11',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: '',
    createdAt: '2026-08-13T08:19:00.000Z',
    status: 'read',
    attachment: {
      kind: 'image',
      uri: DEMO_PHOTO_URI,
      name: 'reset-hint.png',
      size: 48_000,
    },
  },
  {
    id: 'msg-11b',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Looks good — thanks!',
    createdAt: '2026-08-13T08:19:30.000Z',
    status: 'delivered',
    replyToId: 'msg-11',
  },
  {
    id: 'msg-12',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'That matches what I see',
    createdAt: '2026-08-13T08:20:00.000Z',
    status: 'delivered',
    replyToId: 'msg-11',
    attachment: {
      kind: 'image',
      uri: DEMO_PHOTO_2_URI,
      name: 'my-screen.png',
      size: 52_000,
    },
  },
  {
    id: 'msg-12b',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: 'Perfect, that confirms it',
    createdAt: '2026-08-13T08:21:00.000Z',
    status: 'delivered',
    replyToId: 'msg-12',
  },
  {
    id: 'msg-13',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: '',
    createdAt: '2026-08-13T08:22:00.000Z',
    status: 'delivered',
    attachment: {
      kind: 'audio',
      uri: DEMO_VOICE_URI,
      name: 'voice-note-demo.wav',
      size: 16_000,
      durationMs: 1000,
      peaks: DEMO_VOICE_PEAKS,
    },
  },
  {
    id: 'msg-4',
    conversationId: 'conv-unassigned',
    senderId: 'contact-2',
    body: 'The March invoice does not match our PO 📄',
    createdAt: '2026-08-13T09:40:00.000Z',
    status: 'sent',
  },
  {
    id: 'msg-5',
    conversationId: 'conv-group',
    senderId: 'agent-1',
    body: 'Sharing the access checklist here 📋',
    createdAt: '2026-08-12T16:05:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-6',
    conversationId: 'offers',
    senderId: 'admin-1',
    body: 'This week’s offers are live 🎉',
    createdAt: '2026-08-13T10:00:00.000Z',
    status: 'sent',
    reactions: [
      { emoji: '🎉', userIds: ['contact-1'] },
      { emoji: '👍', userIds: ['contact-2', 'agent-1'] },
    ],
  },
  {
    id: 'msg-7',
    conversationId: 'offers',
    senderId: 'admin-1',
    body: 'Zero-fee payouts run through Friday 💸',
    createdAt: '2026-08-13T10:02:00.000Z',
    status: 'sent',
    replyToId: 'msg-6',
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

export const OFFERS: Offer[] = [
  {
    id: 'offer-payouts',
    title: 'Faster payouts this week',
    subtitle: 'Get paid up to 2 days earlier. Limited time only.',
    ctaLabel: 'View offer',
    visual: 'payouts',
    chatId: 'offers',
  },
  {
    id: 'offer-zero-fee',
    title: 'Zero-fee internal transfers',
    subtitle: 'Send and receive money instantly. No fees.',
    ctaLabel: 'View offer',
    visual: 'zero-fee',
    chatId: 'offers',
  },
  {
    id: 'offer-verify',
    title: 'ID Verification bonus',
    subtitle: 'Verify your ID and bonus credit.',
    ctaLabel: 'View offer',
    visual: 'verify',
    chatId: 'offers',
  },
]

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-reset',
    question: 'How do I reset my password?',
    answer: 'Open Messages and start a thread with Support. An agent will send a reset link.',
  },
  {
    id: 'faq-hours',
    question: 'What are support hours?',
    answer: 'Agents are online 08:00–20:00 local time on weekdays. Offers chat is always open.',
  },
  {
    id: 'faq-offers',
    question: 'What are Offers?',
    answer: 'In-app promos from Support. Tap Join Offers chat to read this week’s announcements.',
  },
  {
    id: 'faq-billing',
    question: 'How do I update billing details?',
    answer: 'Message Support with the last four digits of the invoice. An agent will send a secure billing form. Do not paste card numbers in chat.',
  },
  {
    id: 'faq-access',
    question: 'How do I get access for a teammate?',
    answer: 'Ask an Admin to invite them from Users. Agents cannot create accounts. Until then they can sit in Offers chat as a contact.',
  },
  {
    id: 'faq-attach',
    question: 'Can I attach screenshots or templates?',
    answer: 'Yes. Tap the + icon in the message composer to open the attachment menu, insert quick templates, or select media items.',
  },
  {
    id: 'faq-lock',
    question: 'Why is my account locked?',
    answer: 'Too many failed sign-in attempts. Open Messages and an agent can unlock after they verify you.',
  },
]

export const KNOWLEDGE: KnowledgeArticle[] = [
  {
    id: 'kb-reset',
    title: 'Password reset script',
    tags: ['password', 'access'],
    body: '1. Confirm the email on file.\n2. Send a reset link from Messages.\n3. Ask them to check spam.\n4. If it still fails, unlock after verifying last invoice digits.',
  },
  {
    id: 'kb-billing',
    title: 'Billing update script',
    tags: ['billing'],
    body: 'Ask for the last four digits of the invoice only. Send the secure billing form. Never collect full card numbers in chat. Note the thread id in the reply.',
  },
  {
    id: 'kb-unlock',
    title: 'Unlock checklist',
    tags: ['access', 'security'],
    body: 'Confirm display name + last invoice. Check failed sign-in count. Unlock after verification. Tell them to change password immediately.',
  },
  {
    id: 'kb-access',
    title: 'Teammate access',
    tags: ['access', 'admin'],
    body: 'Agents cannot create accounts. Ask an Admin to invite from Users. Until then they can sit in Offers chat as a contact.',
  },
  {
    id: 'kb-offers',
    title: 'Offers announcement template',
    tags: ['offers'],
    body: 'This week’s offers are live in Offers chat. Tap Join Offers chat on Home. Sponsored is a label — not checkout.',
  },
]

export const CHART_METRICS: ChartMetric[] = [
  {
    id: 'open-threads',
    title: 'Open threads',
    hint: 'Assigned + unassigned, last 7 days',
    value: '12',
    deltaLabel: '+3 vs last week',
    kind: 'bar',
    series: [6, 8, 7, 9, 11, 10, 12],
  },
  {
    id: 'unassigned',
    title: 'Unassigned',
    hint: 'Pool size by day',
    value: '1',
    deltaLabel: '−2 vs last week',
    kind: 'line',
    series: [4, 3, 5, 3, 2, 2, 1],
  },
  {
    id: 'messages',
    title: 'Messages',
    hint: 'Sent + received, last 7 days',
    value: '84',
    deltaLabel: '+12 vs last week',
    kind: 'line',
    series: [48, 52, 61, 55, 70, 76, 84],
  },
  {
    id: 'offers-taps',
    title: 'Offer taps',
    hint: 'Promo card opens, last 7 days',
    value: '31',
    deltaLabel: '+5 vs last week',
    kind: 'bar',
    series: [18, 20, 22, 19, 24, 28, 31],
  },
  {
    id: 'thread-mix',
    title: 'Thread mix',
    hint: 'Open threads by kind',
    value: '4',
    deltaLabel: 'Direct · group · offers',
    kind: 'pie',
    series: [2, 1, 1],
    slices: [
      { label: 'Direct', value: 2 },
      { label: 'Group', value: 1 },
      { label: 'Offers', value: 1 },
    ],
  },
  {
    id: 'desk-load',
    title: 'Desk load',
    hint: 'Who is carrying open work',
    value: '100%',
    deltaLabel: 'Assigned vs pool',
    kind: 'donut',
    series: [3, 1],
    slices: [
      { label: 'Assigned', value: 3 },
      { label: 'Unassigned', value: 1 },
    ],
  },
]
