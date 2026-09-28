import {
  ADMIN_ONLY_CAPABILITIES,
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ORGANIZATIONS_SCREEN_CAPABILITIES,
  USERS_SCREEN_CAPABILITIES,
  can,
  canAny,
  isCapability,
  parseCapabilities,
  type Capability,
} from '@/lib/capabilities'

function viewer(...capabilities: Capability[]) {
  return { capabilities }
}

describe('CAPABILITIES', () => {
  test('all 30, grouped the way the spec lists them', () => {
    expect(CAPABILITIES).toHaveLength(30)
    expect(Object.keys(CAPABILITY_GROUPS)).toEqual([
      'support',
      'groups',
      'broadcasts',
      'reporting',
      'workspace',
    ])
    expect(Object.values(CAPABILITY_GROUPS).flat()).toEqual(CAPABILITIES)
  })

  test('no name appears twice', () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length)
  })

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

  test('the Accounts screen opens on any of the three that act on people', () => {
    expect(USERS_SCREEN_CAPABILITIES).toEqual(['manage_users', 'change_roles', 'manage_permissions'])
  })

  test('the Organizations screen opens on editing them or on managing their members', () => {
    expect(ORGANIZATIONS_SCREEN_CAPABILITIES).toEqual(['manage_organizations', 'manage_memberships'])
  })

  test('deleting your own sits after deleting any, then internal notes, in the Support group', () => {
    expect(CAPABILITY_GROUPS.support).toEqual([
      'transfer',
      'close',
      'take_over',
      'manage_labels',
      'staff_dm',
      'delete_messages',
      'delete_conversation',
      'delete_own_messages',
      'delete_own_conversations',
      'internal_notes',
      'delete_any_note',
    ])
  })

  test('an agent may be granted internal notes', () => {
    expect(isCapability('internal_notes')).toBe(true)
    expect(ADMIN_ONLY_CAPABILITIES).not.toContain('internal_notes')
  })

  test('messaging customers sits after managing organizations, in the Workspace group', () => {
    expect(CAPABILITY_GROUPS.workspace.slice(0, 2)).toEqual([
      'manage_organizations',
      'message_customers',
    ])
  })

  test('an agent may be granted deleting their own, never deleting any', () => {
    expect(ADMIN_ONLY_CAPABILITIES).not.toContain('delete_own_messages')
    expect(ADMIN_ONLY_CAPABILITIES).not.toContain('delete_own_conversations')
    expect(ADMIN_ONLY_CAPABILITIES).not.toContain('message_customers')
  })

  test('create_labels is gone, folded into manage_labels', () => {
    expect(isCapability('create_labels')).toBe(false)
    expect(isCapability('manage_labels')).toBe(true)
  })
})

describe('parseCapabilities', () => {
  test('keeps every name this build knows, in the order sent', () => {
    expect(parseCapabilities(['close', 'transfer', 'send_broadcasts'])).toEqual([
      'close',
      'transfer',
      'send_broadcasts',
    ])
  })

  test('the full set survives the parse', () => {
    expect(parseCapabilities([...CAPABILITIES])).toEqual(CAPABILITIES)
  })

  test('drops names this build does not know rather than failing the list', () => {
    expect(parseCapabilities(['close', 'create_labels', 'fly', 'staff_dm'])).toEqual([
      'close',
      'staff_dm',
    ])
  })

  test('drops entries that are not strings', () => {
    expect(parseCapabilities(['close', 1, null, {}, ['transfer'], true])).toEqual(['close'])
  })

  test('a name sent twice is held once', () => {
    expect(parseCapabilities(['close', 'close'])).toEqual(['close'])
  })

  test('names are matched exactly, never trimmed or case-folded', () => {
    expect(parseCapabilities([' close', 'CLOSE', 'Transfer'])).toEqual([])
  })

  test.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'close'],
    ['a number', 29],
    ['an object', { close: true }],
  ])('%s reads as holding nothing', (_label, value) => {
    expect(parseCapabilities(value)).toEqual([])
  })
})

describe('can', () => {
  test('yes when the viewer holds it', () => {
    expect(can(viewer('transfer', 'close'), 'close')).toBe(true)
  })

  test('no when the viewer does not', () => {
    expect(can(viewer('transfer', 'close'), 'send_broadcasts')).toBe(false)
  })

  test('a customer, who holds nothing, may do nothing', () => {
    expect(can(viewer(), 'transfer')).toBe(false)
  })

  test('nobody signed in may do nothing', () => {
    expect(can(null, 'transfer')).toBe(false)
    expect(can(undefined, 'transfer')).toBe(false)
  })

  test('a viewer holding the full set may do everything', () => {
    const everything = viewer(...CAPABILITIES)
    for (const capability of CAPABILITIES) {
      expect(can(everything, capability)).toBe(true)
    }
  })
})

describe('canAny', () => {
  const USER_ROWS: Capability[] = ['manage_users', 'change_roles', 'manage_permissions']

  test('yes when the viewer holds one of them', () => {
    expect(canAny(viewer('change_roles'), USER_ROWS)).toBe(true)
  })

  test('no when the viewer holds none of them', () => {
    expect(canAny(viewer('transfer', 'close'), USER_ROWS)).toBe(false)
  })

  test('an empty list is never satisfied', () => {
    expect(canAny(viewer(...CAPABILITIES), [])).toBe(false)
  })

  test('nobody signed in may do none of them', () => {
    expect(canAny(null, USER_ROWS)).toBe(false)
  })
})
