import {
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
