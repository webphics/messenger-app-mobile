import {
  attachmentKindFromType,
  primaryAttachmentView,
  resolveAttachmentUrl,
  toAttachmentView,
  toMessageAttachment,
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

describe('primaryAttachmentView', () => {
  test('is undefined for a message with no attachments', () => {
    expect(primaryAttachmentView([], BASE)).toBeUndefined()
  })

  test('is the first attachment while multiple rendering is unbuilt', () => {
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
