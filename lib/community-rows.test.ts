import {
  fromCommunityGroupRows,
  fromCommunityRows,
  toCommunityGroupRows,
  toCommunityRows,
} from '@/lib/community-rows'
import type { Community, CommunityFeedRow } from '@/lib/types'

function community(overrides: Partial<Community> = {}): Community {
  return {
    id: 'community-1',
    name: 'Acme',
    description: null,
    avatarUrl: null,
    memberCount: 2,
    linkedGroupCount: 1,
    memberIds: ['viewer'],
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

const announcements: CommunityFeedRow = {
  kind: 'announcements',
  id: 'announcements-1',
  title: 'Announcements',
  lastMessageAt: null,
  lastMessagePreview: null,
  unreadCount: 0,
}

const joined: CommunityFeedRow = {
  kind: 'member_group',
  id: 'group-1',
  title: 'Releases',
  avatarUrl: null,
  lastMessageAt: '2026-09-14T10:00:00.000Z',
  lastMessagePreview: 'Shipping Friday',
  unreadCount: 2,
  muted: true,
  joinPolicy: 'open',
}

describe('community rows', () => {
  it('writes a Community under the person it belongs to, and reads it back whole', () => {
    const rows = toCommunityRows('viewer', [community()], new Set())
    expect(rows[0]).toMatchObject({ id: 'community-1', owner_id: 'viewer', expanded: 0 })
    expect(fromCommunityRows(rows).communities).toEqual([community()])
  })

  it('keeps which Communities were open, because an expansion survives a relaunch', () => {
    const rows = toCommunityRows(
      'viewer',
      [community({ id: 'a', name: 'A' }), community({ id: 'b', name: 'B' })],
      new Set(['b']),
    )

    expect([...fromCommunityRows(rows).expanded]).toEqual(['b'])
  })

  it('reads back in the order the tab shows, whatever order the rows came in', () => {
    const rows = toCommunityRows(
      'viewer',
      [community({ id: 'z', name: 'Zed' }), community({ id: 'a', name: 'Acme' })],
      new Set(),
    )

    expect(fromCommunityRows(rows).communities.map((row) => row.id)).toEqual(['a', 'z'])
  })

  it.each([
    ['a row with no payload at all', { id: 'x', owner_id: 'viewer', expanded: 0 }],
    ['a payload that is not JSON', { payload: 'not json', expanded: 0 }],
    ['a payload this build cannot read', { payload: JSON.stringify({ nothing: true }), expanded: 0 }],
  ])('drops %s rather than the tab', (_name, row) => {
    expect(fromCommunityRows([row, ...toCommunityRows('viewer', [community()], new Set())])).toMatchObject(
      { communities: [community()] },
    )
  })

  it('has nothing to restore from nothing', () => {
    expect(fromCommunityRows([])).toEqual({ communities: [], expanded: new Set() })
  })
})

describe('community group rows', () => {
  it('keeps the feed the API answered with, in its order', () => {
    const rows = toCommunityGroupRows('viewer', 'community-1', [announcements, joined])
    expect(rows.map((row) => row.position)).toEqual([0, 1])
    expect(rows[0]).toMatchObject({ community_id: 'community-1', owner_id: 'viewer' })
    expect(fromCommunityGroupRows(rows)).toEqual([announcements, joined])
  })

  it('reads a Group back with everything a row draws, muted included', () => {
    const rows = toCommunityGroupRows('viewer', 'community-1', [joined])
    expect(fromCommunityGroupRows(rows)[0]).toEqual(joined)
  })

  it('drops a row it cannot read rather than the feed', () => {
    const rows = [
      { payload: 'not json' },
      ...toCommunityGroupRows('viewer', 'community-1', [joined]),
    ]

    expect(fromCommunityGroupRows(rows)).toEqual([joined])
  })
})
