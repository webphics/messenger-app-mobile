import { parseManagedUser, parseManagedUsers, parseStaffPermissions } from '@/lib/user-parse'

const ROW = { id: 'user-1', email: 'jonah@talo.test', role: 'admin' }

describe('parseManagedUser manageable', () => {
  test('an older API that sends no flag leaves the row manageable', () => {
    expect(parseManagedUser(ROW)?.manageable).toBe(true)
  })

  test('false is read as false', () => {
    expect(parseManagedUser({ ...ROW, manageable: false })?.manageable).toBe(false)
  })

  test('true is read as true', () => {
    expect(parseManagedUser({ ...ROW, manageable: true })?.manageable).toBe(true)
  })

  test('a page keeps each row flag', () => {
    const page = { rows: [ROW, { ...ROW, id: 'user-2', manageable: false }] }
    expect(parseManagedUsers(page).map((row) => row.manageable)).toEqual([true, false])
  })
})

describe('parseStaffPermissions', () => {
  test('reads the role, the held set and the editable set', () => {
    expect(
      parseStaffPermissions({
        role: 'agent',
        capabilities: ['transfer', 'close'],
        editable: ['transfer', 'take_over'],
      }),
    ).toEqual({
      role: 'agent',
      capabilities: ['transfer', 'close'],
      editable: ['transfer', 'take_over'],
    })
  })

  test('drops capability names this build does not know', () => {
    expect(
      parseStaffPermissions({
        role: 'admin',
        capabilities: ['manage_users', 'create_labels', 7],
        editable: ['fly', 'change_roles'],
      }),
    ).toEqual({ role: 'admin', capabilities: ['manage_users'], editable: ['change_roles'] })
  })

  test('a missing editable list means the viewer may edit nothing', () => {
    expect(parseStaffPermissions({ role: 'agent', capabilities: ['close'] })?.editable).toEqual([])
  })

  test('a body without a known role is not a permissions payload', () => {
    expect(parseStaffPermissions({ capabilities: [], editable: [] })).toBeNull()
    expect(parseStaffPermissions({ role: 'owner', capabilities: [], editable: [] })).toBeNull()
    expect(parseStaffPermissions(null)).toBeNull()
  })

  test('a body without a held list is not a permissions payload', () => {
    expect(parseStaffPermissions({ role: 'agent', editable: [] })).toBeNull()
  })

  test('the old agentPermissions shape is not read', () => {
    expect(parseStaffPermissions({ role: 'agent', agentPermissions: ['transfer'] })).toBeNull()
  })
})
