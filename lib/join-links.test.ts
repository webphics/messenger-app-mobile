import {
  isJoinLinkLive,
  joinLinkDetail,
  joinLinkOrganizationNames,
  joinLinkShareMessage,
  joinLinkUrl,
  orderedJoinLinks,
  parseJoinLink,
  parseJoinLinks,
  parseRevoked,
  withJoinLink,
  type JoinLink,
} from '@/lib/join-links'

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  token: 'abc/def+ghi',
  organizations: [{ id: 'o1', name: 'Acme' }],
  usageMode: 'single_use',
  useCount: 0,
  status: 'active',
  expiresAt: '2026-11-24T10:00:00.000Z',
  revokedAt: null,
  createdByName: 'Ada',
  createdAt: '2026-11-23T10:00:00.000Z',
}

function link(overrides: Partial<JoinLink> = {}): JoinLink {
  return { ...(parseJoinLink(ROW) as JoinLink), ...overrides }
}

describe('parseJoinLink', () => {
  test('reads a whole row', () => {
    expect(parseJoinLink(ROW)).toEqual(ROW)
  })

  test.each([
    ['no id', { id: undefined }],
    ['no token', { token: '' }],
    ['a status this build does not know', { status: 'paused' }],
    ['a usage mode this build does not know', { usageMode: 'twice' }],
    ['no expiry', { expiresAt: null }],
  ])('drops a row with %s', (_, change) => {
    expect(parseJoinLink({ ...ROW, ...change })).toBeNull()
  })

  test('drops unreadable organizations and falls back on a missing count', () => {
    const parsed = parseJoinLink({
      ...ROW,
      organizations: [{ id: 'o1', name: 'Acme' }, { id: 'o2' }, 7],
      useCount: 'many',
    })
    expect(parsed?.organizations).toEqual([{ id: 'o1', name: 'Acme' }])
    expect(parsed?.useCount).toBe(0)
  })
})

describe('parseJoinLinks', () => {
  test('keeps the readable rows of a page', () => {
    expect(parseJoinLinks({ rows: [ROW, { id: 'x' }], total: 2 })).toHaveLength(1)
  })

  test('a body with no rows array is malformed, not empty', () => {
    expect(parseJoinLinks({ total: 0 })).toBeNull()
    expect(parseJoinLinks({ rows: [] })).toEqual([])
  })
})

test('parseRevoked reads the flag and nothing else', () => {
  expect(parseRevoked({ revoked: true })).toBe(true)
  expect(parseRevoked({ revoked: false })).toBe(false)
  expect(parseRevoked({})).toBeNull()
})

describe('joinLinkUrl', () => {
  test('points at the web join page with the token encoded', () => {
    expect(joinLinkUrl('abc/def+ghi', 'https://example.test')).toBe(
      'https://example.test/join?token=abc%2Fdef%2Bghi',
    )
  })
})

test.each([
  [[], 'No organizations'],
  [['Acme'], 'Acme'],
  [['Acme', 'Globex'], 'Acme and Globex'],
  [['Acme', 'Globex', 'Initech'], 'Acme, Globex and Initech'],
])('organization names %j → %s', (names, expected) => {
  const organizations = names.map((name, index) => ({ id: String(index), name }))
  expect(joinLinkOrganizationNames({ organizations })).toBe(expected)
})

test('the share message names who it is for and carries the link', () => {
  expect(joinLinkShareMessage(link())).toMatch(/^Join Acme on ChatRoute: https:\/\/.+\/join\?token=abc%2Fdef%2Bghi$/)
})

describe('isJoinLinkLive', () => {
  test.each([
    ['active', true],
    ['used', false],
    ['expired', false],
    ['revoked', false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isJoinLinkLive({ status })).toBe(expected)
  })
})

describe('joinLinkDetail', () => {
  const date = (iso: string) => iso.slice(0, 10)

  test.each<[Partial<JoinLink>, string]>([
    [{}, 'Single use · 0 uses · Expires 2026-11-24'],
    [{ usageMode: 'unlimited', useCount: 1 }, 'Unlimited · 1 use · Expires 2026-11-24'],
    [{ status: 'expired', useCount: 3 }, 'Single use · 3 uses · Expired 2026-11-24'],
    [{ status: 'revoked', revokedAt: '2026-11-23T12:00:00Z' }, 'Single use · 0 uses · Revoked 2026-11-23'],
    [{ status: 'used', useCount: 1 }, 'Single use · 1 use'],
  ])('%j → %s', (overrides, expected) => {
    expect(joinLinkDetail(link(overrides), date)).toBe(expected)
  })
})

test('orderedJoinLinks puts live links first, newest first within each half', () => {
  const ordered = orderedJoinLinks([
    link({ id: 'old-dead', status: 'revoked', createdAt: '2026-01-01' }),
    link({ id: 'old-live', createdAt: '2026-01-02' }),
    link({ id: 'new-dead', status: 'expired', createdAt: '2026-03-01' }),
    link({ id: 'new-live', createdAt: '2026-02-01' }),
  ])
  expect(ordered.map((row) => row.id)).toEqual(['new-live', 'old-live', 'new-dead', 'old-dead'])
})

test('withJoinLink replaces a known link in place and adds a new one', () => {
  const held = [link({ id: 'a' }), link({ id: 'b' })]
  expect(withJoinLink(held, link({ id: 'a', status: 'revoked' }))[0].status).toBe('revoked')
  expect(withJoinLink(held, link({ id: 'c' })).map((row) => row.id)).toEqual(['c', 'a', 'b'])
})
