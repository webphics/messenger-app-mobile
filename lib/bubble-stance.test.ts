import { messageStance, namesItsSender } from '@/lib/bubble-stance'
import type { Message, UserRole } from '@/lib/types'

const BASE = {
  body: 'hi',
  messageType: 'text' as const,
  createdAt: '2026-08-13T09:00:00.000Z',
  editedAt: null,
  editableUntil: null,
  replyTo: null,
  reactions: [],
  attachments: [],
  receiptStatus: 'sent' as const,
}

function from(id: string, role: UserRole): Message {
  return { ...BASE, id: `m-${id}`, sender: { id, name: id, role } }
}

function customerCopy(fromCompany: boolean): Message {
  return { ...BASE, id: 'c', fromCompany }
}

const AGENT = { id: 'me', role: 'agent' as const }
const CUSTOMER = { id: 'cust', role: 'customer' as const }

describe('messageStance', () => {
  test.each([
    ['own message', from('me', 'agent'), AGENT, 'support_dm', 'end', 'mine'],
    ['colleague in a Support DM', from('ann', 'agent'), AGENT, 'support_dm', 'end', 'colleague'],
    ['admin in a Support DM', from('boss', 'admin'), AGENT, 'support_dm', 'end', 'colleague'],
    ['customer in a Support DM', from('cust', 'customer'), AGENT, 'support_dm', 'start', 'incoming'],
    ['colleague in a group', from('ann', 'agent'), AGENT, 'group', 'start', 'incoming'],
    ['colleague in a Staff DM', from('ann', 'agent'), AGENT, 'staff_dm', 'start', 'incoming'],
    ['staff, read by a customer in a group', from('ann', 'agent'), CUSTOMER, 'group', 'start', 'incoming'],
    ["customer's own copy", customerCopy(false), CUSTOMER, 'support_dm', 'end', 'mine'],
    ["company, in a customer's copy", customerCopy(true), CUSTOMER, 'support_dm', 'start', 'incoming'],
  ] as const)('%s', (_, message, viewer, type, side, variant) => {
    const stance = messageStance(message, viewer, type)
    expect([stance.side, stance.variant]).toEqual([side, variant])
  })
})

describe('namesItsSender', () => {
  test('never the viewer, always a colleague, everyone in a group', () => {
    const mine = messageStance(from('me', 'agent'), AGENT, 'group')
    const colleague = messageStance(from('ann', 'agent'), AGENT, 'support_dm')
    const customer = messageStance(from('cust', 'customer'), AGENT, 'support_dm')
    const member = messageStance(from('ann', 'agent'), AGENT, 'group')

    expect(namesItsSender(mine, 'group')).toBe(false)
    expect(namesItsSender(colleague, 'support_dm')).toBe(true)
    expect(namesItsSender(customer, 'support_dm')).toBe(false)
    expect(namesItsSender(member, 'group')).toBe(true)
  })
})
