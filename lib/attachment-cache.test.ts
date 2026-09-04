import { cacheKey, cachedFileName, ensureCachedFile } from '@/lib/attachment-cache'

const mockExists = { directory: true, file: false }
const mockCreated: string[] = []
const mockDownloaded: { url: string; name: string; idempotent: boolean }[] = []
const mockMoved: { from: string; to: string }[] = []
let mockDownloadFails = false

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  Directory: class {
    segments: string[]
    constructor(..._segments: unknown[]) {
      this.segments = _segments.slice(1).map(String)
    }
    get exists() {
      return mockExists.directory
    }
    create() {
      mockCreated.push(this.uri)
    }
    get uri() {
      return `file:///cache/${this.segments.join('/')}/`
    }
  },
  File: class {
    directory: { uri: string }
    name: string
    constructor(directory: { uri: string }, name: string) {
      this.directory = directory
      this.name = name
    }
    get exists() {
      // Only the finished name is ever a hit; a `.part` file is what a failed
      // download leaves behind, and the code under test must never read one.
      return mockExists.file && !this.name.endsWith('.part')
    }
    get uri() {
      return `${this.directory.uri}${this.name}`
    }
    async move(destination: { name: string }) {
      mockMoved.push({ from: this.name, to: destination.name })
    }
    static async downloadFileAsync(
      url: string,
      destination: { name: string; uri: string },
      options?: { idempotent?: boolean },
    ) {
      if (mockDownloadFails) throw new Error('Network request failed')
      mockDownloaded.push({ url, name: destination.name, idempotent: !!options?.idempotent })
      return destination
    }
  },
}))

beforeEach(() => {
  mockExists.directory = true
  mockExists.file = false
  mockCreated.length = 0
  mockDownloaded.length = 0
  mockMoved.length = 0
  mockDownloadFails = false
})

describe('cacheKey', () => {
  it('is the last path segment, which the API already made unique', () => {
    expect(cacheKey('/uploads/chat/9f1c-4a2b.jpg')).toBe('9f1c-4a2b.jpg')
  })

  it('drops a query string, so a signed URL still names one object', () => {
    expect(cacheKey('https://store.example/a/b.pdf?X-Amz-Signature=deadbeef')).toBe('b.pdf')
  })

  it('replaces anything a path segment may not hold', () => {
    expect(cacheKey('https://x/a%20b%2Fc.pdf')).toBe('a_b_c.pdf')
  })

  it('falls back rather than answering with nothing', () => {
    expect(cacheKey('https://example.com/')).toBe('attachment')
  })

  it('does not answer with a name that would hide the directory', () => {
    expect(cacheKey('https://x/...')).toBe('attachment')
  })
})

describe('cachedFileName', () => {
  /**
   * The name is what the next app to receive the file shows the person. The
   * object's own name is a UUID, and uniqueness is the directory's job.
   */
  it('is the name the attachment carries, not the one the API stored it under', () => {
    expect(cachedFileName('/uploads/chat/9f1c-4a2b.pdf', 'Invoice March.pdf')).toBe(
      'Invoice_March.pdf',
    )
  })

  it('falls back to the stored name when the attachment carries none', () => {
    expect(cachedFileName('/uploads/chat/9f1c-4a2b.pdf', null)).toBe('9f1c-4a2b.pdf')
    expect(cachedFileName('/uploads/chat/9f1c-4a2b.pdf', '   ')).toBe('9f1c-4a2b.pdf')
  })

  it('falls back rather than letting a name of only punctuation hide the file', () => {
    expect(cachedFileName('/uploads/chat/9f1c.pdf', '../..')).toBe('9f1c.pdf')
  })
})

describe('ensureCachedFile', () => {
  /**
   * The download lands under a partial name and is moved into place afterwards.
   * On Android the response streams straight into its destination, so writing
   * to the final name directly would leave a truncated file there whenever a
   * download died halfway — and the hit above would serve it forever.
   */
  it('downloads to a partial name and moves it into place once it is whole', async () => {
    const result = await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'Report.pdf')

    expect(mockDownloaded).toEqual([
      { url: 'https://api.example/uploads/chat/a.pdf', name: 'Report.pdf.part', idempotent: true },
    ])
    expect(mockMoved).toEqual([{ from: 'Report.pdf.part', to: 'Report.pdf' }])
    expect(result).toEqual({ ok: true, uri: 'file:///cache/attachments/a.pdf/Report.pdf' })
  })

  it('answers with the file it already holds, without downloading it again', async () => {
    mockExists.file = true

    const result = await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'Report.pdf')

    expect(mockDownloaded).toHaveLength(0)
    expect(mockMoved).toHaveLength(0)
    expect(result).toEqual({ ok: true, uri: 'file:///cache/attachments/a.pdf/Report.pdf' })
  })

  /**
   * Two people can send a file called `Invoice.pdf`. The directory is named for
   * the stored object, so the two never collide however alike their names.
   */
  it('keeps two files of the same name apart, by the object each came from', async () => {
    await ensureCachedFile('https://api.example/uploads/chat/one.pdf', 'Invoice.pdf')
    await ensureCachedFile('https://api.example/uploads/chat/two.pdf', 'Invoice.pdf')

    expect(mockDownloaded).toHaveLength(2)
  })

  it('creates the cache directory when the system has reclaimed it', async () => {
    mockExists.directory = false

    await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'Report.pdf')

    expect(mockCreated).toEqual(['file:///cache/attachments/a.pdf/'])
  })

  /**
   * The attachment on an outgoing bubble is the file the picker produced, and it
   * is local for as long as the upload is in flight. Fetching it back from the
   * server would be fetching a copy of something already in hand.
   */
  it('answers a device URI with itself, and downloads nothing', async () => {
    const result = await ensureCachedFile('file:///data/user/0/cache/a.pdf', 'a.pdf')

    expect(mockDownloaded).toHaveLength(0)
    expect(result).toEqual({ ok: true, uri: 'file:///data/user/0/cache/a.pdf' })
  })

  it('reports a download that failed rather than throwing out of the tap that started it', async () => {
    mockDownloadFails = true

    expect(await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'a.pdf')).toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })
})
