import { parseActivityEvent, parseActivityPage } from '@/lib/activity-parse'

const ROW = {
  id: 'evt-1',
  kind: 'conversation.closed',
  actorId: 'agent-1',
  actor: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
  actorRole: 'agent',
  targetType: 'conversation',
  targetId: 'conv-1',
  target: null,
  targetLabel: 'Luis Ferreira',
  metadata: {},
  at: '2026-09-20T10:00:00.000Z',
}

describe('parseActivityEvent', () => {
  test('reads a whole row', () => {
    expect(parseActivityEvent(ROW)).toEqual({
      id: 'evt-1',
      kind: 'conversation.closed',
      actorRole: 'agent',
      actor: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
      targetType: 'conversation',
      target: null,
      targetLabel: 'Luis Ferreira',
      metadata: {},
      at: '2026-09-20T10:00:00.000Z',
    })
  })

  test.each([
    ['no id', { id: undefined }],
    ['no kind', { kind: '' }],
    ['no time', { at: undefined }],
    ['a time that is not one', { at: 'yesterday' }],
  ])('a row with %s is dropped', (_label, overrides) => {
    expect(parseActivityEvent({ ...ROW, ...overrides })).toBeNull()
  })

  test.each([
    ['null', null],
    ['an array', [ROW]],
    ['a string', 'evt-1'],
  ])('%s is not a row', (_label, value) => {
    expect(parseActivityEvent(value)).toBeNull()
  })

  test('a kind this build has never heard of is kept, not dropped', () => {
    expect(parseActivityEvent({ ...ROW, kind: 'team.archived' })?.kind).toBe('team.archived')
  })

  test.each([
    ['missing', undefined],
    ['without a name', { id: 'agent-1', role: 'agent' }],
    ['with a role this build does not know', { id: 'agent-1', name: 'Jonah', role: 'owner' }],
  ])('an actor %s reads as nobody, and the row survives', (_label, actor) => {
    const parsed = parseActivityEvent({ ...ROW, actor })
    expect(parsed).not.toBeNull()
    expect(parsed?.actor).toBeNull()
  })

  test('an unknown actor role reads as the system', () => {
    expect(parseActivityEvent({ ...ROW, actorRole: 'robot' })?.actorRole).toBe('system')
  })

  test('metadata that is not an object reads as empty', () => {
    expect(parseActivityEvent({ ...ROW, metadata: ['granted'] })?.metadata).toEqual({})
  })
})

describe('parseActivityPage', () => {
  test('reads the rows and the paging around them', () => {
    const page = parseActivityPage({ rows: [ROW], total: 41, page: 2, pageSize: 30 })
    expect(page?.events.map((row) => row.id)).toEqual(['evt-1'])
    expect(page).toMatchObject({ total: 41, page: 2, pageSize: 30 })
  })

  test('drops unreadable rows one at a time', () => {
    const page = parseActivityPage({ rows: [ROW, { id: 'evt-2' }, null], total: 3 })
    expect(page?.events.map((row) => row.id)).toEqual(['evt-1'])
  })

  test('an empty feed is an answer, not a failure', () => {
    expect(parseActivityPage({ rows: [], total: 0, page: 1, pageSize: 30 })?.events).toEqual([])
  })

  test.each([
    ['null', null],
    ['no rows', { total: 0 }],
    ['rows that are not a list', { rows: { 0: ROW } }],
  ])('%s is not this payload', (_label, value) => {
    expect(parseActivityPage(value)).toBeNull()
  })

  test('missing paging falls back to what arrived', () => {
    expect(parseActivityPage({ rows: [ROW] })).toMatchObject({ total: 1, page: 1, pageSize: 1 })
  })
})
