import { Image } from "react-native";

import type {
  FaqItem,
  InternalNote,
  KnowledgeArticle,
  Label,
  Offer,
  Person,
  StaffConversation,
  StaffMessage,
  UserRole,
} from "@/lib/types";

// `resolveAssetSource` answers null for a source it cannot resolve, which is
// what jest's asset stub hands it for the `.wav`.
function assetUri(source: number): string {
  return Image.resolveAssetSource(source)?.uri ?? "";
}

const DEMO_PHOTO_URI = assetUri(require("../assets/offers/payouts.png"));
const DEMO_PHOTO_2_URI = assetUri(require("../assets/offers/zero-fee.png"));
const DEMO_VOICE_URI = assetUri(require("../assets/chat/voice-note-demo.wav"));

const DEMO_VOICE_PEAKS = Array.from({ length: 48 }, (_, i) => {
  const wave = 0.25 + 0.55 * Math.abs(Math.sin(i / 3.2));
  return Math.round(wave * 100) / 100;
});

export const PEOPLE: Person[] = [
  {
    id: "admin-1",
    displayName: "Amina Okonkwo",
    role: "admin",
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: "Active now",
  },
  {
    id: "agent-1",
    displayName: "Jonah Reed",
    role: "agent",
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: "Active now",
  },
  {
    id: "agent-2",
    displayName: "Priya Shah",
    role: "agent",
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: "Active 12h ago",
  },
  {
    id: "customer-1",
    displayName: "Luis Ferreira",
    role: "customer",
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: "Active 3h ago",
  },
  {
    id: "customer-2",
    displayName: "Elena Voss",
    role: "customer",
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: "Active now",
  },
  {
    id: "agent-3",
    displayName: "Kenji Ito",
    role: "agent",
    avatarUrl: null,
    isOnline: true,
    lastActiveLabel: "Active now",
  },
  {
    id: "customer-3",
    displayName: "Maya Chen",
    role: "customer",
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: "Active 2d ago",
  },
  {
    id: "customer-4",
    displayName: "Omar Haddad",
    role: "customer",
    avatarUrl: null,
    isOnline: false,
    lastActiveLabel: "Active 6h ago",
  },
];

/**
 * The mock chat data the Agent and Admin screens still run on.
 *
 * Reshaped rather than deleted: the Customer's inbox and thread read the API as
 * of #28, and the staff screens follow in #32. Until then this stands in for
 * what the API would send *them* — the staff-facing payload, with an assignee,
 * a customer, a support status and named senders — so the screens reading it are
 * already reading the shape they will keep.
 */

export const LABELS: Label[] = [
  { id: 'label-urgent', name: 'Urgent', color: 'red', archived: false },
  { id: 'label-billing', name: 'Billing', color: 'blue', archived: false },
  { id: 'label-resolved', name: 'Resolved', color: 'green', archived: false },
]

const ORG_ID = 'org-mock'

function personRef(id: string): { id: string; name: string; role: UserRole } {
  const person = PEOPLE.find((candidate) => candidate.id === id)
  if (!person) throw new Error(`No mock person ${id}`)
  return { id: person.id, name: person.displayName, role: person.role }
}

export const CONVERSATIONS: StaffConversation[] = [
  {
    id: 'conv-assigned',
    organizationId: ORG_ID,
    type: 'support_dm',
    status: 'engaged',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'customer-1', name: 'Luis Ferreira', isOnline: false },
    assignedAgent: { id: 'agent-1', name: 'Jonah Reed', isOnline: true },
    otherUser: null,
    members: [],
    labels: [LABELS[0]!],
    lastMessageAt: '2026-08-13T08:22:00.000Z',
    lastMessagePreview: 'Voice note',
    lastMessageMine: true,
    lastMessageReceiptStatus: 'delivered',
    lastMessageRead: true,
    unreadCount: 2,
  },
  {
    id: 'conv-unassigned',
    organizationId: ORG_ID,
    type: 'support_dm',
    status: 'unassigned',
    title: null,
    description: null,
    avatarUrl: null,
    customer: { id: 'customer-2', name: 'Elena Voss', isOnline: true },
    assignedAgent: null,
    otherUser: null,
    members: [],
    labels: [LABELS[1]!],
    lastMessageAt: '2026-08-13T09:40:00.000Z',
    lastMessagePreview: 'The March invoice does not match our PO.',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 1,
  },
  {
    id: 'conv-group',
    organizationId: ORG_ID,
    type: 'group',
    status: null,
    title: 'Warehouse onboarding',
    description: null,
    avatarUrl: null,
    customer: null,
    assignedAgent: null,
    otherUser: null,
    members: [personRef('customer-1'), personRef('customer-2'), personRef('agent-1')],
    labels: [LABELS[2]!],
    lastMessageAt: '2026-08-12T16:05:00.000Z',
    lastMessagePreview: 'Sharing the access checklist here.',
    lastMessageMine: true,
    lastMessageReceiptStatus: 'read',
    lastMessageRead: true,
    unreadCount: 0,
  },
  {
    id: 'offers',
    organizationId: ORG_ID,
    type: 'group',
    status: null,
    title: 'Offers',
    description: null,
    avatarUrl: null,
    customer: null,
    assignedAgent: null,
    otherUser: null,
    members: [
      personRef('customer-1'),
      personRef('customer-2'),
      personRef('agent-1'),
      personRef('agent-2'),
      personRef('admin-1'),
    ],
    labels: [],
    lastMessageAt: '2026-08-13T10:00:00.000Z',
    lastMessagePreview: 'This week’s offers are live.',
    lastMessageMine: false,
    lastMessageReceiptStatus: null,
    lastMessageRead: false,
    unreadCount: 3,
  },
]

function staffMessage(
  id: string,
  senderId: string,
  createdAt: string,
  body: string,
  extra: Partial<StaffMessage> = {},
): StaffMessage {
  return {
    id,
    body,
    messageType: extra.attachments?.length ? 'media' : 'text',
    createdAt,
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'read',
    sender: personRef(senderId),
    ...extra,
  }
}

/** Keyed by conversation: a message payload carries no conversation id of its own. */
export const MESSAGES: Record<string, StaffMessage[]> = {
  'conv-assigned': [
    staffMessage('msg-1', 'customer-1', '2026-08-13T08:00:00.000Z', 'Hi, the reset link never arrives 😕', {
      reactions: [{ emoji: '👍', userId: 'agent-1' }],
    }),
    staffMessage('msg-2', 'agent-1', '2026-08-13T08:06:00.000Z', 'Checking the mail logs now.', {
      reactions: [{ emoji: '👍', userId: 'customer-1' }],
    }),
    staffMessage('msg-3', 'customer-1', '2026-08-13T08:12:00.000Z', 'Still stuck on the email step 📧'),
    staffMessage('msg-8', 'agent-1', '2026-08-13T08:14:00.000Z', 'Try the link I just resent ✅', {
      reactions: [{ emoji: '❤️', userId: 'customer-1' }],
    }),
    staffMessage('msg-9', 'customer-1', '2026-08-13T08:16:00.000Z', 'Got it, thanks! 🙏', {
      receiptStatus: 'delivered',
      replyTo: { id: 'msg-8', preview: 'Try the link I just resent ✅' },
      reactions: [{ emoji: '👍', userId: 'agent-1' }],
    }),
    staffMessage(
      'msg-10',
      'customer-1',
      '2026-08-13T08:18:00.000Z',
      'One more thing — can you confirm the code? 🔑',
      { receiptStatus: 'sent', replyTo: { id: 'msg-9', preview: 'Got it, thanks! 🙏' } },
    ),
    staffMessage('msg-11', 'agent-1', '2026-08-13T08:19:00.000Z', '', {
      attachments: [
        {
          type: 'image/png',
          url: DEMO_PHOTO_URI,
          fileName: 'reset-hint.png',
          size: 48_000,
          durationSeconds: null,
          waveform: null,
        },
      ],
    }),
    staffMessage('msg-11b', 'customer-1', '2026-08-13T08:19:30.000Z', 'Looks good — thanks!', {
      receiptStatus: 'delivered',
      replyTo: { id: 'msg-11', preview: 'Photo' },
    }),
    staffMessage('msg-12', 'customer-1', '2026-08-13T08:20:00.000Z', 'That matches what I see', {
      receiptStatus: 'delivered',
      replyTo: { id: 'msg-11', preview: 'Photo' },
      attachments: [
        {
          type: 'image/png',
          url: DEMO_PHOTO_2_URI,
          fileName: 'my-screen.png',
          size: 52_000,
          durationSeconds: null,
          waveform: null,
        },
      ],
    }),
    staffMessage('msg-12b', 'agent-1', '2026-08-13T08:21:00.000Z', 'Perfect, that confirms it', {
      receiptStatus: 'delivered',
      replyTo: { id: 'msg-12', preview: 'Photo · That matches what I see' },
    }),
    staffMessage('msg-13', 'agent-1', '2026-08-13T08:22:00.000Z', '', {
      messageType: 'voice',
      receiptStatus: 'delivered',
      attachments: [
        {
          type: 'audio/wav',
          url: DEMO_VOICE_URI,
          fileName: 'voice-note-demo.wav',
          size: 16_000,
          durationSeconds: 1,
          waveform: DEMO_VOICE_PEAKS,
        },
      ],
    }),
  ],
  'conv-unassigned': [
    staffMessage(
      'msg-4',
      'customer-2',
      '2026-08-13T09:40:00.000Z',
      'The March invoice does not match our PO 📄',
      { receiptStatus: 'sent' },
    ),
  ],
  'conv-group': [
    staffMessage('msg-5', 'agent-1', '2026-08-12T16:05:00.000Z', 'Sharing the access checklist here 📋'),
  ],
  offers: [
    staffMessage('msg-6', 'admin-1', '2026-08-13T10:00:00.000Z', 'This week’s offers are live 🎉', {
      receiptStatus: 'sent',
      reactions: [
        { emoji: '🎉', userId: 'customer-1' },
        { emoji: '👍', userId: 'customer-2' },
        { emoji: '👍', userId: 'agent-1' },
      ],
    }),
    staffMessage('msg-7', 'admin-1', '2026-08-13T10:02:00.000Z', 'Zero-fee payouts run through Friday 💸', {
      receiptStatus: 'sent',
      replyTo: { id: 'msg-6', preview: 'This week’s offers are live 🎉' },
    }),
  ],
}

export const INTERNAL_NOTES: InternalNote[] = [
  {
    id: "note-1",
    conversationId: "conv-assigned",
    authorId: "agent-1",
    body: "Possible typo in the contact email on file.",
    createdAt: "2026-08-13T08:08:00.000Z",
  },
];

export const OFFERS: Offer[] = [
  {
    id: "offer-payouts",
    title: "Faster payouts this week",
    subtitle: "Get paid up to 2 days earlier. Limited time only.",
    ctaLabel: "View offer",
    visual: "payouts",
    chatId: "offers",
  },
  {
    id: "offer-zero-fee",
    title: "Zero-fee internal transfers",
    subtitle: "Send and receive money instantly. No fees.",
    ctaLabel: "View offer",
    visual: "zero-fee",
    chatId: "offers",
  },
  {
    id: "offer-verify",
    title: "ID Verification bonus",
    subtitle: "Verify your ID and bonus credit.",
    ctaLabel: "View offer",
    visual: "verify",
    chatId: "offers",
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "faq-reset",
    question: "How do I reset my password?",
    answer:
      "Open Messages and start a thread with Support. An agent will send a reset link.",
  },
  {
    id: "faq-hours",
    question: "What are support hours?",
    answer:
      "Agents are online 08:00–20:00 local time on weekdays. Offers chat is always open.",
  },
  {
    id: "faq-offers",
    question: "What are Offers?",
    answer:
      "In-app promos from Support. Tap Join Offers chat to read this week’s announcements.",
  },
  {
    id: "faq-billing",
    question: "How do I update billing details?",
    answer:
      "Message Support with the last four digits of the invoice. An agent will send a secure billing form. Do not paste card numbers in chat.",
  },
  {
    id: "faq-access",
    question: "How do I get access for a teammate?",
    answer:
      "Ask an Admin to invite them from Users. Agents cannot create accounts. Until then they can sit in Offers chat as a customer.",
  },
  {
    id: "faq-attach",
    question: "Can I attach screenshots or templates?",
    answer:
      "Yes. Tap the + icon in the message composer to open the attachment menu, insert quick templates, or select media items.",
  },
  {
    id: "faq-lock",
    question: "Why is my account locked?",
    answer:
      "Too many failed sign-in attempts. Open Messages and an agent can unlock after they verify you.",
  },
];

export const KNOWLEDGE: KnowledgeArticle[] = [
  {
    id: "kb-reset",
    title: "Password reset script",
    tags: ["password", "access"],
    body: "1. Confirm the email on file.\n2. Send a reset link from Messages.\n3. Ask them to check spam.\n4. If it still fails, unlock after verifying last invoice digits.",
  },
  {
    id: "kb-billing",
    title: "Billing update script",
    tags: ["billing"],
    body: "Ask for the last four digits of the invoice only. Send the secure billing form. Never collect full card numbers in chat. Note the thread id in the reply.",
  },
  {
    id: "kb-unlock",
    title: "Unlock checklist",
    tags: ["access", "security"],
    body: "Confirm display name + last invoice. Check failed sign-in count. Unlock after verification. Tell them to change password immediately.",
  },
  {
    id: "kb-access",
    title: "Teammate access",
    tags: ["access", "admin"],
    body: "Agents cannot create accounts. Ask an Admin to invite from Users. Until then they can sit in Offers chat as a customer.",
  },
  {
    id: "kb-offers",
    title: "Offers announcement template",
    tags: ["offers"],
    body: "This week’s offers are live in Offers chat. Tap Join Offers chat on Home. Sponsored is a label — not checkout.",
  },
];

