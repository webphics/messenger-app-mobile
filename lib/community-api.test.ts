import {
  joinLinkedGroup,
  leaveCommunity,
  listCommunityGroups,
  withdrawJoinRequest,
} from '@/lib/community-api'

/**
 * Only the path is under test here: every id these functions take is written
 * into it, and an id is not trusted to be path-safe just because
 * `communityIdFromRoute` checked one of the ways it can arrive.
 */
const mockRequest = jest.fn(async (..._args: unknown[]) => ({ kind: 'network' as const }))

jest.mock('@/lib/auth-service', () => ({
  authenticatedRequest: (...args: unknown[]) => mockRequest(...args),
}))

beforeEach(() => mockRequest.mockClear())

function requestedPath(): unknown {
  return mockRequest.mock.calls[0]?.[0]
}

describe('a Community path', () => {
  const HOSTILE = '../users/me?x=1#y'
  const ENCODED = encodeURIComponent(HOSTILE)

  it.each([
    ['listing Groups', () => listCommunityGroups(HOSTILE), `/communities/${ENCODED}/groups`],
    ['leaving', () => leaveCommunity(HOSTILE), `/communities/${ENCODED}/members/me`],
    [
      'joining a Group',
      () => joinLinkedGroup(HOSTILE, HOSTILE),
      `/communities/${ENCODED}/groups/${ENCODED}/join`,
    ],
    [
      'withdrawing a Join request',
      () => withdrawJoinRequest(HOSTILE, HOSTILE),
      `/communities/${ENCODED}/groups/${ENCODED}/join-requests/me`,
    ],
  ])('encodes every id when %s', async (_, call, path) => {
    await call()
    expect(requestedPath()).toBe(path)
  })

  it('leaves a UUID as it is', async () => {
    const id = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
    await listCommunityGroups(id)
    expect(requestedPath()).toBe(`/communities/${id}/groups`)
  })
})
