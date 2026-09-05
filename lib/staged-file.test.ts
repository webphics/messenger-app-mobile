import { missingStagedFiles } from '@/lib/staged-file'
import type { MessageAttachment } from '@/lib/types'

/**
 * A filesystem that answers one question: is there a file at this URI. Hand
 * written the way `lib/attachment-cache.test.ts` mocks the same module — what is
 * worth being sure about here is which URIs are asked about at all, and that is
 * hidden by anything that actually reads a disk.
 */
const mockFiles = new Set<string>()
const mockAsked: string[] = []
let mockThrowsFor: string | null = null

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string

    constructor(uri: string) {
      this.uri = uri
      mockAsked.push(uri)
      if (mockThrowsFor === uri) throw new Error('unsupported scheme')
    }

    get exists() {
      return mockFiles.has(this.uri)
    }
  },
}))

function attachment(url: string, fileName: string | null = 'photo.jpg'): MessageAttachment {
  return {
    type: 'image/jpeg',
    url,
    fileName,
    size: 2048,
    durationSeconds: null,
    waveform: null,
  }
}

const STAGED = 'file:///var/mobile/tmp/photo.jpg'

beforeEach(() => {
  mockFiles.clear()
  mockAsked.length = 0
  mockThrowsFor = null
})

describe('missingStagedFiles', () => {
  it('finds nothing on a message carrying nothing', () => {
    expect(missingStagedFiles([])).toEqual([])
  })

  it('says nothing about a staged file that is still there', () => {
    mockFiles.add(STAGED)

    expect(missingStagedFiles([attachment(STAGED)])).toEqual([])
  })

  /**
   * The case the Outbox creates: both pickers copy into the system cache, and
   * the system reclaims the cache. A message typed on a train can come back on
   * Thursday pointing at nothing.
   */
  it('names a staged file the system has reclaimed', () => {
    expect(missingStagedFiles([attachment(STAGED)])).toEqual([attachment(STAGED)])
  })

  it('names only the ones that have gone', () => {
    const kept = 'file:///var/mobile/tmp/kept.jpg'
    mockFiles.add(kept)

    const missing = missingStagedFiles([attachment(kept, 'kept.jpg'), attachment(STAGED)])

    expect(missing.map((one) => one.url)).toEqual([STAGED])
  })

  /**
   * An attachment the upload already answered for. It names an object in the
   * store, not a path on this phone, and there is nothing here that could read
   * it — which is what makes a partly-uploaded message safe to check.
   */
  it.each([
    ['an origin-free path the API stored', '/uploads/chat/abc.jpg'],
    ['an absolute URL an object store signed', 'https://cdn.example.com/abc.jpg'],
    ['a plain http URL', 'http://cdn.example.com/abc.jpg'],
  ])('does not read %s', (_label, url) => {
    expect(missingStagedFiles([attachment(url)])).toEqual([])
    expect(mockAsked).toEqual([])
  })

  /**
   * A provider URI names a provider rather than a path, and `File.exists` cannot
   * answer for one. Assumed present: the upload is the thing that finds out, and
   * inventing a verdict here would refuse messages whose files are fine.
   */
  it.each([
    ['an Android content URI', 'content://com.android.providers.media/1'],
    ['an iOS photo library URI', 'ph://ABC-123/L0/001'],
    ['an assets-library URI', 'assets-library://asset/asset.JPG'],
  ])('assumes %s is still there', (_label, url) => {
    expect(missingStagedFiles([attachment(url)])).toEqual([])
    expect(mockAsked).toEqual([])
  })

  it('assumes a path the platform will not answer for is still there', () => {
    mockThrowsFor = STAGED

    expect(missingStagedFiles([attachment(STAGED)])).toEqual([])
  })
})
