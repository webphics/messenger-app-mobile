import { attachmentFromAsset } from '@/lib/attachments'

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
