import { adminCommunitiesCaption, isCommunityMember } from '@/lib/community-admin-list'
import type { Community } from '@/lib/types'

function community(id: string, memberIds: string[]): Community {
  return {
    id,
    name: id,
    description: null,
    avatarUrl: null,
    memberCount: memberIds.length,
    linkedGroupCount: 0,
    memberIds,
    createdAt: '2026-09-01T10:00:00.000Z',
  }
}

describe('isCommunityMember', () => {
  it.each([
    ['a member', ['viewer', 'other'], 'viewer', true],
    ['not a member', ['other'], 'viewer', false],
    ['an empty Community', [], 'viewer', false],
    ['no viewer', ['viewer'], null, false],
  ])('%s', (_case, memberIds, viewerId, expected) => {
    expect(isCommunityMember(community('c', memberIds as string[]), viewerId as string | null)).toBe(expected)
  })
})

describe('adminCommunitiesCaption', () => {
  const mine = community('mine', ['viewer'])
  const alsoMine = community('also-mine', ['viewer'])
  const theirs = community('theirs', ['other'])

  it.each([
    ['still loading', null, 'Every community in the product, not only yours'],
    ['none at all', [], 'Every community in the product, not only yours'],
    ['in some (the BUG-38 account)', [mine, alsoMine, theirs], "All 3 communities in the product · you're in 2"],
    ['in all of them', [mine, alsoMine], "All 2 communities in the product · you're in all of them"],
    ['in none', [theirs], "The 1 community in the product · you're in none"],
    ['the only one, joined', [mine], "The 1 community in the product · you're in it"],
  ])('%s', (_case, communities, expected) => {
    expect(adminCommunitiesCaption(communities as Community[] | null, 'viewer')).toBe(expected)
  })
})
