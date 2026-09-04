import {
  attachmentFromAsset,
  classifyPermissionOutcome,
  fileNameFromUri,
  formatBytes,
} from '@/lib/attachments'

describe('classifyPermissionOutcome', () => {
  test('granted proceeds', () => {
    expect(classifyPermissionOutcome({ granted: true, canAskAgain: true })).toBe(
      'proceed',
    )
    expect(
      classifyPermissionOutcome({ granted: true, canAskAgain: false }),
    ).toBe('proceed')
  })

  test('denied but askable stays askable', () => {
    expect(
      classifyPermissionOutcome({ granted: false, canAskAgain: true }),
    ).toBe('denied-askable')
  })

  test('denied and cannot ask again needs Settings', () => {
    expect(
      classifyPermissionOutcome({ granted: false, canAskAgain: false }),
    ).toBe('denied-settings')
  })
})

describe('formatBytes', () => {
  test('bytes below a kilobyte stay raw', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  test('one decimal below ten units', () => {
    expect(formatBytes(1_500_000)).toBe('1.4 MB')
  })

  test('no decimal at ten units or more', () => {
    expect(formatBytes(12_600_000)).toBe('12 MB')
  })

  test('missing size is null, not zero', () => {
    expect(formatBytes(null)).toBeNull()
    expect(formatBytes(undefined)).toBeNull()
  })
})

describe('fileNameFromUri', () => {
  test('takes the last path segment', () => {
    expect(fileNameFromUri('file:///tmp/abc/receipt.pdf', 'document')).toBe(
      'receipt.pdf',
    )
  })

  test('drops the query string', () => {
    expect(fileNameFromUri('file:///tmp/shot.jpg?width=90', 'image.jpg')).toBe(
      'shot.jpg',
    )
  })

  test('falls back when the uri ends in a slash', () => {
    expect(fileNameFromUri('file:///tmp/', 'document')).toBe('document')
  })
})

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

  test('a photo carries its name, its size and its natural dimensions', () => {
    expect(attachmentFromAsset(asset())).toEqual({
      kind: 'image',
      uri: 'file:///cache/ImagePicker/9a2f.jpeg',
      name: 'qa-photo.jpg',
      size: 20_420,
      durationMs: undefined,
      width: 1200,
      height: 800,
    })
  })

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

  test('an asset the platform did not name falls back to its URI', () => {
    expect(attachmentFromAsset(asset({ fileName: null })).name).toBe('9a2f.jpeg')
  })

  test('a size the platform did not measure is null rather than zero', () => {
    expect(attachmentFromAsset(asset({ fileSize: null })).size).toBeNull()
  })
})
