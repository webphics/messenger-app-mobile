import { activityActorName, describeActivity, formatCapabilityList } from '@/lib/activity-copy'
import { activityKinds, type ActivityEvent, type ActivityPerson } from '@/lib/types'

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

/** `community.group_unlinked` → `Community group unlinked`, the fallback's shape. */
function slug(kind: string): string {
  const words = kind.replace(/[._]/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

describe('describeActivity', () => {
  test.each(activityKinds)('%s has a sentence of its own, not the slug', (kind) => {
    expect(describeActivity(event({ kind }))).not.toBe(slug(kind))
  })

  describe('who did it', () => {
    test.each<[string, Partial<ActivityEvent>, string]>([
      ['a named actor', {}, 'Jonah Reed closed the conversation Luis Ferreira'],
      [
        'an account that has since gone',
        { actor: null },
        'A deleted account closed the conversation Luis Ferreira',
      ],
      [
        'the system, even where an actor is attached',
        { actorRole: 'system' },
        'The system closed the conversation Luis Ferreira',
      ],
      [
        'the system with nobody attached',
        { actorRole: 'system', actor: null, kind: 'wall.post_removed' },
        'The system removed a Wall post',
      ],
    ])('%s', (_label, overrides, sentence) => {
      expect(describeActivity(event(overrides))).toBe(sentence)
    })
  })

  test.each<[string, Partial<ActivityEvent>, string]>([
    // Conversations
    ['a conversation by name', { kind: 'conversation.engaged' }, 'Jonah Reed engaged the conversation Luis Ferreira'],
    ['a conversation that has gone', { targetLabel: null }, 'Jonah Reed closed a conversation'],
    [
      'an unassignment, which puts the thread first',
      { kind: 'conversation.unassigned' },
      'the conversation Luis Ferreira returned to unassigned after a membership removal by Jonah Reed',
    ],
    [
      'a priority set for the first time',
      { kind: 'conversation.priority_changed', metadata: { toPriority: 'high' } },
      'Jonah Reed set the conversation Luis Ferreira to high priority',
    ],
    [
      'a priority moved from one rung to another',
      { kind: 'conversation.priority_changed', metadata: { fromPriority: 'low', toPriority: 'high' } },
      'Jonah Reed moved the conversation Luis Ferreira from low to high priority',
    ],
    [
      'a priority change with no rungs recorded',
      { kind: 'conversation.priority_changed' },
      'Jonah Reed changed the priority of the conversation Luis Ferreira',
    ],

    // Groups
    [
      'a group by its live label',
      { kind: 'group.created', targetType: 'group', targetLabel: 'Night shift' },
      'Jonah Reed created the group Night shift',
    ],
    [
      'a group by the title frozen at write time',
      { kind: 'group.created', targetType: 'group', targetLabel: null, metadata: { title: 'Night shift' } },
      'Jonah Reed created the group Night shift',
    ],
    [
      'a group nobody can name',
      { kind: 'group.member_left', targetType: 'group', targetLabel: null },
      'Jonah Reed left a group',
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
      'a group write policy',
      { kind: 'group.write_policy_changed', targetType: 'group', targetLabel: 'Night shift', metadata: { writePolicy: 'admins' } },
      'Jonah Reed limited posting in the group Night shift to admins',
    ],
    [
      'a group write policy this build does not know',
      { kind: 'group.write_policy_changed', targetType: 'group', targetLabel: 'Night shift', metadata: { writePolicy: 'robots' } },
      'Jonah Reed changed who can post in the group Night shift',
    ],
    [
      'a cancelled join request, which names nobody',
      { kind: 'group.join_request_cancelled', targetType: 'group', targetLabel: 'Night shift' },
      'A request to join the group Night shift was cancelled',
    ],
    [
      'a group photo removed',
      { kind: 'group.avatar_changed', targetType: 'group', targetLabel: 'Night shift', metadata: { cleared: true } },
      'Jonah Reed removed the photo from the group Night shift',
    ],

    // Communities
    [
      'a community by the name frozen at write time',
      { kind: 'community.group_unlinked', targetType: 'community', targetLabel: null, metadata: { name: 'Support' } },
      'Jonah Reed unlinked a group from the community Support',
    ],

    // Accounts
    [
      'an account created with a role',
      { kind: 'user.created', targetType: 'user', target: PRIYA, metadata: { role: 'agent' } },
      'Jonah Reed created the account Priya Shah as agent',
    ],
    [
      'a deleted account described by the role frozen into it',
      { kind: 'user.deleted', targetType: 'user', target: null, metadata: { role: 'admin' } },
      'Jonah Reed deleted an admin account',
    ],
    [
      'a role change',
      { kind: 'user.role_changed', targetType: 'user', target: PRIYA, metadata: { fromRole: 'agent', toRole: 'admin' } },
      'Jonah Reed changed Priya Shah from agent to admin',
    ],
    [
      'a ban on an account that has since gone, with a reason',
      { kind: 'user.banned', targetType: 'user', target: null, metadata: { reason: 'spam' } },
      'Jonah Reed banned a since-deleted account — spam',
    ],
    [
      'one session revoked',
      { kind: 'user.sessions_revoked', targetType: 'user', target: PRIYA, metadata: { revokedCount: 1 } },
      'Jonah Reed revoked 1 session for Priya Shah',
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
    [
      'permissions saved with nothing changed',
      { kind: 'user.permissions_changed', targetType: 'user', target: PRIYA },
      'Jonah Reed saved permissions for Priya Shah without changing them',
    ],

    // The Team, organizations, invitations and memberships
    [
      'the Team renamed',
      { kind: 'team.renamed', targetType: 'team', metadata: { fromName: 'Acme', toName: 'Acme Support' } },
      'Jonah Reed renamed the Team from “Acme” to “Acme Support”',
    ],
    [
      'an organization renamed',
      { kind: 'organization.updated', targetType: 'organization', metadata: { fromName: 'Talo', toName: 'Talo EU' } },
      'Jonah Reed renamed the organization “Talo” to “Talo EU”',
    ],
    [
      'an organization deleted by name',
      { kind: 'organization.deleted', targetType: 'organization', targetLabel: 'Talo' },
      'Jonah Reed deleted the organization Talo',
    ],
    [
      'an invitation, whose organization rides in metadata',
      { kind: 'invitation.sent', targetType: 'user', target: PRIYA, metadata: { organizationName: 'Talo' } },
      'Jonah Reed invited Priya Shah to the organization Talo',
    ],
    [
      'a membership in an organization nobody can name',
      { kind: 'membership.removed', targetType: 'user', target: PRIYA },
      'Jonah Reed removed Priya Shah from an organization',
    ],

    // The Wall
    [
      'a Wall contributor named by the target label',
      { kind: 'wall.contributor_granted', targetType: 'user', target: null, targetLabel: 'Priya Shah' },
      'Jonah Reed let Priya Shah post on the Wall',
    ],
    [
      'a Wall contributor nobody can name',
      { kind: 'wall.contributor_revoked', targetType: 'user', target: null, targetLabel: null },
      'Jonah Reed stopped a member posting on the Wall',
    ],
    ['a Post', { kind: 'wall.post_edited', targetType: 'wall_post' }, 'Jonah Reed edited a Wall post'],
  ])('%s', (_label, overrides, sentence) => {
    expect(describeActivity(event(overrides))).toBe(sentence)
  })

  describe('a kind this build has no sentence for', () => {
    test.each<[string, string, string]>([
      ['a newer server', 'team.archived', 'Team archived'],
      ['underscores and dots', 'community.group_archived', 'Community group archived'],
      ['a name like an object property', 'constructor', 'Constructor'],
      ['an inherited method', 'toString', 'ToString'],
    ])('%s: %s reads as %s', (_label, kind, sentence) => {
      expect(describeActivity(event({ kind }))).toBe(sentence)
    })
  })
})

describe('formatCapabilityList', () => {
  test.each<[string[], string]>([
    [[], ''],
    [['staff_dm'], 'staff dm'],
    [['staff_dm', 'close'], 'staff dm and close'],
    [['staff_dm', 'close', 'manage_labels'], 'staff dm, close, and manage labels'],
  ])('%j → %s', (capabilities, sentence) => {
    expect(formatCapabilityList(capabilities)).toBe(sentence)
  })
})

describe('activityActorName', () => {
  test.each<[string, Partial<ActivityEvent>, string | null]>([
    ['whoever did it', {}, 'Jonah Reed'],
    ['nobody for an account that has since gone', { actor: null }, null],
    ['nobody for the system', { actorRole: 'system', actor: null }, null],
    ['nobody for the system, even with an actor attached', { actorRole: 'system' }, null],
  ])('%s', (_label, overrides, name) => {
    expect(activityActorName(event(overrides))).toBe(name)
  })
})
