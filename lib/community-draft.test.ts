import { COMMUNITY_NAME_MAX, communityDraftProblem } from '@/lib/community-draft'

const NEW = { name: 'Riverside', description: '', creating: true, organizationId: 'o1', memberIds: ['u1'] }

describe('communityDraftProblem', () => {
  it('accepts a named Community with an organization and a member', () => {
    expect(communityDraftProblem(NEW)).toBeNull()
  })

  it.each([
    ['no name', { ...NEW, name: ' ' }, 'Give the community a name.'],
    ['no organization', { ...NEW, organizationId: null }, 'Choose the organization it belongs to.'],
    ['no members', { ...NEW, memberIds: [] }, 'Add at least one member.'],
  ])('refuses a new Community with %s', (_case, draft, expected) => {
    expect(communityDraftProblem(draft)).toBe(expected)
  })

  it('refuses a name past the API limit', () => {
    expect(communityDraftProblem({ ...NEW, name: 'x'.repeat(COMMUNITY_NAME_MAX + 1) })).toMatch(/name/)
  })

  it('asks an edit for a name only, since organization and members are not changed there', () => {
    expect(
      communityDraftProblem({ name: 'Renamed', description: '', creating: false, organizationId: null, memberIds: [] }),
    ).toBeNull()
  })
})
