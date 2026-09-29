import {
  ADMIN_ONLY_CAPABILITIES,
  CAPABILITIES,
  can,
  canAny,
  parseCapabilities,
  type Capability,
} from '@/lib/capabilities'

function viewer(...capabilities: Capability[]) {
  return { capabilities }
}

test('eight are admin-only: delete any, the workspace four and the two reached only from the Users page', () => {
  expect(ADMIN_ONLY_CAPABILITIES).toEqual([
    'delete_messages',
    'delete_conversation',
    'manage_wall_contributors',
    'manage_memberships',
    'manage_users',
    'change_roles',
    'manage_permissions',
    'manage_team',
  ])
})

describe('parseCapabilities', () => {
  test('keeps every name this build knows, in the order sent', () => {
    expect(parseCapabilities(['close', 'transfer', 'send_broadcasts'])).toEqual([
      'close',
      'transfer',
      'send_broadcasts',
    ])
  })

  test('drops names this build does not know, and entries that are not strings, rather than failing the list', () => {
    expect(parseCapabilities(['close', 'create_labels', 'fly', 1, null, {}, 'staff_dm'])).toEqual([
      'close',
      'staff_dm',
    ])
  })

  test.each([
    ['missing', undefined],
    ['a string', 'close'],
  ])('%s reads as holding nothing', (_label, value) => {
    expect(parseCapabilities(value)).toEqual([])
  })
})

describe('can', () => {
  test('yes when the viewer holds it, no when the viewer does not', () => {
    expect(can(viewer('transfer', 'close'), 'close')).toBe(true)
    expect(can(viewer('transfer', 'close'), 'send_broadcasts')).toBe(false)
  })

  test('nobody signed in may do nothing', () => {
    expect(can(null, 'transfer')).toBe(false)
    expect(can(undefined, 'transfer')).toBe(false)
  })
})

describe('canAny', () => {
  test('an empty list is never satisfied, even for a viewer holding everything', () => {
    expect(canAny(viewer(...CAPABILITIES), [])).toBe(false)
    expect(canAny(viewer('change_roles'), ['manage_users', 'change_roles'])).toBe(true)
  })
})
