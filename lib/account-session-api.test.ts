import {
  readAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
} from '@/lib/account-session-api'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import { API_BASE_URL } from '@/lib/api-config'

/**
 * The two boundaries this file cannot cross under Jest, both reached through
 * `authenticatedRequest`, the same pair `lib/notification-api.test.ts` mocks,
 * and for the same reasons. The transport itself is real: this file is about the
 * requests that go out.
 */
jest.mock('@/lib/google-session', () => ({
  requestGoogleIdToken: jest.fn(async () => ({ kind: 'failed' })),
  releaseGoogleSession: jest.fn(async () => undefined),
}))

jest.mock('@/lib/keychain', () => ({
  readSessionCookie: jest.fn(),
  writeSessionCookie: jest.fn(async () => true),
  clearSessionCookie: jest.fn(async () => true),
  clearRetiredCredential: jest.fn(async () => undefined),
  readKeptPerson: jest.fn(async () => null),
  writeKeptPerson: jest.fn(async () => undefined),
  clearKeptPerson: jest.fn(async () => undefined),
}))

jest.mock('@/lib/legacy-session', () => ({
  purgeMockSession: jest.fn(async () => undefined),
}))

type FetchCall = { url: string; init: RequestInit }

const calls: FetchCall[] = []
let queue: (Response | Error)[] = []

function enqueue(...responses: (Response | Error)[]): void {
  queue.push(...responses)
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const lookup = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lookup.get(name.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Response
}

function envelope(data: unknown, status = 200): Response {
  return response(status, { statusCode: status, message: 'Success', data })
}

function csrfResponse(token = 'csrf-token-value'): Response {
  return response(
    200,
    { statusCode: 200, message: 'Success', data: token },
    { 'set-cookie': 'csrf-token=cookie-value; Path=/; HttpOnly' },
  )
}

const ROW = {
  id: 'sess_1',
  deviceName: 'Windows 11 - Chrome',
  deviceType: 'desktop',
  ipAddress: '203.0.113.4',
  userAgent: 'Mozilla/5.0',
  loginMethod: 'email',
  status: 'active',
  isCurrent: true,
  isRevoked: false,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-20T18:30:00.000Z',
  expiresAt: '2026-10-01T09:00:00.000Z',
}

function page(rows: unknown[]) {
  return { rows, total: rows.length, page: 1, pageSize: 50, activeOtherSessionCount: 0 }
}

beforeEach(() => {
  calls.length = 0
  queue = []
  setSessionCookie('better-auth.session_token=abc.def')
  clearCsrfPair()
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next ?? response(200, {})
  }) as unknown as typeof fetch
})

describe('readAccountSessions', () => {
  test('asks for active sessions only, newest first', async () => {
    enqueue(envelope(page([ROW])))

    await readAccountSessions()

    expect(calls[0]?.url).toBe(
      `${API_BASE_URL}/sessions?status=active&page=1&pageSize=50&sort=createdAt&dir=desc`,
    )
  })

  test('reads the rows out of the page', async () => {
    enqueue(envelope(page([ROW])))

    expect(await readAccountSessions()).toEqual({
      ok: true,
      value: [
        {
          id: 'sess_1',
          deviceName: 'Windows 11 - Chrome',
          deviceType: 'desktop',
          ipAddress: '203.0.113.4',
          loginMethod: 'email',
          isCurrent: true,
          createdAt: '2026-09-01T09:00:00.000Z',
          updatedAt: '2026-09-20T18:30:00.000Z',
        },
      ],
    })
  })

  test('answers malformed rather than claiming this account is signed in nowhere', async () => {
    enqueue(envelope(page([{ deviceName: 'Nameless' }])))

    expect(await readAccountSessions()).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })

  test('a dead network is unreachable rather than an empty list', async () => {
    enqueue(new Error('offline'))

    expect(await readAccountSessions()).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })

  test('an ended session is unauthorised, which is what signs this phone out', async () => {
    enqueue(response(401, { message: 'Unauthorized' }))

    expect(await readAccountSessions()).toEqual({
      ok: false,
      failure: { kind: 'unauthorised' },
    })
  })
})

describe('revokeAccountSession', () => {
  test('posts to that one session’s revoke route', async () => {
    enqueue(csrfResponse(), envelope({ revoked: true }))

    const result = await revokeAccountSession('sess_2')

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/sessions/sess_2/revoke`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(result).toEqual({ ok: true, value: true })
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope({ revoked: true }))

    await revokeAccountSession('sess 2/../revoke-others')

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/sessions/sess%202%2F..%2Frevoke-others/revoke`,
    )
  })

  test('reads a refusal as one, in the API’s own words', async () => {
    enqueue(csrfResponse(), response(404, { message: 'Session not found' }))

    expect(await revokeAccountSession('sess_9')).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'Session not found' },
    })
  })

  test('a request that never arrived is unreachable, not a refusal', async () => {
    enqueue(csrfResponse(), new Error('offline'))

    expect(await revokeAccountSession('sess_2')).toEqual({
      ok: false,
      failure: { kind: 'unreachable' },
    })
  })
})

describe('revokeOtherAccountSessions', () => {
  test('posts to revoke-others and takes no id', async () => {
    enqueue(csrfResponse(), envelope({ revokedCount: 3 }))

    const result = await revokeOtherAccountSessions()

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/sessions/revoke-others`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(result).toEqual({ ok: true, value: true })
  })

  test('a count of zero is still an acknowledgement, since nothing reads it back', async () => {
    enqueue(csrfResponse(), envelope({ revokedCount: 0 }))

    expect(await revokeOtherAccountSessions()).toEqual({ ok: true, value: true })
  })

  test('reads a refusal as one', async () => {
    enqueue(csrfResponse(), response(403, { message: 'You cannot do that' }))

    expect(await revokeOtherAccountSessions()).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'You cannot do that' },
    })
  })
})
