import { parseManagedUser, parseStaffPermissions } from '@/lib/user-parse'

const ROW = { id: 'user-1', email: 'jonah@talo.test', role: 'admin' }

describe('parseManagedUser', () => {
  test('an older API that sends no manageable flag leaves the row manageable', () => {
    expect(parseManagedUser(ROW)?.manageable).toBe(true)
  })

  test('manageable false is read as false', () => {
    expect(parseManagedUser({ ...ROW, manageable: false })?.manageable).toBe(false)
  })

  test('roleEditable is true only for a literal true', () => {
    expect(parseManagedUser({ ...ROW, roleEditable: true })?.roleEditable).toBe(true)
    expect(parseManagedUser({ ...ROW, roleEditable: 'yes' })?.roleEditable).toBe(false)
  })
})

describe('parseStaffPermissions', () => {
  test('drops capability names this build does not know', () => {
    expect(
      parseStaffPermissions({
        role: 'admin',
        capabilities: ['manage_users', 'create_labels', 7],
        editable: ['fly', 'change_roles'],
      }),
    ).toEqual({ role: 'admin', capabilities: ['manage_users'], editable: ['change_roles'] })
  })

  test('a body without a known role is not a permissions payload', () => {
    expect(parseStaffPermissions({ role: 'owner', capabilities: [], editable: [] })).toBeNull()
  })
})
