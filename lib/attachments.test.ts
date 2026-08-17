import {
  describeAttachment,
  fileNameFromUri,
  formatBytes,
  type PickedAttachment,
} from '@/lib/attachments'

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
    expect(fileNameFromUri('file:///tmp/abc/receipt.pdf', 'document')).toBe('receipt.pdf')
  })

  test('drops the query string', () => {
    expect(fileNameFromUri('file:///tmp/shot.jpg?width=90', 'image.jpg')).toBe('shot.jpg')
  })

  test('falls back when the uri ends in a slash', () => {
    expect(fileNameFromUri('file:///tmp/', 'document')).toBe('document')
  })
})

describe('describeAttachment', () => {
  const base: PickedAttachment = {
    uri: 'file:///tmp/shot.jpg',
    name: 'shot.jpg',
    size: 1_500_000,
    kind: 'image',
  }

  test('names the kind, file and size', () => {
    expect(describeAttachment(base)).toBe('[Attached image: shot.jpg · 1.4 MB]')
  })

  test('omits the size when unknown', () => {
    expect(describeAttachment({ ...base, size: null })).toBe('[Attached image: shot.jpg]')
  })

  test('documents read as documents', () => {
    expect(
      describeAttachment({ ...base, name: 'invoice.pdf', kind: 'document', size: 4096 })
    ).toBe('[Attached document: invoice.pdf · 4 KB]')
  })
})
