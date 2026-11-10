import { attachmentFromAsset, attachmentFromPastedImage } from '@/lib/attachments'

/**
 * The seam between the picker's asset and this app's attachment. What is
 * checked here is the units: the picker reports duration in milliseconds and
 * this app holds milliseconds, and a conversion between the two — which is what
 * used to be here — is a mistake nothing on screen could reveal.
 */
describe('attachmentFromAsset', () => {
  function asset(overrides: Record<string, unknown> = {}) {
    return {
      uri: 'file:///cache/ImagePicker/9a2f.jpeg',
      assetId: null,
      width: 1200,
      height: 800,
      type: 'image',
      fileName: 'qa-photo.jpg',
      fileSize: 20_420,
      ...overrides,
    } as never
  }

  test('a video keeps the milliseconds the picker reported, unconverted', () => {
    const video = attachmentFromAsset(
      asset({ type: 'video', fileName: 'qa-clip.mp4', duration: 5023 }),
    )

    expect(video.kind).toBe('video')
    expect(video.durationMs).toBe(5023)
  })

  test('a photo has no duration, whatever the picker put there', () => {
    expect(attachmentFromAsset(asset({ duration: 5023 })).durationMs).toBeUndefined()
  })
})

describe('attachmentFromPastedImage', () => {
  test('is an image named after the file the paste wrote', () => {
    expect(
      attachmentFromPastedImage('file:///data/user/0/com.thechatroute.app/cache/1731200000000_0.png'),
    ).toEqual({
      uri: 'file:///data/user/0/com.thechatroute.app/cache/1731200000000_0.png',
      name: '1731200000000_0.png',
      size: null,
      kind: 'image',
    })
  })

  test('falls back to a name when the URI ends in a slash', () => {
    expect(attachmentFromPastedImage('file:///cache/').name).toBe('pasted-image.jpg')
  })
})
