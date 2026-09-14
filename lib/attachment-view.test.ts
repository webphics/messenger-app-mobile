import {
  attachmentKindFromType,
  attachmentViews,
  primaryAttachmentView,
  resolveAttachmentUrl,
  toAttachmentView,
  toMessageAttachment,
  toWallAttachmentView,
} from '@/lib/attachment-view'
import type { MessageAttachment } from '@/lib/types'

const BASE = 'http://10.0.2.2:8080'

function attachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    type: 'image/png',
    url: '/files/chat/photo.png',
    fileName: 'photo.png',
    size: 1024,
    durationSeconds: null,
    waveform: null,
    ...overrides,
  }
}

describe('attachmentKindFromType', () => {
  test.each([
    ['image/png', 'image'],
    ['IMAGE/JPEG', 'image'],
    ['video/mp4', 'video'],
    ['audio/m4a', 'audio'],
    ['application/pdf', 'document'],
    ['', 'document'],
    ['nonsense', 'document'],
  ])('reads %s as %s', (type, kind) => {
    expect(attachmentKindFromType(type)).toBe(kind)
  })
})

describe('resolveAttachmentUrl', () => {
  test('joins a path to the API origin', () => {
    expect(resolveAttachmentUrl('/files/a.png', BASE)).toBe(`${BASE}/files/a.png`)
  })

  test('joins a path that does not start with a slash', () => {
    expect(resolveAttachmentUrl('files/a.png', BASE)).toBe(`${BASE}/files/a.png`)
  })

  test('leaves an absolute URL alone', () => {
    expect(resolveAttachmentUrl('https://cdn.example.com/a.png', BASE)).toBe(
      'https://cdn.example.com/a.png',
    )
  })

  test('leaves a device URI alone', () => {
    expect(resolveAttachmentUrl('file:///data/a.m4a', BASE)).toBe('file:///data/a.m4a')
  })

  test('returns an empty URL unchanged rather than the bare origin', () => {
    expect(resolveAttachmentUrl('   ', BASE)).toBe('')
  })
})

describe('toAttachmentView', () => {
  test('converts kind, URI and name', () => {
    expect(toAttachmentView(attachment(), BASE)).toEqual({
      kind: 'image',
      uri: `${BASE}/files/chat/photo.png`,
      name: 'photo.png',
      size: 1024,
    })
  })

  test('converts seconds to milliseconds and keeps a waveform', () => {
    expect(
      toAttachmentView(
        attachment({
          type: 'audio/m4a',
          url: '/files/chat/note.m4a',
          fileName: null,
          durationSeconds: 12.5,
          waveform: [0.1, 0.9],
        }),
        BASE,
      ),
    ).toEqual({
      kind: 'audio',
      uri: `${BASE}/files/chat/note.m4a`,
      name: 'note.m4a',
      size: 1024,
      durationMs: 12_500,
      peaks: [0.1, 0.9],
    })
  })

  test('names an unnamed attachment from its URL', () => {
    expect(toAttachmentView(attachment({ fileName: '   ' }), BASE).name).toBe('photo.png')
  })

  test('omits a duration the API did not report rather than reporting zero', () => {
    expect(toAttachmentView(attachment(), BASE)).not.toHaveProperty('durationMs')
  })

  test('omits an empty waveform rather than drawing a flat one', () => {
    expect(toAttachmentView(attachment({ waveform: [] }), BASE)).not.toHaveProperty('peaks')
  })
})

describe('attachmentViews', () => {
  test('is empty for a message with nothing attached', () => {
    expect(attachmentViews([], BASE)).toEqual([])
  })

  /**
   * This client stages one attachment at a time, so what it sends carries one.
   * A message written on web can carry several, and every one of them has to
   * reach the bubble.
   */
  test('keeps every attachment, in the order the API sent them', () => {
    const views = attachmentViews(
      [
        attachment({ url: '/one.png' }),
        attachment({ url: '/two.png' }),
        attachment({ url: '/three.pdf', type: 'application/pdf' }),
      ],
      BASE,
    )

    expect(views.map((view) => view.uri)).toEqual([
      `${BASE}/one.png`,
      `${BASE}/two.png`,
      `${BASE}/three.pdf`,
    ])
    expect(views.map((view) => view.kind)).toEqual(['image', 'image', 'document'])
  })
})

describe('primaryAttachmentView', () => {
  test('is undefined for a message with no attachments', () => {
    expect(primaryAttachmentView([], BASE)).toBeUndefined()
  })

  /** What a quote strip and a preview line show, where there is room for one. */
  test('is the first attachment, which is the one that stands for the message', () => {
    const views = primaryAttachmentView(
      [attachment({ url: '/one.png' }), attachment({ url: '/two.png' })],
      BASE,
    )
    expect(views?.uri).toBe(`${BASE}/one.png`)
  })
})

describe('toMessageAttachment', () => {
  test.each(['image', 'video', 'audio', 'document'] as const)(
    'a %s survives the round trip back to a view',
    (kind) => {
      const view = { kind, uri: 'file:///data/thing', name: 'thing', size: 12 }
      expect(toAttachmentView(toMessageAttachment(view), BASE)).toEqual(view)
    },
  )

  test('carries a voice note duration and waveform across', () => {
    const view = {
      kind: 'audio' as const,
      uri: 'file:///data/note.m4a',
      name: 'note.m4a',
      size: null,
      durationMs: 4200,
      peaks: [0.3, 0.7],
    }
    expect(toMessageAttachment(view)).toMatchObject({
      type: 'audio/*',
      url: 'file:///data/note.m4a',
      durationSeconds: 4.2,
      waveform: [0.3, 0.7],
    })
    expect(toAttachmentView(toMessageAttachment(view), BASE)).toEqual(view)
  })
})

/**
 * Payloads copied verbatim from a running API — a message carrying two
 * attachments and a voice note — so the shapes these functions read are the
 * shapes the server actually sends rather than the ones this repo assumed.
 *
 * The one that would have been assumed wrong is `waveform`. The schema calls it
 * nullable, and a *photo* comes back with `[]` rather than `null`: an empty
 * waveform has to read as "no waveform" and not as a waveform with no bars.
 */
describe('against payloads a running API produced', () => {
  const TWO_ATTACHMENTS = [
    {
      type: 'image/png',
      url: '/uploads/chat/3627aafb-94d0-4574-ad46-ec69337e19fb.png',
      fileName: 'qa-photo.png',
      size: 80,
      durationSeconds: null,
      waveform: [],
    },
    {
      type: 'application/pdf',
      url: '/uploads/chat/1baf76db-251a-4153-b9a8-7b91ec43bf93.pdf',
      fileName: 'qa-report.pdf',
      size: 191,
      durationSeconds: null,
      waveform: [],
    },
  ]

  const VOICE_NOTE = {
    type: 'audio/mp4',
    url: '/uploads/chat/0da259fc-5353-4e81-a803-919f809e51b9.m4a',
    fileName: 'qa-note.m4a',
    size: 88,
    durationSeconds: 4.5,
    waveform: [0.2, 0.8, 0.4],
  }

  test('a photo and a document on one message both render, each as itself', () => {
    expect(attachmentViews(TWO_ATTACHMENTS, BASE)).toEqual([
      {
        kind: 'image',
        uri: `${BASE}/uploads/chat/3627aafb-94d0-4574-ad46-ec69337e19fb.png`,
        name: 'qa-photo.png',
        size: 80,
      },
      {
        kind: 'document',
        uri: `${BASE}/uploads/chat/1baf76db-251a-4153-b9a8-7b91ec43bf93.pdf`,
        name: 'qa-report.pdf',
        size: 191,
      },
    ])
  })

  test('an empty waveform reads as no waveform, not as a waveform with no bars', () => {
    expect(toAttachmentView(TWO_ATTACHMENTS[0], BASE)).not.toHaveProperty('peaks')
  })

  test('a voice note arrives playable, with its bars and its length in milliseconds', () => {
    expect(toAttachmentView(VOICE_NOTE, BASE)).toEqual({
      kind: 'audio',
      uri: `${BASE}/uploads/chat/0da259fc-5353-4e81-a803-919f809e51b9.m4a`,
      name: 'qa-note.m4a',
      size: 88,
      durationMs: 4500,
      peaks: [0.2, 0.8, 0.4],
    })
  })
})

describe('toWallAttachmentView', () => {
  it('takes the API’s own kind rather than classifying a MIME type', () => {
    const view = toWallAttachmentView(
      { kind: 'document', url: '/uploads/invoice.pdf', fileName: 'Invoice.pdf', size: 90 },
      'https://api.example.com',
    )
    expect(view).toEqual({
      kind: 'document',
      uri: 'https://api.example.com/uploads/invoice.pdf',
      name: 'Invoice.pdf',
      size: 90,
    })
  })

  it('names one the API did not, off the URL it was stored under', () => {
    const view = toWallAttachmentView(
      { kind: 'image', url: '/uploads/lift.png', fileName: null, size: null },
      'https://api.example.com',
    )
    expect(view.name).toBe('lift.png')
  })

  it('leaves an absolute URL alone: an object store signs its own', () => {
    const view = toWallAttachmentView(
      { kind: 'image', url: 'https://cdn.example.com/a.png', fileName: null, size: null },
      'https://api.example.com',
    )
    expect(view.uri).toBe('https://cdn.example.com/a.png')
  })
})
