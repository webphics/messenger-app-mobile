import { organizationPill, reachableSelection, toggleOrganization } from '@/lib/organization-filter'

const NORTH = { id: 'n', name: 'North' }
const SOUTH = { id: 's', name: 'South' }

describe('organizationPill', () => {
  test('offers nothing to somebody with no organization', () => {
    expect(organizationPill([], ['n'])).toEqual({ kind: 'none' })
  })

  test('names the one organization, on or off', () => {
    expect(organizationPill([NORTH], [])).toEqual({ kind: 'single', organization: NORTH, active: false })
    expect(organizationPill([NORTH], ['n'])).toEqual({ kind: 'single', organization: NORTH, active: true })
  })

  test('counts the picks among several, ignoring unreachable ones', () => {
    expect(organizationPill([NORTH, SOUTH], ['n', 's'])).toEqual({
      kind: 'many',
      selectedCount: 2,
      active: true,
    })
    expect(organizationPill([NORTH, SOUTH], ['gone'])).toEqual({
      kind: 'many',
      selectedCount: 0,
      active: false,
    })
  })
})

test('reachableSelection keeps only reachable ids, in order', () => {
  expect(reachableSelection(['s', 'gone', 'n'], [NORTH, SOUTH])).toEqual(['s', 'n'])
})

test('toggleOrganization adds and removes', () => {
  expect(toggleOrganization(['n'], 's')).toEqual(['n', 's'])
  expect(toggleOrganization(['n', 's'], 'n')).toEqual(['s'])
})
