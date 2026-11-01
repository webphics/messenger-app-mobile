import {
  blockedIdSet,
  parseBlockedPeople,
  parseBlockedPerson,
  parseUnblocked,
  unblockedSince,
  withBlockedPerson,
  withoutBlockedPerson,
  type BlockedPerson,
} from '@/lib/blocked-people'

const row = (id: string) => ({
  user: { id, name: id.toUpperCase(), image: null },
  blockedAt: '2026-10-31T10:00:00.000Z',
})

const person = (id: string): BlockedPerson => parseBlockedPerson(row(id))!

describe('reading blocks', () => {
  it('reads a row', () => {
    expect(parseBlockedPerson(row('u-1'))).toEqual({
      id: 'u-1',
      name: 'U-1',
      image: null,
      blockedAt: '2026-10-31T10:00:00.000Z',
    })
  })

  it.each([
    ['no user', { blockedAt: '2026-10-31T10:00:00.000Z' }],
    ['no time', { user: { id: 'u-1', name: 'A' } }],
    ['no name', { user: { id: 'u-1' }, blockedAt: '2026-10-31T10:00:00.000Z' }],
  ])('answers null for %s', (_, data) => {
    expect(parseBlockedPerson(data)).toBeNull()
  })

  it('keeps the readable rows of a list, and refuses a body with none', () => {
    expect(parseBlockedPeople({ rows: [row('u-1'), { nope: true }] })?.map(p => p.id)).toEqual(['u-1'])
    expect(parseBlockedPeople([])).toBeNull()
  })

  it('reads an unblock', () => {
    expect(parseUnblocked({ userId: 'u-1' })).toEqual({ userId: 'u-1' })
    expect(parseUnblocked({})).toBeNull()
  })
})

describe('the list', () => {
  it('puts a new block first and never holds anybody twice', () => {
    const list = [person('a'), person('b')]
    expect(withBlockedPerson(list, person('b')).map(p => p.id)).toEqual(['b', 'a'])
    expect(withBlockedPerson(list, person('c')).map(p => p.id)).toEqual(['c', 'a', 'b'])
  })

  it('removes an unblocked person, and leaves the list alone for anybody absent', () => {
    expect(withoutBlockedPerson([person('a'), person('b')], 'a').map(p => p.id)).toEqual(['b'])
    expect(withoutBlockedPerson([person('a')], 'z').map(p => p.id)).toEqual(['a'])
  })

  it('answers the ids the screens filter by', () => {
    expect([...blockedIdSet([person('a'), person('b')])]).toEqual(['a', 'b'])
  })
})

describe('unblockedSince', () => {
  it.each([
    ['somebody left the list', ['ada', 'bo'], ['bo'], true],
    ['the last person left it', ['ada'], [], true],
    ['somebody was added', ['ada'], ['ada', 'bo'], false],
    ['nothing changed', ['ada'], ['ada'], false],
    ['one swapped for another', ['ada'], ['bo'], true],
    ['it was and is empty', [], [], false],
  ])('%s → %s', (_label, before, after, expected) => {
    expect(unblockedSince(new Set(before), new Set(after))).toBe(expected)
  })
})
