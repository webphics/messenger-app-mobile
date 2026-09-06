import { wipeAttachmentFiles } from '@/lib/attachment-cache'
import { wipeStore } from '@/lib/conversation-store'
import { deregisterPushDevice } from '@/lib/push-registry'
import { endSessionOnDevice } from '@/lib/session-wipe'

// All three own a boundary — SQLite, the filesystem, the network — and all three
// are already tested against a mock of it next door. What is left to be sure of
// here is only what this file decides: that every one of them is reached, and
// that none of them can stop the others or the Session end around them.
jest.mock('@/lib/conversation-store', () => ({
  wipeStore: jest.fn(async () => undefined),
}))

jest.mock('@/lib/attachment-cache', () => ({
  wipeAttachmentFiles: jest.fn(),
}))

jest.mock('@/lib/push-registry', () => ({
  deregisterPushDevice: jest.fn(async () => undefined),
}))

const store = wipeStore as jest.MockedFunction<typeof wipeStore>
const files = wipeAttachmentFiles as jest.MockedFunction<typeof wipeAttachmentFiles>
const push = deregisterPushDevice as jest.MockedFunction<typeof deregisterPushDevice>

const ENDING = 'better-auth.session_token=ending'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('endSessionOnDevice', () => {
  it('destroys the database, the downloaded documents and the push row together', async () => {
    await endSessionOnDevice(ENDING)

    expect(store).toHaveBeenCalledTimes(1)
    expect(files).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })

  // The credential is only ever wanted by the half that leaves the phone.
  it('hands the ending credential to the half that needs one', async () => {
    await endSessionOnDevice(ENDING)

    expect(push).toHaveBeenCalledWith(ENDING)
  })

  it('waits for the database, so a write on its way cannot outlive the wipe', async () => {
    let released = () => {}
    store.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        released = resolve
      }),
    )
    let settled = false

    const wiping = endSessionOnDevice(ENDING).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    released()
    await wiping
    expect(settled).toBe(true)
  })

  // The one half that talks to a network is the one half nothing waits for. A
  // sign-out that hung on a request would be the failure this whole path exists
  // to avoid — see `signOut`, which discards the credential before telling the
  // server for exactly the same reason.
  it('does not wait for the push row, however long the request takes', async () => {
    push.mockReturnValueOnce(new Promise<void>(() => {}))

    await expect(endSessionOnDevice(ENDING)).resolves.toBeUndefined()

    expect(store).toHaveBeenCalledTimes(1)
    expect(files).toHaveBeenCalledTimes(1)
  })

  it('discards the documents even when the database will not go', async () => {
    store.mockRejectedValueOnce(new Error('database is locked'))

    await expect(endSessionOnDevice(ENDING)).resolves.toBeUndefined()

    expect(files).toHaveBeenCalledTimes(1)
  })

  // A `DELETE` that fails is a row the API keeps, and nothing else. It cannot
  // reach the two halves that were going to succeed, and it cannot reach the
  // Session end above them.
  it('destroys both halves on this device when the push row will not go', async () => {
    push.mockRejectedValueOnce(new Error('unauthorised'))

    await expect(endSessionOnDevice(ENDING)).resolves.toBeUndefined()

    expect(store).toHaveBeenCalledTimes(1)
    expect(files).toHaveBeenCalledTimes(1)
  })

  // The order, stated as the thing it protects: the documents go last, so a
  // failure there is a failure of nothing else. Whether a Session end may be
  // failed by one at all is answered in `lib/auth-service`, not here.
  it('has already destroyed the database when the documents will not go', async () => {
    files.mockImplementationOnce(() => {
      throw new Error('EBUSY')
    })

    await expect(endSessionOnDevice(ENDING)).rejects.toThrow('EBUSY')

    expect(store).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
  })
})
