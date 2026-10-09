import { parseMessage } from '@/lib/conversation-parse'
import {
  adminOnlyLabel,
  invitationCardEvents,
  invitationCardLine,
  parseMessageComplaint,
  parseMessageInvitation,
} from '@/lib/message-invitation'
import { draftMessage, isMessageVisibleTo } from '@/lib/thread-state'

const CARD = {
  id: 'inv-1',
  organization: { id: 'org-1', name: 'Tech Vanguard' },
  state: 'pending',
  supportConversationId: null,
  answeredAt: null,
}

describe('parseMessageInvitation', () => {
  test('reads a pending card', () => {
    expect(parseMessageInvitation(CARD)).toEqual({
      id: 'inv-1',
      organization: { id: 'org-1', name: 'Tech Vanguard' },
      state: 'pending',
      supportConversationId: null,
      answeredAt: null,
    })
  })

  test('keeps the conversation a joined card links to', () => {
    expect(
      parseMessageInvitation({ ...CARD, state: 'joined', supportConversationId: 'c-9' })
        ?.supportConversationId,
    ).toBe('c-9')
  })

  test('reads a state it does not know as withdrawn, which offers nothing to press', () => {
    expect(parseMessageInvitation({ ...CARD, state: 'expired' })?.state).toBe('withdrawn')
  })

  test.each([
    ['no invitation id', { ...CARD, id: '' }],
    ['no organization', { ...CARD, organization: null }],
    ['not a record', 'card'],
  ])('drops a card with %s', (_case, value) => {
    expect(parseMessageInvitation(value)).toBeNull()
  })
})

describe('parseMessageComplaint', () => {
  test('reads what it is about, or the app itself', () => {
    expect(parseMessageComplaint({ organization: { id: 'o1', name: 'North' } })).toEqual({
      organization: { id: 'o1', name: 'North' },
    })
    expect(parseMessageComplaint({ organization: null })).toEqual({ organization: null })
    expect(parseMessageComplaint(null)).toBeNull()
  })
})

describe('a message carrying the General Support shapes', () => {
  const base = {
    id: 'm1',
    body: 'Tech Vanguard has invited you to join',
    messageType: 'system',
    addressedToCustomer: true,
    createdAt: '2026-10-10T00:00:00.000Z',
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    fromCompany: true,
  }

  test('parses the card, the complaint and the privacy flag when present', () => {
    const parsed = parseMessage({
      ...base,
      invitation: CARD,
      complaint: { organization: null },
      adminOnly: true,
    })
    expect(parsed?.invitation?.id).toBe('inv-1')
    expect(parsed?.complaint).toEqual({ organization: null })
    expect(parsed?.adminOnly).toBe(true)
  })

  test('leaves every field absent on a message that has none, so its shape does not change', () => {
    const parsed = parseMessage({ ...base, invitation: null, complaint: null, adminOnly: false })
    expect(parsed).not.toHaveProperty('invitation')
    expect(parsed).not.toHaveProperty('complaint')
    expect(parsed).not.toHaveProperty('adminOnly')
  })
})

describe('admin-only messages', () => {
  const complaint = { messageType: 'text' as const, adminOnly: true }

  test('are never shown to an Agent, and are shown to the Customer and Admins', () => {
    expect(isMessageVisibleTo('agent', 'support_dm', complaint)).toBe(false)
    expect(isMessageVisibleTo('customer', 'support_dm', complaint)).toBe(true)
    expect(isMessageVisibleTo('admin', 'support_dm', complaint)).toBe(true)
  })

  test('are labelled for the readers who see them', () => {
    expect(
      adminOnlyLabel({ adminOnly: true, complaint: { organization: { id: 'o', name: 'North' } } }),
    ).toBe('Complaint about North · only visible to admins')
    expect(adminOnlyLabel({ adminOnly: true, complaint: { organization: null } })).toBe(
      'Complaint · only visible to admins',
    )
    expect(adminOnlyLabel({ adminOnly: true })).toBe('Only visible to admins')
    expect(adminOnlyLabel({})).toBeNull()
  })

  test('a drafted Complaint is admin-only from the moment it is on screen', () => {
    const drafted = draftMessage({
      id: 'local-1',
      body: 'Nobody answered me',
      author: { id: 'u1', name: 'Ada', role: 'customer' },
      complaint: { organization: null },
      sentAt: '2026-10-10T00:00:00.000Z',
    })
    expect(drafted.adminOnly).toBe(true)
    expect(drafted.complaint).toEqual({ organization: null })
  })
})

describe('invitationCardEvents', () => {
  const sent = '2026-10-10T01:52:17.000Z'

  test('keeps only when it was sent while it is pending', () => {
    expect(invitationCardEvents(sent, { state: 'pending', answeredAt: null })).toEqual([
      { kind: 'invited', label: 'Invited', at: sent },
    ])
  })

  test.each([
    ['joined', 'Joined'],
    ['declined', 'Declined'],
    ['withdrawn', 'Withdrawn'],
  ] as const)('records when it was %s', (state, label) => {
    const answeredAt = '2026-10-10T01:53:32.610Z'
    expect(invitationCardEvents(sent, { state, answeredAt })).toEqual([
      { kind: 'invited', label: 'Invited', at: sent },
      { kind: state, label, at: answeredAt },
    ])
  })

  test('leaves out an answer that came with no time', () => {
    expect(invitationCardEvents(sent, { state: 'joined', answeredAt: null })).toHaveLength(1)
  })
})

describe('invitationCardLine', () => {
  test('asks the Customer, and reports to Staff', () => {
    expect(invitationCardLine('pending', true, 'North')).toBe(
      'Join to open a support conversation with North.',
    )
    expect(invitationCardLine('joined', true, 'North')).toBe('You joined North.')
    expect(invitationCardLine('pending', false, 'North')).toBe('Waiting for the customer to answer.')
    expect(invitationCardLine('declined', false, 'North')).toBe('The customer declined.')
    expect(invitationCardLine('withdrawn', true, 'North')).toBe('This invitation was withdrawn.')
  })
})
