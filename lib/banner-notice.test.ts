import { bannerNotice, type BannerInput } from '@/lib/banner-notice'
import type { CustomerMessage, StaffMessage } from '@/lib/types'

const SHARED = {
  id: 'msg_01',
  body: 'Are you still there?',
  messageType: 'text',
  createdAt: '2026-08-13T08:00:00.000Z',
  editedAt: null,
  editableUntil: null,
  replyTo: null,
  reactions: [],
  attachments: [],
  receiptStatus: 'sent',
} satisfies Omit<CustomerMessage, 'fromCompany'>

/** What a Customer receives: the company speaks as one voice and names nobody. */
function fromCompany(overrides: Partial<CustomerMessage> = {}): CustomerMessage {
  return { ...SHARED, fromCompany: true, ...overrides }
}

/** What Staff receive, and what anybody receives in a group: a named sender. */
function fromStaff(overrides: Partial<StaffMessage> = {}): StaffMessage {
  return {
    ...SHARED,
    sender: { id: 'agent-2', name: 'Jonah Reed', role: 'agent' },
    ...overrides,
  }
}

function arriving(overrides: Partial<BannerInput> = {}): BannerInput {
  return {
    conversationId: 'cnv_01',
    message: fromStaff(),
    viewerId: 'agent-1',
    threadOnScreen: null,
    foreground: true,
    title: 'Jonah Reed',
    ...overrides,
  }
}

describe('a message that earns a banner', () => {
  it('names whoever wrote it, and what they wrote', () => {
    expect(bannerNotice(arriving())).toEqual({
      conversationId: 'cnv_01',
      sender: 'Jonah Reed',
      preview: 'Are you still there?',
    })
  })

  // A Customer's Support DM carries no sender by design, so the thread's own name says which moved.
  it('names the conversation when the message names nobody', () => {
    expect(
      bannerNotice(
        arriving({ message: fromCompany(), viewerId: 'cust-1', title: 'Northwind' }),
      )?.sender,
    ).toBe('Northwind')
  })
})

describe('the message a banner is never drawn for', () => {
  it('is one in the thread on screen', () => {
    expect(bannerNotice(arriving({ threadOnScreen: 'cnv_01' }))).toBeNull()
  })

  it('is one that arrived while the app was not in front of anybody', () => {
    expect(bannerNotice(arriving({ foreground: false }))).toBeNull()
  })

  it('is the viewer’s own, whichever shape it arrives in', () => {
    expect(
      bannerNotice(arriving({ message: fromStaff({ sender: { id: 'agent-1', name: 'Me', role: 'agent' } }) })),
    ).toBeNull()
    expect(
      bannerNotice(
        arriving({ message: fromCompany({ fromCompany: false }), viewerId: 'cust-1' }),
      ),
    ).toBeNull()
  })

  it('is a System notice', () => {
    expect(bannerNotice(arriving({ message: fromStaff({ messageType: 'system' }) }))).toBeNull()
  })
})
