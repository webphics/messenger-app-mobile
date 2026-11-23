import { parseOrganizationMembers } from '@/lib/org-parse'

describe('parseOrganizationMembers', () => {
  it.each([
    ['a named member', { id: 'u-1', name: 'Jonah Reed', role: 'agent' }, { id: 'u-1', name: 'Jonah Reed', role: 'agent' }],
    // Somebody who has not finished onboarding is a member the org list counts (CR-01).
    ['an empty name', { id: 'u-2', name: '', role: 'customer' }, { id: 'u-2', name: '', role: 'customer' }],
    ['a blank name', { id: 'u-3', name: '   ', role: 'customer' }, { id: 'u-3', name: '', role: 'customer' }],
    ['a null name', { id: 'u-4', name: null, role: 'customer' }, { id: 'u-4', name: '', role: 'customer' }],
    ['a missing name', { id: 'u-5', role: 'admin' }, { id: 'u-5', name: '', role: 'admin' }],
    ['a padded name', { id: 'u-6', name: ' Ada ', role: 'agent' }, { id: 'u-6', name: 'Ada', role: 'agent' }],
  ])('keeps %s', (_label, row, expected) => {
    expect(parseOrganizationMembers({ rows: [row] })).toEqual([expected])
  })

  it.each([
    ['no id', { name: 'Jonah', role: 'agent' }],
    ['an empty id', { id: '', name: 'Jonah', role: 'agent' }],
    ['no role', { id: 'u-1', name: 'Jonah' }],
    ['a row that is not an object', 'u-1'],
  ])('drops a row with %s', (_label, row) => {
    expect(parseOrganizationMembers({ rows: [row] })).toEqual([])
  })

  it('keeps every readable row, so the list matches the organization count', () => {
    const rows = [
      { id: 'a', name: 'Ada', role: 'admin' },
      { id: 'b', name: '', role: 'customer' },
      { id: 'c', name: 'Cy', role: 'agent' },
    ]
    expect(parseOrganizationMembers({ rows })).toHaveLength(3)
  })
})
