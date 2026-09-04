import {
  galleryContents,
  galleryCount,
  galleryRows,
  GALLERY_COLUMNS,
} from '@/lib/media-gallery'
import type { Message, MessageAttachment } from '@/lib/types'

const BASE = 'https://api.test'

function attachment(over: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    type: 'image/png',
    url: '/files/a.png',
    fileName: 'a.png',
    size: 10,
    durationSeconds: null,
    waveform: null,
    ...over,
  }
}

function message(
  id: string,
  createdAt: string,
  attachments: MessageAttachment[],
  over: Partial<Message> = {},
): Message {
  return {
    id,
    body: '',
    messageType: attachments.length > 0 ? 'media' : 'text',
    createdAt,
    replyTo: null,
    reactions: [],
    attachments,
    receiptStatus: 'sent',
    fromCompany: false,
    ...over,
  } as Message
}

describe('galleryContents', () => {
  test('a thread with nothing in it fills no tab', () => {
    const contents = galleryContents([message('m1', '2026-01-01T00:00:00Z', [])], BASE)
    expect(contents).toEqual({ media: [], docs: [], voice: [], links: [] })
  })

  test('newest message first, whatever order the pages arrived in', () => {
    const contents = galleryContents(
      [
        message('old', '2026-01-01T00:00:00Z', [attachment({ url: '/files/old.png' })]),
        message('new', '2026-01-02T00:00:00Z', [attachment({ url: '/files/new.png' })]),
      ],
      BASE,
    )
    expect(contents.media.map((item) => item.attachment.uri)).toEqual([
      `${BASE}/files/new.png`,
      `${BASE}/files/old.png`,
    ])
  })

  test('every attachment on a message, in the order the payload holds them', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [
          attachment({ url: '/files/one.png' }),
          attachment({ url: '/files/two.png' }),
        ]),
      ],
      BASE,
    )
    expect(contents.media.map((item) => item.attachment.uri)).toEqual([
      `${BASE}/files/one.png`,
      `${BASE}/files/two.png`,
    ])
    expect(new Set(contents.media.map((item) => item.id)).size).toBe(2)
    expect(contents.media.every((item) => item.messageId === 'm1')).toBe(true)
    expect(contents.media[0]!.sentAt).toBe('2026-01-01T00:00:00Z')
  })

  test('a system notice contributes neither attachment nor link', () => {
    const notice = message('s1', '2026-01-01T00:00:00Z', [attachment()], {
      messageType: 'system',
      body: 'Engaged by https://example.com/x',
    })
    expect(galleryContents([notice], BASE)).toEqual({
      media: [],
      docs: [],
      voice: [],
      links: [],
    })
  })

  test('the MIME type decides which tab an attachment lands under', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [
          attachment({ type: 'image/png', url: '/files/photo.png' }),
          attachment({ type: 'video/mp4', url: '/files/clip.mp4' }),
          attachment({ type: 'audio/m4a', url: '/files/note.m4a' }),
          attachment({ type: 'application/pdf', url: '/files/spec.pdf' }),
        ]),
      ],
      BASE,
    )
    expect(contents.media).toHaveLength(2)
    expect(contents.voice).toHaveLength(1)
    expect(contents.docs).toHaveLength(1)
  })
})

describe('galleryContents links', () => {
  test('finds every URL in a body, and none in a body without one', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [], {
          body: 'see https://example.com/a and http://example.org/b',
        }),
        message('m2', '2026-01-02T00:00:00Z', [], { body: 'no link here' }),
      ],
      BASE,
    )
    expect(contents.links.map((link) => link.url)).toEqual([
      'https://example.com/a',
      'http://example.org/b',
    ])
    expect(contents.links[0]!.messageId).toBe('m1')
  })

  test('drops the punctuation a sentence leaves on the end of a URL', () => {
    const contents = galleryContents(
      [message('m1', '2026-01-01T00:00:00Z', [], { body: 'try https://example.com/a.' })],
      BASE,
    )
    expect(contents.links[0]!.url).toBe('https://example.com/a')
  })

  test('a caption on an attachment is still a body links come out of', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [attachment()], {
          body: 'from https://example.com/a',
        }),
      ],
      BASE,
    )
    expect(contents.links).toHaveLength(1)
    expect(contents.media).toHaveLength(1)
  })
})

describe('galleryRows', () => {
  const contents = galleryContents(
    [
      message('m1', '2026-01-01T00:00:00Z', [
        attachment({ url: '/files/1.png' }),
        attachment({ url: '/files/2.png' }),
        attachment({ url: '/files/3.png' }),
        attachment({ url: '/files/4.png' }),
        attachment({ type: 'video/mp4', url: '/files/clip.mp4' }),
        attachment({ type: 'audio/m4a', url: '/files/note.m4a' }),
        attachment({ type: 'application/pdf', url: '/files/spec.pdf' }),
      ], { body: 'see https://example.com/a' }),
    ],
    BASE,
  )

  test('photos and videos share the grid, in tile rows of the column count', () => {
    const rows = galleryRows(contents, 'media')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.type === 'tiles' && rows[0]!.items).toHaveLength(GALLERY_COLUMNS)
    expect(rows[1]!.type === 'tiles' && rows[1]!.items).toHaveLength(2)
  })

  test('voice notes and documents are one row each', () => {
    expect(galleryRows(contents, 'voice')).toHaveLength(1)
    expect(galleryRows(contents, 'docs')).toHaveLength(1)
    expect(galleryRows(contents, 'docs')[0]!.type).toBe('file')
  })

  test('links are their own row type', () => {
    const rows = galleryRows(contents, 'links')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.type).toBe('link')
  })

  test('an empty tab draws nothing at all', () => {
    const empty = galleryContents([message('m1', '2026-01-01T00:00:00Z', [])], BASE)
    expect(galleryRows(empty, 'media')).toEqual([])
    expect(galleryRows(empty, 'links')).toEqual([])
  })

  test('every row key is unique', () => {
    const rows = galleryRows(contents, 'media')
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
  })
})

describe('galleryCount', () => {
  test('counts what is under each tab', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [
          attachment({ url: '/files/1.png' }),
          attachment({ type: 'application/pdf', url: '/files/spec.pdf' }),
        ], { body: 'https://example.com/a' }),
      ],
      BASE,
    )
    expect(galleryCount(contents, 'media')).toBe(1)
    expect(galleryCount(contents, 'docs')).toBe(1)
    expect(galleryCount(contents, 'voice')).toBe(0)
    expect(galleryCount(contents, 'links')).toBe(1)
  })
})
