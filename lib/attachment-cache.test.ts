import {
  cacheKey,
  cachedFileName,
  ensureCachedFile,
  evictAttachmentFiles,
  wipeAttachmentFiles,
} from '@/lib/attachment-cache'
import { ATTACHMENT_CACHE_BUDGET_BYTES } from '@/lib/attachment-budget'

/**
 * A filesystem small enough to read, because the eviction cases are about what
 * a directory holds rather than about one flag. Files are keyed by their whole
 * URI; a directory is a URI ending in a slash.
 */
type MockEntry = { bytes: number; lastModified: number | null; text: string | null }
const mockFiles = new Map<string, MockEntry>()
const mockDirectories = new Set<string>()

const mockCreated: string[] = []
const mockDeleted: string[] = []
const mockListed: string[] = []
const mockDownloaded: { url: string; name: string; idempotent: boolean }[] = []
const mockMoved: { from: string; to: string }[] = []
let mockDownloadFails = false
/** What `File.downloadFileAsync` puts on disk, so a test can make one file big. */
let mockDownloadBytes = 1
/** Held open so a test can evict while a download is still arriving. */
let mockDownloadHold: Promise<void> | null = null
/** Which download waits on the hold, by call order. Null holds every one of them. */
let mockHoldOnlyCall: number | null = null

jest.mock('expo-file-system', () => {
  const join = (uris: unknown[]): string =>
    uris
      .map((one) => (typeof one === 'string' ? one : String((one as { uri: string }).uri)))
      .reduce((path, segment) =>
        path === '' ? segment : `${path.replace(/\/$/, '')}/${segment.replace(/^\//, '')}`,
      )

  class MockDirectory {
    uri: string
    constructor(...uris: unknown[]) {
      this.uri = `${join(uris).replace(/\/$/, '')}/`
    }
    get name() {
      return this.uri.replace(/\/$/, '').split('/').pop() ?? ''
    }
    get exists() {
      return mockDirectories.has(this.uri)
    }
    create() {
      mockDirectories.add(this.uri)
      mockCreated.push(this.uri)
    }
    delete() {
      mockDeleted.push(this.uri)
      for (const uri of [...mockDirectories]) if (uri.startsWith(this.uri)) mockDirectories.delete(uri)
      for (const uri of [...mockFiles.keys()]) if (uri.startsWith(this.uri)) mockFiles.delete(uri)
    }
    list() {
      mockListed.push(this.uri)
      const children: (MockDirectory | MockFile)[] = []
      for (const uri of mockDirectories) {
        const rest = uri.slice(this.uri.length, -1)
        if (uri !== this.uri && uri.startsWith(this.uri) && !rest.includes('/')) {
          children.push(new MockDirectory(uri))
        }
      }
      for (const uri of mockFiles.keys()) {
        const rest = uri.slice(this.uri.length)
        if (uri.startsWith(this.uri) && !rest.includes('/')) children.push(new MockFile(uri))
      }
      return children
    }
  }

  class MockFile {
    uri: string
    constructor(...uris: unknown[]) {
      this.uri = join(uris)
    }
    get name() {
      return this.uri.split('/').pop() ?? ''
    }
    get exists() {
      return mockFiles.has(this.uri)
    }
    get size() {
      return mockFiles.get(this.uri)?.bytes ?? 0
    }
    get lastModified() {
      return mockFiles.get(this.uri)?.lastModified ?? null
    }
    write(content: string) {
      mockFiles.set(this.uri, { bytes: content.length, lastModified: 0, text: content })
    }
    textSync() {
      const held = mockFiles.get(this.uri)
      if (held?.text == null) throw new Error('not text')
      return held.text
    }
    delete() {
      mockFiles.delete(this.uri)
    }
    async move(destination: { uri: string; name: string }) {
      mockMoved.push({ from: this.name, to: destination.name })
      const held = mockFiles.get(this.uri)
      if (held) {
        mockFiles.delete(this.uri)
        mockFiles.set(destination.uri, held)
      }
    }
    static async downloadFileAsync(
      url: string,
      destination: MockFile,
      options?: { idempotent?: boolean },
    ) {
      if (mockDownloadFails) throw new Error('Network request failed')
      mockDownloaded.push({ url, name: destination.name, idempotent: !!options?.idempotent })
      mockFiles.set(destination.uri, { bytes: mockDownloadBytes, lastModified: 0, text: null })
      const ordinal = mockDownloaded.length
      if (mockDownloadHold && (mockHoldOnlyCall === null || ordinal === mockHoldOnlyCall)) {
        await mockDownloadHold
      }
      return destination
    }
  }

  return { Paths: { cache: { uri: 'file:///cache/' } }, Directory: MockDirectory, File: MockFile }
})

const ATTACHMENTS = 'file:///cache/attachments/'

/** A cached attachment: its directory, its document, and when it was last read. */
function seedCached(key: string, options: { bytes: number; usedAt?: number; name?: string }) {
  mockDirectories.add(ATTACHMENTS)
  mockDirectories.add(`${ATTACHMENTS}${key}/`)
  mockFiles.set(`${ATTACHMENTS}${key}/${options.name ?? 'doc.pdf'}`, {
    bytes: options.bytes,
    lastModified: 0,
    text: null,
  })
  if (options.usedAt !== undefined) {
    mockFiles.set(`${ATTACHMENTS}${key}/.used`, {
      bytes: 13,
      lastModified: 0,
      text: String(options.usedAt),
    })
  }
}

beforeEach(() => {
  mockFiles.clear()
  mockDirectories.clear()
  mockDirectories.add('file:///cache/')
  mockDirectories.add(ATTACHMENTS)
  mockCreated.length = 0
  mockDeleted.length = 0
  mockListed.length = 0
  mockDownloaded.length = 0
  mockMoved.length = 0
  mockDownloadFails = false
  mockDownloadBytes = 1
  mockDownloadHold = null
  mockHoldOnlyCall = null
})

afterEach(() => {
  // In `afterEach` rather than at the end of the test body: an expectation that
  // fails throws, and a stub restored after it would outlive the test that set it.
  jest.restoreAllMocks()
  const { Directory } = jest.requireMock('expo-file-system') as {
    Directory: { prototype: { delete: () => void } }
  }
  if (realDirectoryDelete) {
    Directory.prototype.delete = realDirectoryDelete
    realDirectoryDelete = null
  }
})

/** Set while a test has patched `Directory.prototype.delete`; restored above. */
let realDirectoryDelete: (() => void) | null = null

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

  /**
   * The marker `lastUsedAt` reads lives beside the document. Nothing may ever be
   * cached under its name, which is what stripping leading dots guarantees.
   */
  it('never answers with the name the used marker holds', () => {
    expect(cachedFileName('/uploads/chat/9f1c.pdf', '.used')).toBe('used')
  })
})

describe('ensureCachedFile', () => {
  /**
   * The download lands under a partial name and is moved into place afterwards.
   * On Android the response streams straight into its destination, so writing
   * to the final name directly would leave a truncated file there whenever a
   * download died halfway — and the hit below would serve it forever.
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
    seedCached('a.pdf', { bytes: 10, name: 'Report.pdf' })

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

  /**
   * The marker is what makes "recently used" mean last read. A hit costs no
   * download, so without this the file a person opens every day would look
   * older every day, and go before one downloaded once and forgotten.
   */
  it('marks the attachment as read on a hit as well as on a download', async () => {
    seedCached('a.pdf', { bytes: 10, usedAt: 1, name: 'Report.pdf' })
    jest.spyOn(Date, 'now').mockReturnValue(9_000)

    await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'Report.pdf')

    expect(mockFiles.get('file:///cache/attachments/a.pdf/.used')?.text).toBe('9000')
  })

  it('marks a fresh download as read, so it is the newest thing in the cache', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(4_000)

    await ensureCachedFile('https://api.example/uploads/chat/a.pdf', 'Report.pdf')

    expect(mockFiles.get('file:///cache/attachments/a.pdf/.used')?.text).toBe('4000')
  })

  it('evicts once the download has landed', async () => {
    seedCached('old.pdf', { bytes: ATTACHMENT_CACHE_BUDGET_BYTES, usedAt: 1 })
    mockDownloadBytes = 1_000

    await ensureCachedFile('https://api.example/uploads/chat/new.pdf', 'New.pdf')

    expect(mockDeleted).toEqual(['file:///cache/attachments/old.pdf/'])
    expect(mockFiles.has('file:///cache/attachments/new.pdf/New.pdf')).toBe(true)
  })

  /**
   * The eviction runs after the move rather than before the download, so the file
   * being opened is already the most recently used thing in the cache and is
   * the last candidate rather than the first.
   */
  it('never discards the download it just finished', async () => {
    mockDownloadBytes = ATTACHMENT_CACHE_BUDGET_BYTES + 1

    const result = await ensureCachedFile('https://api.example/uploads/chat/big.pdf', 'Big.pdf')

    expect(mockDeleted).toEqual([])
    expect(result).toEqual({ ok: true, uri: 'file:///cache/attachments/big.pdf/Big.pdf' })
  })

  /**
   * The cache is one directory under a system cache the app shares with
   * everything else it downloads. An eviction reading the parent could take a
   * picker's copy of a file an Upload is still streaming from.
   */
  it('reads only the attachments directory, never the cache it sits in', async () => {
    seedCached('old.pdf', { bytes: ATTACHMENT_CACHE_BUDGET_BYTES, usedAt: 1 })
    mockFiles.set('file:///cache/ImagePicker/staged.jpg', {
      bytes: 5,
      lastModified: 0,
      text: null,
    })

    await ensureCachedFile('https://api.example/uploads/chat/new.pdf', 'New.pdf')

    expect(mockListed).not.toContain('file:///cache/')
    expect(mockFiles.has('file:///cache/ImagePicker/staged.jpg')).toBe(true)
  })
})

describe('evictAttachmentFiles', () => {
  it('does nothing while the cache is inside its budget', () => {
    seedCached('a.pdf', { bytes: 10, usedAt: 1 })
    seedCached('b.pdf', { bytes: 10, usedAt: 2 })

    evictAttachmentFiles()

    expect(mockDeleted).toEqual([])
  })

  it('discards least recently read first, and stops as soon as it fits', () => {
    const half = Math.ceil(ATTACHMENT_CACHE_BUDGET_BYTES / 2) - 100
    seedCached('oldest.pdf', { bytes: half, usedAt: 100 })
    seedCached('middle.pdf', { bytes: half, usedAt: 200 })
    seedCached('newest.pdf', { bytes: half, usedAt: 300 })

    evictAttachmentFiles()

    expect(mockDeleted).toEqual(['file:///cache/attachments/oldest.pdf/'])
  })

  /**
   * A copy cached before the marker existed still has to be orderable. What the
   * filesystem knows is when the download landed, which is the best available
   * answer and never a reason to refuse to evict.
   */
  it('falls back to what the filesystem recorded when there is no marker', () => {
    const most = Math.ceil(ATTACHMENT_CACHE_BUDGET_BYTES * 0.6)
    seedCached('legacy.pdf', { bytes: most })
    mockFiles.set('file:///cache/attachments/legacy.pdf/doc.pdf', {
      bytes: most,
      lastModified: 100,
      text: null,
    })
    seedCached('marked.pdf', { bytes: most, usedAt: 200 })

    evictAttachmentFiles()

    expect(mockDeleted).toEqual(['file:///cache/attachments/legacy.pdf/'])
  })

  /**
   * A partial file is the largest thing in the cache and the least recently
   * read, so an order that consulted nothing else would take the download that
   * is happening now to make room for the one that happened before it.
   */
  it('never discards a download that is still arriving', async () => {
    seedCached('old.pdf', { bytes: Math.ceil(ATTACHMENT_CACHE_BUDGET_BYTES / 2), usedAt: 100 })
    let release = () => {}
    mockDownloadHold = new Promise<void>((resolve) => {
      release = resolve
    })
    mockDownloadBytes = ATTACHMENT_CACHE_BUDGET_BYTES
    const arriving = ensureCachedFile('https://api.example/uploads/chat/slow.pdf', 'Slow.pdf')

    evictAttachmentFiles()

    expect(mockDeleted).toEqual(['file:///cache/attachments/old.pdf/'])
    expect(mockFiles.has('file:///cache/attachments/slow.pdf/Slow.pdf.part')).toBe(true)

    mockDownloadHold = null
    release()
    await arriving
  })

  /**
   * The same document is drawn in the thread and in the gallery, and
   * `useOpenDocument` guards a second tap per bubble rather than per file — so
   * two opens of one attachment can be in flight together. The one that finishes
   * first must not unpin the one that has not.
   */
  it('stays pinned while a second download of the same file is still arriving', async () => {
    let release = () => {}
    mockDownloadHold = new Promise<void>((resolve) => {
      release = resolve
    })
    mockHoldOnlyCall = 2
    mockDownloadBytes = ATTACHMENT_CACHE_BUDGET_BYTES + 1
    const url = 'https://api.example/uploads/chat/twice.pdf'
    const first = ensureCachedFile(url, 'Twice.pdf')
    const second = ensureCachedFile(url, 'Twice.pdf')
    await first

    evictAttachmentFiles()

    expect(mockDeleted).toEqual([])
    mockDownloadHold = null
    release()
    await second
  })

  /**
   * An interrupted `markUsed` leaves a marker with nothing in it. `Number('')`
   * is `0` — finite, and the oldest possible stamp — so reading it as one would
   * send the file just read to the front of the queue.
   */
  it('ignores an empty marker rather than reading it as the oldest stamp', () => {
    const most = Math.ceil(ATTACHMENT_CACHE_BUDGET_BYTES * 0.6)
    seedCached('interrupted.pdf', { bytes: most, usedAt: 300 })
    mockFiles.set(`${ATTACHMENTS}interrupted.pdf/.used`, {
      bytes: 0,
      lastModified: 300,
      text: '',
    })
    mockFiles.set(`${ATTACHMENTS}interrupted.pdf/doc.pdf`, {
      bytes: most,
      lastModified: 300,
      text: null,
    })
    seedCached('older.pdf', { bytes: most, usedAt: 100 })

    evictAttachmentFiles()

    expect(mockDeleted).toEqual(['file:///cache/attachments/older.pdf/'])
  })

  it('does nothing when the cache directory does not exist yet', () => {
    mockDirectories.delete(ATTACHMENTS)

    evictAttachmentFiles()

    expect(mockDeleted).toEqual([])
  })

  /**
   * A cache that cannot be evicted from must not become a document that cannot be
   * opened, so every filesystem call here is allowed to fail on its own.
   */
  it('swallows a directory that refuses to go, and still discards the next', () => {
    const half = Math.ceil(ATTACHMENT_CACHE_BUDGET_BYTES / 2) - 100
    seedCached('stuck.pdf', { bytes: half, usedAt: 100 })
    seedCached('goes.pdf', { bytes: half, usedAt: 200 })
    seedCached('newer.pdf', { bytes: half, usedAt: 300 })
    seedCached('newest.pdf', { bytes: half, usedAt: 400 })
    const { Directory } = jest.requireMock('expo-file-system') as {
      Directory: { prototype: { delete: () => void } }
    }
    realDirectoryDelete = Directory.prototype.delete
    const real = realDirectoryDelete
    Directory.prototype.delete = function refuseOne(this: { uri: string }) {
      if (this.uri.includes('stuck.pdf')) throw new Error('EBUSY')
      real.call(this)
    }

    expect(() => evictAttachmentFiles()).not.toThrow()

    expect(mockDeleted).toEqual(['file:///cache/attachments/goes.pdf/'])
    expect(mockDirectories.has('file:///cache/attachments/stuck.pdf/')).toBe(true)
  })
})

/**
 * Everything a Session end has to leave nothing of. What is asserted is the
 * directory going, not the files inside it: a copy left behind is a document
 * from somebody else's support thread, readable by whoever holds the phone next.
 */
describe('wipeAttachmentFiles', () => {
  it('discards every downloaded document, whichever thread it came from', () => {
    seedCached('one.pdf', { bytes: 10, usedAt: 100 })
    seedCached('two.pdf', { bytes: 10, usedAt: 200 })

    wipeAttachmentFiles()

    expect(mockDeleted).toEqual([ATTACHMENTS])
    expect(mockDirectories.has(`${ATTACHMENTS}one.pdf/`)).toBe(false)
    expect(mockFiles.has(`${ATTACHMENTS}two.pdf/doc.pdf`)).toBe(false)
  })

  it('has nothing to do on a device that never downloaded one', () => {
    mockDirectories.delete(ATTACHMENTS)

    expect(() => wipeAttachmentFiles()).not.toThrow()
    expect(mockDeleted).toEqual([])
  })

  // A Session end that could fail is a Session end that could strand somebody on
  // a screen they have already been signed out of.
  it('swallows a directory the platform will not remove', () => {
    seedCached('stuck.pdf', { bytes: 10, usedAt: 100 })
    const { Directory } = jest.requireMock('expo-file-system') as {
      Directory: { prototype: { delete: () => void } }
    }
    realDirectoryDelete = Directory.prototype.delete
    Directory.prototype.delete = function refuse() {
      throw new Error('EBUSY')
    }

    expect(() => wipeAttachmentFiles()).not.toThrow()
  })

  it('leaves a cache the next download can still land in', async () => {
    seedCached('one.pdf', { bytes: 10, usedAt: 100 })
    wipeAttachmentFiles()

    const cached = await ensureCachedFile('https://api.example/uploads/new.pdf', 'new.pdf')

    expect(cached).toEqual({ ok: true, uri: `${ATTACHMENTS}new.pdf/new.pdf` })
  })
})
