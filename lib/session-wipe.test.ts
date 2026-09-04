import { wipeAttachmentFiles } from '@/lib/attachment-cache'
import { wipeStore } from '@/lib/conversation-store'
import { wipeStoreAndAttachments } from '@/lib/session-wipe'

// Both halves own a native boundary — SQLite one side, the filesystem the other
// — and both are already tested against a mock of it next door. What is left to
// be sure of here is only what this file decides: that both are reached, and
// that neither can stop the other or the Session end around them.
jest.mock('@/lib/conversation-store', () => ({
  wipeStore: jest.fn(async () => undefined),
}))

jest.mock('@/lib/attachment-cache', () => ({
  wipeAttachmentFiles: jest.fn(),
}))

const store = wipeStore as jest.MockedFunction<typeof wipeStore>
const files = wipeAttachmentFiles as jest.MockedFunction<typeof wipeAttachmentFiles>

beforeEach(() => {
  jest.clearAllMocks()
})

describe('wipeStoreAndAttachments', () => {
  it('destroys the database and the downloaded documents together', async () => {
    await wipeStoreAndAttachments()

    expect(store).toHaveBeenCalledTimes(1)
    expect(files).toHaveBeenCalledTimes(1)
  })

  it('waits for the database, so a write on its way cannot outlive the wipe', async () => {
    let released = () => {}
    store.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        released = resolve
      }),
    )
    let settled = false

    const wiping = wipeStoreAndAttachments().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    released()
    await wiping
    expect(settled).toBe(true)
  })

  it('discards the documents even when the database will not go', async () => {
    store.mockRejectedValueOnce(new Error('database is locked'))

    await expect(wipeStoreAndAttachments()).resolves.toBeUndefined()

    expect(files).toHaveBeenCalledTimes(1)
  })

  // The order, stated as the thing it protects: the documents go last, so a
  // failure there is a failure of nothing else. Whether a Session end may be
  // failed by one at all is answered in `lib/auth-service`, not here.
  it('has already destroyed the database when the documents will not go', async () => {
    files.mockImplementationOnce(() => {
      throw new Error('EBUSY')
    })

    await expect(wipeStoreAndAttachments()).rejects.toThrow('EBUSY')

    expect(store).toHaveBeenCalledTimes(1)
  })
})
