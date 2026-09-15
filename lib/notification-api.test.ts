import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import { API_BASE_URL } from '@/lib/api-config'
import { readNotificationSettings, setPostNotifications } from '@/lib/notification-api'

/**
 * The two boundaries this file cannot cross under Jest, both reached through
 * `authenticatedRequest` — the same pair `lib/conversation-api.test.ts` mocks,
 * and for the same reasons. The transport itself is real: this file is about
 * the requests that go out.
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

const SETTINGS = {
  broadcastOptOut: false,
  mutedConversationIds: [],
  postOrganizationIds: ['org-1'],
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

describe('readNotificationSettings', () => {
  test('reads the settings document', async () => {
    enqueue(envelope(SETTINGS))

    const result = await readNotificationSettings()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/notifications/settings`)
    expect(result).toEqual({ ok: true, value: SETTINGS })
  })

  test('answers malformed rather than inventing an opt-in list', async () => {
    enqueue(envelope('settings'))

    expect(await readNotificationSettings()).toEqual({
      ok: false,
      failure: { kind: 'malformed' },
    })
  })
})

describe('setPostNotifications', () => {
  test('turning one on is a PUT against that organization', async () => {
    enqueue(csrfResponse(), envelope(SETTINGS))

    const result = await setPostNotifications('org-1', true)

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/csrf`)
    expect(calls[1]?.url).toBe(`${API_BASE_URL}/notifications/post-organizations/org-1`)
    expect(calls[1]?.init.method).toBe('PUT')
    expect(result).toEqual({ ok: true, value: SETTINGS })
  })

  test('turning one off is a DELETE against the same path', async () => {
    enqueue(csrfResponse(), envelope({ ...SETTINGS, postOrganizationIds: [] }))

    const result = await setPostNotifications('org-1', false)

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/notifications/post-organizations/org-1`)
    expect(calls[1]?.init.method).toBe('DELETE')
    expect(result).toEqual({
      ok: true,
      value: { ...SETTINGS, postOrganizationIds: [] },
    })
  })

  test('escapes an id rather than letting it shape the path', async () => {
    enqueue(csrfResponse(), envelope(SETTINGS))

    await setPostNotifications('org 1/../settings', true)

    expect(calls[1]?.url).toBe(
      `${API_BASE_URL}/notifications/post-organizations/org%201%2F..%2Fsettings`,
    )
  })

  test('reads a refusal as one, in the API’s own words', async () => {
    enqueue(csrfResponse(), response(403, { message: 'You are not in that organization' }))

    expect(await setPostNotifications('org-9', true)).toEqual({
      ok: false,
      failure: { kind: 'refused', message: 'You are not in that organization' },
    })
  })
})
