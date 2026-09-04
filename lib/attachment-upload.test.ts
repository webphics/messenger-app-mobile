import {
  fileExtension,
  isDeviceUri,
  MAX_UPLOAD_BYTES,
  rejectUploadReason,
  sendMessageType,
  UNSUPPORTED_TYPE_MESSAGE,
  uploadMimeType,
} from '@/lib/attachment-upload'
import type { AttachmentView } from '@/lib/types'

function view(overrides: Partial<AttachmentView> = {}): AttachmentView {
  return {
    kind: 'image',
    uri: 'file:///data/user/0/cache/IMG_0001.jpg',
    name: 'IMG_0001.jpg',
    size: 1024,
    ...overrides,
  }
}

describe('fileExtension', () => {
  it('reads the extension of a plain name', () => {
    expect(fileExtension('report.PDF')).toBe('pdf')
  })

  it('ignores a query string and a fragment', () => {
    expect(fileExtension('https://cdn.example/a/b.png?v=2#top')).toBe('png')
  })

  it('is empty for a name with no extension', () => {
    expect(fileExtension('README')).toBe('')
  })

  it('is empty for a dotfile, which has no extension', () => {
    expect(fileExtension('.gitignore')).toBe('')
  })

  it('ignores a dot in a directory above the file', () => {
    expect(fileExtension('file:///a.b/c')).toBe('')
  })
})

describe('uploadMimeType', () => {
  it('reads the type the API expects for each kind of file', () => {
    expect(uploadMimeType({ uri: 'file:///a.jpeg', name: 'a.jpeg' })).toBe('image/jpeg')
    expect(uploadMimeType({ uri: 'file:///a.m4a', name: 'a.m4a' })).toBe('audio/mp4')
    expect(uploadMimeType({ uri: 'file:///a.mov', name: 'a.mov' })).toBe('video/quicktime')
    expect(uploadMimeType({ uri: 'file:///a.docx', name: 'a.docx' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('prefers the name, which is what the person chose', () => {
    expect(uploadMimeType({ uri: 'content://provider/2318', name: 'quarterly.pdf' })).toBe(
      'application/pdf',
    )
  })

  it('falls back to the URI when the name carries no extension', () => {
    expect(uploadMimeType({ uri: 'file:///cache/recording.m4a', name: 'Voice note' })).toBe(
      'audio/mp4',
    )
  })

  it('answers null for a type the API refuses', () => {
    expect(uploadMimeType({ uri: 'file:///a.svg', name: 'a.svg' })).toBeNull()
    expect(uploadMimeType({ uri: 'file:///a.heic', name: 'a.heic' })).toBeNull()
    expect(uploadMimeType({ uri: 'content://provider/9', name: 'unnamed' })).toBeNull()
  })
})

describe('rejectUploadReason', () => {
  it('passes an ordinary file', () => {
    expect(rejectUploadReason(view())).toBeNull()
  })

  it('names the file and the limit when it is too large', () => {
    const reason = rejectUploadReason(view({ size: MAX_UPLOAD_BYTES + 1 }))
    expect(reason).toContain('IMG_0001.jpg')
    expect(reason).toContain('15 MB')
  })

  it('accepts a file exactly at the limit', () => {
    expect(rejectUploadReason(view({ size: MAX_UPLOAD_BYTES }))).toBeNull()
  })

  it('does not invent a size for a file the platform did not measure', () => {
    expect(rejectUploadReason(view({ size: null, name: 'clip.m4a', kind: 'audio' }))).toBeNull()
  })

  it('refuses a type the API does not take', () => {
    expect(rejectUploadReason(view({ name: 'logo.svg', uri: 'file:///logo.svg' }))).toBe(
      UNSUPPORTED_TYPE_MESSAGE,
    )
  })

  it('reports the size first, so a huge unsupported file names its size', () => {
    expect(
      rejectUploadReason(view({ name: 'x.svg', uri: 'file:///x.svg', size: MAX_UPLOAD_BYTES + 1 })),
    ).toContain('15 MB')
  })
})

describe('isDeviceUri', () => {
  it('is true for everything a picker or a recorder produces', () => {
    expect(isDeviceUri('file:///data/user/0/cache/a.jpg')).toBe(true)
    expect(isDeviceUri('content://media/external/images/media/42')).toBe(true)
    expect(isDeviceUri('ph://B84E8479')).toBe(true)
    expect(isDeviceUri('assets-library://asset/asset.JPG')).toBe(true)
  })

  it('is false for anything the API answered with', () => {
    expect(isDeviceUri('https://cdn.example/uploads/chat/a.jpg')).toBe(false)
    expect(isDeviceUri('http://10.0.2.2:4000/uploads/chat/a.jpg')).toBe(false)
  })

  it('is false for the origin-free path the API stores', () => {
    expect(isDeviceUri('/uploads/chat/a.jpg')).toBe(false)
  })

  it('is false for nothing at all', () => {
    expect(isDeviceUri('')).toBe(false)
    expect(isDeviceUri('   ')).toBe(false)
  })
})

describe('sendMessageType', () => {
  it('is text with nothing attached', () => {
    expect(sendMessageType([])).toBe('text')
  })

  it('is voice for one voice note on its own', () => {
    expect(sendMessageType(['audio'])).toBe('voice')
  })

  it('is media for anything else, including a voice note with company', () => {
    expect(sendMessageType(['image'])).toBe('media')
    expect(sendMessageType(['document'])).toBe('media')
    expect(sendMessageType(['audio', 'image'])).toBe('media')
  })
})
