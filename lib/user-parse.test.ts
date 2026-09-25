import { parseManagedUser, parseManagedUsers } from '@/lib/user-parse'

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
