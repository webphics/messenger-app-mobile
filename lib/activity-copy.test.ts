import { activityActorName, describeActivity, formatCapabilityList } from '@/lib/activity-copy'
import type { ActivityEvent, ActivityPerson } from '@/lib/types'

const JONAH: ActivityPerson = { id: 'agent-1', name: 'Jonah Reed', role: 'agent' }
const PRIYA: ActivityPerson = { id: 'agent-2', name: 'Priya Shah', role: 'agent' }

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'evt-1',
    kind: 'conversation.closed',
    actorRole: 'agent',
    actor: JONAH,
    targetType: 'conversation',
    target: null,
    targetLabel: 'Luis Ferreira',
    metadata: {},
    at: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('describeActivity', () => {

  describe('who did it', () => {
    test.each<[string, Partial<ActivityEvent>, string]>([
      ['a named actor', {}, 'Jonah Reed closed the conversation Luis Ferreira'],
      [
        'the system, even where an actor is attached',
        { actorRole: 'system' },
        'The system closed the conversation Luis Ferreira',
      ],
    ])('%s', (_label, overrides, sentence) => {
      expect(describeActivity(event(overrides))).toBe(sentence)
    })
  })

  test.each<[string, Partial<ActivityEvent>, string]>([
    [
      'a priority moved from one rung to another',
      { kind: 'conversation.priority_changed', metadata: { fromPriority: 'low', toPriority: 'high' } },
      'Jonah Reed moved the conversation Luis Ferreira from low to high priority',
    ],
    [
      'a group whose name and description changed',
      {
        kind: 'group.updated',
        targetType: 'group',
        targetLabel: 'Night shift',
        metadata: { titleChanged: true, descriptionChanged: true },
      },
      'Jonah Reed changed the name and description of the group Night shift',
    ],
    [
      'a permissions change',
      {
        kind: 'user.permissions_changed',
        targetType: 'user',
        target: PRIYA,
        metadata: { granted: ['message_customers', 'delete_own_messages'], revoked: ['staff_dm'] },
      },
      'Jonah Reed granted message customers and delete own messages and revoked staff dm for Priya Shah',
    ],
  ])('%s', (_label, overrides, sentence) => {
    expect(describeActivity(event(overrides))).toBe(sentence)
  })

  describe('a kind this build has no sentence for', () => {
    test.each<[string, string, string]>([
      ['a newer server', 'team.archived', 'Team archived'],
      ['a name like an object property', 'constructor', 'Constructor'],
    ])('%s: %s reads as %s', (_label, kind, sentence) => {
      expect(describeActivity(event({ kind }))).toBe(sentence)
    })
  })
})

describe('formatCapabilityList', () => {
  test.each<[string[], string]>([
    [['staff_dm', 'close', 'manage_labels'], 'staff dm, close, and manage labels'],
  ])('%j → %s', (capabilities, sentence) => {
    expect(formatCapabilityList(capabilities)).toBe(sentence)
  })
})

describe('activityActorName', () => {
  test.each<[string, Partial<ActivityEvent>, string | null]>([
    ['whoever did it', {}, 'Jonah Reed'],
    ['nobody for the system, even with an actor attached', { actorRole: 'system' }, null],
  ])('%s', (_label, overrides, name) => {
    expect(activityActorName(event(overrides))).toBe(name)
  })
})
