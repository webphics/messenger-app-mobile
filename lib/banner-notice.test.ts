import { bannerNotice, type BannerInput } from '@/lib/banner-notice'
import type { CustomerMessage, MessageAttachment, StaffMessage } from '@/lib/types'

const SHARED = {
  id: 'msg_01',
  body: 'Are you still there?',
  messageType: 'text',
  createdAt: '2026-08-13T08:00:00.000Z',
  editedAt: null,
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

function attachment(type: string): MessageAttachment {
  return {
    type,
    url: '/uploads/thing',
    fileName: null,
    size: null,
    durationSeconds: null,
    waveform: null,
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

  /**
   * A Customer's Support DM carries no sender by design — the company speaks as
   * one voice — so the thread's own name is what says which thread moved, which
   * is the whole job of the strip.
   */
  it('names the conversation when the message names nobody', () => {
    expect(
      bannerNotice(
        arriving({ message: fromCompany(), viewerId: 'cust-1', title: 'Northwind' }),
      )?.sender,
    ).toBe('Northwind')
  })

  it('falls back to a name of its own when there is neither', () => {
    expect(
      bannerNotice(arriving({ message: fromCompany(), viewerId: 'cust-1', title: null }))
        ?.sender,
    ).toBe('New message')
  })
})

describe('the message a banner is never drawn for', () => {
  /**
   * The bubble is already there. A strip naming it would be the app telling
   * somebody what they are reading.
   */
  it('is one in the thread on screen', () => {
    expect(bannerNotice(arriving({ threadOnScreen: 'cnv_01' }))).toBeNull()
  })

  it('is not one in some other thread, which is what the strip exists to say', () => {
    expect(bannerNotice(arriving({ threadOnScreen: 'cnv_02' }))).not.toBeNull()
  })

  /**
   * The app is behind something, so the operating system has already drawn this
   * one. A strip on the way back in is a report of the past.
   */
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

  /** The app talking about itself. Nobody is waiting to be told. */
  it('is a System notice', () => {
    expect(bannerNotice(arriving({ message: fromStaff({ messageType: 'system' }) }))).toBeNull()
  })
})

describe('a message with nothing written in it', () => {
  it.each([
    ['image/png', 'Photo'],
    ['video/mp4', 'Video'],
    ['audio/m4a', 'Voice note'],
  ])('previews a %s as %s', (type, expected) => {
    expect(
      bannerNotice(
        arriving({
          message: fromStaff({ body: '', messageType: 'media', attachments: [attachment(type)] }),
        }),
      )?.preview,
    ).toBe(expected)
  })

  it('previews the first attachment, the way a row does', () => {
    expect(
      bannerNotice(
        arriving({
          message: fromStaff({
            body: '',
            attachments: [attachment('image/png'), attachment('application/pdf')],
          }),
        }),
      )?.preview,
    ).toBe('Photo')
  })

  /**
   * A strip is still worth drawing — a Message arrived and the thread still
   * opens — and the second line is simply not there rather than filled with a
   * word invented for it.
   */
  it('has nothing to quote when it carries neither', () => {
    const notice = bannerNotice(
      arriving({ message: fromStaff({ body: '   ', attachments: [] }) }),
    )

    expect(notice).not.toBeNull()
    expect(notice?.preview).toBeNull()
  })

  /** The caption and what it captions, the way a quote strip reads. */
  it('names the attachment beside the caption', () => {
    expect(
      bannerNotice(
        arriving({
          message: fromStaff({ body: 'Here it is', attachments: [attachment('image/png')] }),
        }),
      )?.preview,
    ).toBe('Photo · Here it is')
  })

  /**
   * A document is named rather than labelled, which is what a quote strip and a
   * composer chip already do with one.
   */
  it('names a document by its file name', () => {
    expect(
      bannerNotice(
        arriving({
          message: fromStaff({
            body: '',
            attachments: [{ ...attachment('application/pdf'), fileName: 'Invoice.pdf' }],
          }),
        }),
      )?.preview,
    ).toBe('Invoice.pdf')
  })
})
