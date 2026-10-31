import { messageModeration } from '@/lib/message-moderation'
import type { CustomerMessage, StaffMessage } from '@/lib/types'

const base = {
  body: 'hello',
  messageType: 'text' as const,
  createdAt: '2026-10-31T10:00:00.000Z',
  editedAt: null,
  editableUntil: null,
  replyTo: null,
  reactions: [],
  attachments: [],
  receiptStatus: 'sent' as const,
}

const fromMallory: StaffMessage = {
  ...base,
  id: 'msg-1',
  sender: { id: 'mallory', name: 'Mallory', role: 'customer' },
}

describe('Report and Block on a Message', () => {
  it('offers both on somebody else’s message that names them', () => {
    expect(messageModeration(fromMallory, 'me')).toEqual({
      report: true,
      block: { id: 'mallory', name: 'Mallory' },
    })
  })

  it.each([
    ['the reader’s own', fromMallory, 'mallory'],
    ['one still being carried', { ...fromMallory, id: 'local-1' }, 'me'],
    ['a System notice', { ...fromMallory, messageType: 'system' as const }, 'me'],
  ])('offers nothing on %s', (_, message, viewerId) => {
    expect(messageModeration(message, viewerId)).toEqual({ report: false, block: null })
  })

  it('lets a Customer report Staff shown as the company in a group, with nobody to block', () => {
    const company: StaffMessage = {
      ...fromMallory,
      sender: { id: 'company:org-1', name: 'Acme', role: 'agent' },
    }
    expect(messageModeration(company, 'me')).toEqual({ report: true, block: null })
  })

  it('lets a Customer report a reply in their Support DM, with nobody to block', () => {
    const reply: CustomerMessage = { ...base, id: 'msg-2', fromCompany: true }
    expect(messageModeration(reply, 'me')).toEqual({ report: true, block: null })
  })
})
