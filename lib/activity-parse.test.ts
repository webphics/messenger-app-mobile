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
    ['a time that is not one', { at: 'yesterday' }],
  ])('a row with %s is dropped', (_label, overrides) => {
    expect(parseActivityEvent({ ...ROW, ...overrides })).toBeNull()
  })

  test('a kind this build has never heard of is kept, not dropped', () => {
    expect(parseActivityEvent({ ...ROW, kind: 'team.archived' })?.kind).toBe('team.archived')
  })
})

describe('parseActivityPage', () => {
  test('drops unreadable rows one at a time', () => {
    const page = parseActivityPage({ rows: [ROW, { id: 'evt-2' }, null], total: 3 })
    expect(page?.events.map((row) => row.id)).toEqual(['evt-1'])
  })

  test('a body with no rows is not this payload', () => {
    expect(parseActivityPage({ total: 0 })).toBeNull()
  })
})
