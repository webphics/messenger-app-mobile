import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  NO_AUDIENCE,
  audienceSize,
  audienceSummary,
  broadcastDraftProblem,
  toggleAudience,
} from '@/lib/broadcast-draft'

const SOMEONE = { ...NO_AUDIENCE, organizationIds: ['o1'] }

describe('broadcastDraftProblem', () => {
  it('accepts a titled message with an audience', () => {
    expect(broadcastDraftProblem({ title: 'Hi', body: 'There', audience: SOMEONE })).toBeNull()
  })

  it.each([
    ['no title', { title: '   ', body: 'x', audience: SOMEONE }, 'Give the announcement a title.'],
    ['no message', { title: 'x', body: '', audience: SOMEONE }, 'Write the announcement.'],
    ['nobody chosen', { title: 'x', body: 'y', audience: NO_AUDIENCE }, 'Choose at least one organization, community or group.'],
  ])('refuses %s', (_case, draft, expected) => {
    expect(broadcastDraftProblem(draft)).toBe(expected)
  })

  it('refuses a title or a message past the API limits', () => {
    expect(
      broadcastDraftProblem({ title: 'x'.repeat(BROADCAST_TITLE_MAX + 1), body: 'y', audience: SOMEONE }),
    ).toMatch(/title/)
    expect(
      broadcastDraftProblem({ title: 'x', body: 'y'.repeat(BROADCAST_BODY_MAX + 1), audience: SOMEONE }),
    ).toMatch(/announcement to/)
  })
})

describe('audience helpers', () => {
  it('toggles an id in and out of one kind', () => {
    const once = toggleAudience(NO_AUDIENCE, 'communityIds', 'c1')
    expect(once.communityIds).toEqual(['c1'])
    expect(toggleAudience(once, 'communityIds', 'c1').communityIds).toEqual([])
  })

  it('counts and names what was picked', () => {
    const audience = { ...NO_AUDIENCE, organizationIds: ['o1', 'o2'], communityIds: ['c1'], groupIds: ['g1'] }
    expect(audienceSize(audience)).toBe(4)
    expect(audienceSummary(audience)).toBe('2 organizations, 1 community and 1 group')
    expect(audienceSummary({ ...NO_AUDIENCE, groupIds: ['g1', 'g2'] })).toBe('2 groups')
    expect(audienceSummary(NO_AUDIENCE)).toBe('Nobody yet')
  })
})
