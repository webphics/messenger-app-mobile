import {
  GROUP_LOOKUP_CAP,
  appendPage,
  chosenLabel,
  communityOption,
  groupLookupOf,
  groupOption,
  matchingOptions,
  organizationOption,
  settleGroupLookups,
  selectionChanged,
  toggleInSet,
  type AudienceOption,
} from '@/lib/broadcast-audience'
import type { Community, Conversation, OrganizationSummary } from '@/lib/types'

const option = (id: string, name = id, meta: string | null = null): AudienceOption => ({ id, name, meta })

describe('options', () => {
  it('names an organization and a community by their member counts', () => {
    expect(
      organizationOption({ id: 'o1', name: 'Acme', memberCount: 1 } as OrganizationSummary),
    ).toEqual({ id: 'o1', name: 'Acme', meta: '1 member' })
    expect(communityOption({ id: 'c1', name: 'Riders', memberCount: 12 } as Community)).toEqual({
      id: 'c1',
      name: 'Riders',
      meta: '12 members',
    })
  })

  it('reads a group, and nothing else, as a group row', () => {
    const group = { id: 'g1', type: 'group', title: '  Night shift ', members: [{}, {}] }
    expect(groupOption(group as unknown as Conversation)).toEqual({
      id: 'g1',
      name: 'Night shift',
      meta: '2 members',
    })
    expect(groupOption({ id: 'g2', type: 'group', title: '' } as unknown as Conversation)).toEqual({
      id: 'g2',
      name: 'Untitled group',
      meta: null,
    })
    expect(groupOption({ id: 'd1', type: 'support_dm' } as unknown as Conversation)).toBeNull()
  })
})

describe('matchingOptions', () => {
  const rows = [option('1', 'Acme', '3 members'), option('2', 'Beta'), option('3', 'acme west')]

  it('keeps every row, as the same array, for an empty search', () => {
    expect(matchingOptions(rows, '  ')).toBe(rows)
  })

  it('matches the name or the meta, ignoring case', () => {
    expect(matchingOptions(rows, 'ACME').map((row) => row.id)).toEqual(['1', '3'])
    expect(matchingOptions(rows, '3 mem').map((row) => row.id)).toEqual(['1'])
    expect(matchingOptions(rows, 'zzz')).toEqual([])
  })
})

describe('appendPage', () => {
  it('adds the next page after what is held', () => {
    expect(appendPage([option('a')], [option('b'), option('c')]).map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('keeps a row that comes back on a later page where it first was', () => {
    expect(appendPage([option('a'), option('b')], [option('b'), option('c')]).map((row) => row.id))
      .toEqual(['a', 'b', 'c'])
  })

  it('drops a row repeated within one page', () => {
    expect(appendPage([], [option('a'), option('a')])).toHaveLength(1)
  })
})

describe('toggleInSet', () => {
  it('adds and removes without touching the set it was given', () => {
    const start = new Set(['a'])
    const added = toggleInSet(start, 'b')
    const removed = toggleInSet(added, 'a')
    expect([...start]).toEqual(['a'])
    expect([...added]).toEqual(['a', 'b'])
    expect([...removed]).toEqual(['b'])
  })
})

describe('selectionChanged', () => {
  it.each([
    ['nothing chosen, nothing held', [], [], false],
    ['the same ids in another order', ['a', 'b'], ['b', 'a'], false],
    ['duplicates in what it opened with', ['a'], ['a', 'a'], false],
    ['one added', ['a', 'b'], ['a'], true],
    ['one removed', ['a'], ['a', 'b'], true],
    ['everything cleared', [], ['a'], true],
    ['one swapped for another', ['b'], ['a'], true],
  ])('%s', (_case, draft, initial, changed) => {
    expect(selectionChanged(new Set(draft), initial)).toBe(changed)
  })
})

describe('chosenLabel', () => {
  const noun = { one: 'group', many: 'groups' }
  const names = new Map([['g2', 'Night shift']])

  it.each([
    ['nothing chosen', [], 'None chosen'],
    ['one named', ['g2'], 'Night shift'],
    ['a named one and more', ['g1', 'g2', 'g3'], 'Night shift and 2 more'],
    ['none named', ['g1'], '1 group'],
    ['several, none named', ['g1', 'g3'], '2 groups'],
  ])('%s', (_case, ids, expected) => {
    expect(chosenLabel(ids, names, noun)).toBe(expected)
  })
})

describe('reused groups', () => {
  const group = { id: 'g1', type: 'group', title: 'Night shift' } as unknown as Conversation

  it('reads each lookup', () => {
    expect(groupLookupOf('g1', { ok: true, value: group })).toEqual({
      id: 'g1',
      outcome: 'found',
      name: 'Night shift',
    })
    expect(
      groupLookupOf('g1', {
        ok: false,
        failure: { kind: 'refused', message: 'Gone', code: 'conversation_not_found' },
      }),
    ).toEqual({ id: 'g1', outcome: 'gone' })
    expect(groupLookupOf('g1', { ok: false, failure: { kind: 'unreachable' } })).toEqual({
      id: 'g1',
      outcome: 'unknown',
    })
    expect(
      groupLookupOf('g1', { ok: false, failure: { kind: 'refused', message: 'No', code: 'forbidden' } }),
    ).toEqual({ id: 'g1', outcome: 'unknown' })
  })

  it('knows which groups still exist when every lookup answered', () => {
    const settled = settleGroupLookups(2, [
      { id: 'g1', outcome: 'found', name: 'Night shift' },
      { id: 'g2', outcome: 'gone' },
    ])
    expect(settled.known && [...settled.known]).toEqual(['g1'])
    expect(settled.names.get('g1')).toBe('Night shift')
  })

  it('removes nothing when any lookup could not answer, but keeps the names it learned', () => {
    const settled = settleGroupLookups(2, [
      { id: 'g1', outcome: 'found', name: 'Night shift' },
      { id: 'g2', outcome: 'unknown' },
    ])
    expect(settled.known).toBeNull()
    expect(settled.names.get('g1')).toBe('Night shift')
  })

  it('removes nothing past the lookup cap', () => {
    expect(settleGroupLookups(GROUP_LOOKUP_CAP + 1, []).known).toBeNull()
  })
})
