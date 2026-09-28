import { activityActorName, describeActivity } from '@/lib/activity-copy'
import { parseActivityEvent, parseActivityPage } from '@/lib/activity-parse'
import type { ActivityEvent } from '@/lib/types'

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

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return parseActivityEvent({ ...ROW, ...overrides })!
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

describe('describeActivity', () => {
  test.each<[string, Partial<ActivityEvent>, string]>([
    ['a named actor and target', {}, 'Jonah Reed closed the conversation Luis Ferreira'],
    ['a gone actor', { actor: null }, 'A deleted account closed the conversation Luis Ferreira'],
    [
      'the system',
      { actorRole: 'system', actor: null, kind: 'wall.post_removed' },
      'The system removed a Wall post',
    ],
    ['a gone target', { targetLabel: null }, 'Jonah Reed closed a conversation'],
    [
      'a permissions change',
      {
        kind: 'user.permissions_changed',
        target: { id: 'agent-2', name: 'Priya Shah', role: 'agent' },
        metadata: { granted: ['message_customers', 'delete_own_messages'], revoked: ['staff_dm'] },
      },
      'Jonah Reed granted message customers and delete own messages and revoked staff dm for Priya Shah',
    ],
    ['a kind this build has no sentence for', { kind: 'team.archived' }, 'Team archived'],
    ['a kind named like an object property', { kind: 'constructor' }, 'Constructor'],
  ])('%s', (_label, overrides, sentence) => {
    expect(describeActivity(event(overrides))).toBe(sentence)
  })
})

describe('activityActorName', () => {
  test('whoever did it', () => {
    expect(activityActorName(event())).toBe('Jonah Reed')
  })

  test('nobody for the system or a gone account', () => {
    expect(activityActorName(event({ actorRole: 'system', actor: null }))).toBeNull()
    expect(activityActorName(event({ actor: null }))).toBeNull()
  })
})
