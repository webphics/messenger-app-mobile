import { API_BASE_URL } from '@/lib/api-config'
import { clearCsrfPair, setSessionCookie } from '@/lib/api-client'
import { blockPerson, listBlockedPeople, unblockPerson } from '@/lib/block-api'
import { createReport, listReports, readReportSummary, resolveReport } from '@/lib/report-api'

/**
 * Reports and blocks over the real transport, mirroring `wall-api.test.ts`:
 * the Google native module and the keychain are the two boundaries Jest cannot
 * cross, and global fetch is a queue.
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
let queue: Response[] = []

function enqueue(...responses: Response[]): void {
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

function csrfResponse(): Response {
  return response(
    200,
    { statusCode: 200, message: 'Success', data: 'csrf-token-value' },
    { 'set-cookie': 'csrf-token=cookie-value; Path=/; HttpOnly' },
  )
}

const REPORT = {
  id: 'rpt-1',
  reference: 'RPT-1',
  targetKind: 'message',
  targetId: 'msg-1',
  conversationId: 'cnv-1',
  reason: 'harassment',
  status: 'actioned',
  action: 'remove_content',
  content: { text: 'x', attachmentCount: 0, removed: true },
  availableActions: [],
  createdAt: '2026-10-31T10:00:00.000Z',
}

const BLOCK = { user: { id: 'u-2', name: 'Mallory', image: null }, blockedAt: '2026-10-31T10:00:00.000Z' }

beforeEach(() => {
  calls.length = 0
  queue = []
  setSessionCookie('better-auth.session_token=abc.def')
  clearCsrfPair()
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return queue.shift() ?? response(200, {})
  }) as unknown as typeof fetch
})

describe('filing a report', () => {
  test('posts the target and reason, leaving out what was not given', async () => {
    enqueue(csrfResponse(), envelope({ id: 'rpt-1', reference: 'RPT-1', status: 'open', createdAt: '2026-10-31T10:00:00.000Z' }, 201))

    const result = await createReport({ targetKind: 'wall_post', targetId: 'post-1', reason: 'spam' })

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/reports`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({
      targetKind: 'wall_post',
      targetId: 'post-1',
      reason: 'spam',
    })
    expect(result.ok).toBe(true)
  })

  test('names the conversation of a reported message, and the note', async () => {
    enqueue(csrfResponse(), envelope({ id: 'rpt-1', status: 'open', createdAt: '2026-10-31T10:00:00.000Z' }, 201))

    await createReport({
      targetKind: 'message',
      targetId: 'msg-1',
      conversationId: 'cnv-1',
      reason: 'nonconsensual_intimate_imagery',
      details: 'A faked photo of me',
    })

    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({
      targetKind: 'message',
      targetId: 'msg-1',
      conversationId: 'cnv-1',
      reason: 'nonconsensual_intimate_imagery',
      details: 'A faked photo of me',
    })
  })
})

describe('the queue', () => {
  test('reads one tab a page at a time', async () => {
    enqueue(envelope({ rows: [REPORT], total: 1, page: 1, pageSize: 30 }))

    const result = await listReports({ status: 'open', page: 1, pageSize: 30 })

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/reports?status=open&page=1&pageSize=30`)
    expect(result.ok && result.value.rows[0]?.id).toBe('rpt-1')
  })

  test('reads the summary', async () => {
    enqueue(envelope({ open: 2, overdue: 1, oldestOpenAt: '2026-10-30T10:00:00.000Z' }))

    const result = await readReportSummary()

    expect(calls[0]?.url).toBe(`${API_BASE_URL}/reports/summary`)
    expect(result).toEqual({ ok: true, value: { open: 2, overdue: 1, oldestOpenAt: '2026-10-30T10:00:00.000Z' } })
  })

  test('resolves with the action, and a note only when there is one', async () => {
    enqueue(csrfResponse(), envelope(REPORT))

    await resolveReport('rpt-1', 'remove_content', '  ')

    expect(calls[1]?.url).toBe(`${API_BASE_URL}/reports/rpt-1/resolve`)
    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({ action: 'remove_content' })
  })
})

describe('blocking', () => {
  test('lists, blocks and unblocks by the person’s id', async () => {
    enqueue(envelope({ rows: [BLOCK] }))
    const listed = await listBlockedPeople()
    expect(calls[0]?.url).toBe(`${API_BASE_URL}/blocks`)
    expect(listed.ok && listed.value[0]?.id).toBe('u-2')

    enqueue(csrfResponse(), envelope(BLOCK, 201))
    const blocked = await blockPerson('u-2')
    expect(JSON.parse(calls[2]?.init.body as string)).toEqual({ userId: 'u-2' })
    expect(blocked.ok).toBe(true)

    enqueue(envelope({ userId: 'u-2' }))
    const unblocked = await unblockPerson('u-2')
    expect(calls.at(-1)?.url).toBe(`${API_BASE_URL}/blocks/u-2`)
    expect(calls.at(-1)?.init.method).toBe('DELETE')
    expect(unblocked).toEqual({ ok: true, value: { userId: 'u-2' } })
  })

  test('says why the API refused a block of yourself', async () => {
    enqueue(
      csrfResponse(),
      response(422, { statusCode: 422, code: 'cannot_block_self', message: 'You cannot block yourself' }),
    )

    expect(await blockPerson('me')).toEqual({
      ok: false,
      failure: { kind: 'refused', code: 'cannot_block_self', message: 'You cannot block yourself' },
    })
  })
})
