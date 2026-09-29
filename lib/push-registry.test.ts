import { apiRequest } from '@/lib/api-client'
import type { HttpOutcome } from '@/lib/auth-response'
import {
  PUSH_REGISTERED_TOKEN_FILE,
  deregisterPushDevice,
  pushDeregistrationSettled,
  rememberPushRegistration,
} from '@/lib/push-registry'

/**
 * Two boundaries, both hand-written: the cache this module writes its one file
 * to, and the one request it makes. `expo-notifications` is deliberately absent
 * — nothing here touches it, which is the whole reason this module is not part
 * of `lib/push-device`.
 */
const mockCache = new Map<string, string>()
let mockCacheReadFails = false
let mockCacheWriteFails = false

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    name: string
    constructor(directory: unknown, name: string) {
      this.name = `${String(directory)}${name}`
    }
    get exists() {
      if (mockCacheReadFails) throw new Error('cache unreadable')
      return mockCache.has(this.name)
    }
    write(text: string) {
      if (mockCacheWriteFails) throw new Error('cache unwritable')
      mockCache.set(this.name, text)
    }
    textSync() {
      if (mockCacheReadFails) throw new Error('cache unreadable')
      return mockCache.get(this.name) ?? ''
    }
    delete() {
      if (mockCacheWriteFails) throw new Error('cache unwritable')
      mockCache.delete(this.name)
    }
  },
}))

// Deliberately not `conversation-api`: see `deregisterPushDevice` on why this
// one request cannot be an `authenticatedRequest`.
jest.mock('@/lib/api-client', () => ({
  apiRequest: jest.fn(),
}))

const request = apiRequest as jest.MockedFunction<typeof apiRequest>

const TOKEN_FILE = `file:///cache/${PUSH_REGISTERED_TOKEN_FILE}`
const COOKIE = 'better-auth.session_token=ending'
const TOKEN = 'ExponentPushToken[abc]'

/** What the API answers a `DELETE` it accepted. */
function removed(was: boolean) {
  return {
    reached: true as const,
    status: 200,
    body: { data: { removed: was } },
    sessionCookie: null,
  }
}

beforeEach(() => {
  mockCache.clear()
  mockCacheReadFails = false
  mockCacheWriteFails = false
  jest.clearAllMocks()
  request.mockResolvedValue(removed(true))
})

/**
 * The record of what this installation registered, and the request that takes it
 * back. Together because neither means anything alone: the file exists to name a
 * row, and the `DELETE` exists to remove the row it names.
 */
describe('deregisterPushDevice', () => {
  it('removes the token this installation registered, under the ending credential', async () => {
    rememberPushRegistration(TOKEN)

    await deregisterPushDevice(COOKIE)

    expect(request).toHaveBeenCalledWith('/push/devices', {
      method: 'DELETE',
      body: { token: TOKEN },
      cookie: COOKIE,
    })
  })

  // A row that is gone is a row nothing has to remember. Kept on anything else,
  // so a Session end that could not reach the API leaves the next one something
  // to try — which is the only retry there is.
  it('forgets the record once the API has accepted it', async () => {
    rememberPushRegistration(TOKEN)
    request.mockResolvedValueOnce(removed(true))

    await deregisterPushDevice(COOKIE)

    expect(mockCache.has(TOKEN_FILE)).toBe(false)
  })

  it('keeps the record when the API refuses, so the next Session end tries again', async () => {
    rememberPushRegistration(TOKEN)
    request.mockResolvedValueOnce({
      reached: true,
      status: 401,
      body: { message: 'Unauthorized' },
      sessionCookie: null,
    })

    await deregisterPushDevice(COOKIE)

    expect(mockCache.get(TOKEN_FILE)).toBe(TOKEN)
  })

  /**
   * A moment with nothing to authenticate with — a cold start that found no
   * cookie, a refused sign-in. There is no request to make, and the owner-scoped
   * `DELETE` would remove nothing if there were.
   */
  it('makes no request without a credential to present', async () => {
    rememberPushRegistration(TOKEN)

    await deregisterPushDevice(null)

    expect(request).not.toHaveBeenCalled()
  })

  // The Session end around it is never failed by this. See `lib/session-wipe`.
  it('answers rather than throwing when the request does', async () => {
    rememberPushRegistration(TOKEN)
    request.mockRejectedValueOnce(new Error('deadline'))

    await expect(deregisterPushDevice(COOKIE)).resolves.toBeUndefined()
  })

  // Written by every registration, so the record is the token the *last* one
  // sent rather than the first — a token rotates, and the row follows it.
  it('removes the token most recently registered', async () => {
    rememberPushRegistration(TOKEN)
    rememberPushRegistration('ExponentPushToken[rotated]')

    await deregisterPushDevice(COOKIE)

    expect(request).toHaveBeenCalledWith('/push/devices', {
      method: 'DELETE',
      body: { token: 'ExponentPushToken[rotated]' },
      cookie: COOKIE,
    })
  })
})

/**
 * What `signOut` waits on before it ends the session on the server. The reason
 * is in `deregisterPushDevice`: the logout makes the `DELETE` impossible, so it
 * cannot be allowed to overtake it.
 */
describe('pushDeregistrationSettled', () => {
  it('waits for the deregistration this Session end fired', async () => {
    rememberPushRegistration(TOKEN)
    let answer: (outcome: HttpOutcome) => void = () => {}
    request.mockReturnValueOnce(
      new Promise<HttpOutcome>((resolve) => {
        answer = resolve
      }),
    )

    void deregisterPushDevice(COOKIE)
    let settled = false
    const waiting = pushDeregistrationSettled().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    answer(removed(true))
    await waiting
    expect(settled).toBe(true)
  })

  /**
   * The bound. Holding the logout back keeps the session alive on the server,
   * which is a worse thing to leave running than a device row — so past a few
   * seconds the wait is given up and the logout goes.
   */
  it('gives the ordering up rather than leaving the session alive', async () => {
    jest.useFakeTimers()
    try {
      rememberPushRegistration(TOKEN)
      request.mockReturnValueOnce(new Promise<HttpOutcome>(() => {}))

      void deregisterPushDevice(COOKIE)
      let settled = false
      const waiting = pushDeregistrationSettled().then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)

      jest.advanceTimersByTime(4_000)
      await waiting
      expect(settled).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })
})
