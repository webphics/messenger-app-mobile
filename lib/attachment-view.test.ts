import { toAttachmentView } from '@/lib/attachment-view'
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

describe('toAttachmentView', () => {
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

  test('an empty waveform reads as no waveform, not as a waveform with no bars', () => {
    expect(toAttachmentView(TWO_ATTACHMENTS[0], BASE)).not.toHaveProperty('peaks')
  })
})
