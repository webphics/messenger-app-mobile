import {
  isDeviceUri,
  isServerFileUrl,
  MAX_UPLOAD_BYTES,
  missingFilesMessage,
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

describe('uploadMimeType', () => {
  it('reads the type the API expects for each kind of file', () => {
    expect(uploadMimeType({ uri: 'file:///a.jpeg', name: 'a.jpeg' })).toBe('image/jpeg')
    expect(uploadMimeType({ uri: 'file:///a.m4a', name: 'a.m4a' })).toBe('audio/mp4')
    expect(uploadMimeType({ uri: 'file:///a.mov', name: 'a.mov' })).toBe('video/quicktime')
    expect(uploadMimeType({ uri: 'file:///a.docx', name: 'a.docx' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  })

  it('answers null for a type the API refuses', () => {
    expect(uploadMimeType({ uri: 'file:///a.svg', name: 'a.svg' })).toBeNull()
    expect(uploadMimeType({ uri: 'file:///a.heic', name: 'a.heic' })).toBeNull()
    expect(uploadMimeType({ uri: 'content://provider/9', name: 'unnamed' })).toBeNull()
  })
})

describe('rejectUploadReason', () => {
  it('names the file and the limit when it is too large', () => {
    const reason = rejectUploadReason(view({ size: MAX_UPLOAD_BYTES + 1 }))
    expect(reason).toContain('IMG_0001.jpg')
    expect(reason).toContain('15 MB')
  })

  it('accepts a file exactly at the limit', () => {
    expect(rejectUploadReason(view({ size: MAX_UPLOAD_BYTES }))).toBeNull()
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

})

describe('isServerFileUrl', () => {
  it('is true for an origin-free path or an http(s) URL', () => {
    expect(isServerFileUrl('/uploads/chat/a.jpg')).toBe(true)
    expect(isServerFileUrl('https://cdn.example/uploads/chat/a.jpg')).toBe(true)
    expect(isServerFileUrl('http://10.0.2.2:4000/uploads/chat/a.jpg')).toBe(true)
  })

  it('is false for a device URI, a protocol-relative URL, or any other scheme', () => {
    expect(isServerFileUrl('file:///data/user/0/com.thechatroute.app/files/SQLite/x.db')).toBe(false)
    expect(isServerFileUrl('content://media/external/images/media/42')).toBe(false)
    expect(isServerFileUrl('//evil.example/a.jpg')).toBe(false)
    expect(isServerFileUrl('intent://scan#Intent;end')).toBe(false)
    expect(isServerFileUrl('')).toBe(false)
  })

  it('is true for a path with no leading slash, which resolves against the API', () => {
    expect(isServerFileUrl('uploads/chat/a.jpg')).toBe(true)
  })
})

describe('sendMessageType', () => {
  it('is voice for one voice note on its own', () => {
    expect(sendMessageType(['audio'])).toBe('voice')
  })

  it('is media for anything else, including a voice note with company', () => {
    expect(sendMessageType(['image'])).toBe('media')
    expect(sendMessageType(['document'])).toBe('media')
    expect(sendMessageType(['audio', 'image'])).toBe('media')
  })
})

/** Only the name matters to the sentence; the rest is what a picker happens to report. */
function named(name: string): Pick<AttachmentView, 'name'> {
  return { name }
}

describe('missingFilesMessage', () => {
  /**
   * A list missing one of its subjects reads as a complete list, and somebody
   * acting on it would replace the wrong file. So one nameless file makes the
   * whole sentence describe rather than name.
   */
  it('names none of them when one of them has no name', () => {
    expect(
      missingFilesMessage([named('one.jpg'), named('  ')]),
    ).toBe(
      'The files on this message are no longer on this device. Attach them again to send this message.',
    )
  })
})
