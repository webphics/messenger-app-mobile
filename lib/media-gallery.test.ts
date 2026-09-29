import { galleryContents } from '@/lib/media-gallery'
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

  // The recorder's own `messageType`, not the MIME type, decides: the same as the web client.
  test('a voice message is voice whatever its files claim to be', () => {
    const contents = galleryContents(
      [
        message(
          'm1',
          '2026-01-01T00:00:00Z',
          [attachment({ type: 'application/octet-stream', url: '/files/note.m4a' })],
          { messageType: 'voice' },
        ),
      ],
      BASE,
    )
    expect(contents.voice).toHaveLength(1)
    expect(contents.docs).toHaveLength(0)
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

  test('links come out of any body, without the punctuation a sentence leaves on them', () => {
    const contents = galleryContents(
      [
        message('m1', '2026-01-01T00:00:00Z', [attachment()], {
          body: 'try https://example.com/a.',
        }),
      ],
      BASE,
    )
    expect(contents.links.map((link) => link.url)).toEqual(['https://example.com/a'])
    expect(contents.media).toHaveLength(1)
  })
})
