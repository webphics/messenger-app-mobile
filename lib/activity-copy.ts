import type { ActivityEvent } from '@/lib/types'

/**
 * One sentence per Activity kind, the web client's copy
 * (`features/activity/utils/activity-copy.ts`) carried over so a row reads the
 * same on both.
 *
 * A map rather than a prettifier over the kind string, because a feed is only
 * worth reading if it reads as sentences: "Community group unlinked" is a slug
 * with a space in it, "Dana unlinked a group from Support" is a fact.
 *
 * Two gaps are in the stored data rather than here, and the sentences say less
 * rather than guessing: a transfer stores the agents' ids and not their names,
 * and a group or community membership event stores the member's id only, so
 * the member is "a member".
 *
 * A kind this build has no sentence for falls through to a prettified slug, so
 * a newer server degrades to something readable instead of a blank row.
 */

type ActivityCopyBuilder = (event: ActivityEvent) => string

const ACTOR_FALLBACK = 'A deleted account'

function actorName(event: ActivityEvent): string {
  if (event.actorRole === 'system') return 'The system'
  return event.actor?.name ?? ACTOR_FALLBACK
}

/**
 * Only ever meaningful for `user.*` kinds — everything else targets a non-user.
 * "Since-deleted" rather than "deleted": the account existed when the action
 * was taken, and "banned a deleted account" reads as banning something already
 * gone.
 */
function targetName(event: ActivityEvent): string {
  return event.target?.name ?? 'a since-deleted account'
}

function accountLabel(event: ActivityEvent): string {
  return event.target?.name ? `the account ${event.target.name}` : 'an account'
}

/** "an agent account", from the role frozen into metadata when the account was deleted. */
function deletedAccountLabel(event: ActivityEvent): string {
  const role = metaString(event, 'role')
  if (!role) return 'an account'
  const article = /^[aeiou]/i.test(role) ? 'an' : 'a'
  return `${article} ${role} account`
}

function metaString(event: ActivityEvent, key: string): string | null {
  const value = event.metadata[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function metaNumber(event: ActivityEvent, key: string): number | null {
  const value = event.metadata[key]
  return typeof value === 'number' ? value : null
}

function metaFlag(event: ActivityEvent, key: string): boolean {
  return event.metadata[key] === true
}

function metaCapabilities(event: ActivityEvent, key: string): string[] {
  const value = event.metadata[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/**
 * The live-resolved `targetLabel` first, so a group renamed after the event
 * still reads correctly, then the name frozen into `metadata` at write time,
 * then the indefinite article.
 */
function namedTarget(event: ActivityEvent, noun: string, metadataKey: string): string {
  const label = event.targetLabel ?? metaString(event, metadataKey)
  return label ? `the ${noun} ${label}` : `a ${noun}`
}

function groupLabel(event: ActivityEvent): string {
  return namedTarget(event, 'group', 'title')
}

function communityLabel(event: ActivityEvent): string {
  return namedTarget(event, 'community', 'name')
}

function conversationLabel(event: ActivityEvent): string {
  return event.targetLabel ? `the conversation ${event.targetLabel}` : 'a conversation'
}

/** Contributor events carry only an organization id, so the person may not resolve. */
function wallContributor(event: ActivityEvent): string {
  return event.target?.name ?? event.targetLabel ?? 'a member'
}

/** Invitation and membership events target the user; the organization rides in metadata. */
function invitationOrganization(event: ActivityEvent): string {
  const name = metaString(event, 'organizationName')
  return name ? `the organization ${name}` : 'an organization'
}

/** `manage_labels` → `manage labels`. */
function formatCapability(capability: string): string {
  return capability.replace(/_/g, ' ')
}

export function formatCapabilityList(capabilities: string[]): string {
  const labels = capabilities.map(formatCapability)
  if (labels.length <= 1) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`
}

const ACTIVITY_COPY: Readonly<Record<string, ActivityCopyBuilder>> = {
  'conversation.engaged': (event) => `${actorName(event)} engaged ${conversationLabel(event)}`,
  'conversation.taken_over': (event) =>
    `${actorName(event)} took over ${conversationLabel(event)}`,
  'conversation.transferred': (event) =>
    `${actorName(event)} transferred ${conversationLabel(event)}`,
  'conversation.closed': (event) => `${actorName(event)} closed ${conversationLabel(event)}`,
  'conversation.reopened': (event) => `${actorName(event)} reopened ${conversationLabel(event)}`,
  'conversation.deleted': (event) => `${actorName(event)} deleted ${conversationLabel(event)}`,
  'conversation.unassigned': (event) =>
    `${conversationLabel(event)} returned to unassigned after a membership removal by ${actorName(event)}`,
  // Both rungs where the API sends both, so a promotion reads apart from a
  // demotion. `from` is absent the first time a thread is ever triaged.
  'conversation.priority_changed': (event) => {
    const from = metaString(event, 'fromPriority')
    const to = metaString(event, 'toPriority')
    if (!to) return `${actorName(event)} changed the priority of ${conversationLabel(event)}`
    if (!from) return `${actorName(event)} set ${conversationLabel(event)} to ${to} priority`
    return `${actorName(event)} moved ${conversationLabel(event)} from ${from} to ${to} priority`
  },
  'conversation.message_deleted': (event) =>
    `${actorName(event)} deleted a message in ${conversationLabel(event)}`,
  'conversation.message_edited': (event) =>
    `${actorName(event)} edited a message in ${conversationLabel(event)}`,
  'conversation.message_attachment_deleted': (event) =>
    `${actorName(event)} removed an attachment in ${conversationLabel(event)}`,

  'group.created': (event) => `${actorName(event)} created ${groupLabel(event)}`,
  'group.updated': (event) => {
    const changed: string[] = []
    if (metaFlag(event, 'titleChanged')) changed.push('name')
    if (metaFlag(event, 'descriptionChanged')) changed.push('description')
    if (changed.length === 0) return `${actorName(event)} updated ${groupLabel(event)}`
    return `${actorName(event)} changed the ${changed.join(' and ')} of ${groupLabel(event)}`
  },
  'group.member_added': (event) => `${actorName(event)} added a member to ${groupLabel(event)}`,
  'group.member_removed': (event) =>
    `${actorName(event)} removed a member from ${groupLabel(event)}`,
  'group.member_left': (event) => `${actorName(event)} left ${groupLabel(event)}`,
  'group.member_joined': (event) => `${actorName(event)} joined ${groupLabel(event)}`,
  'group.write_policy_changed': (event) => {
    switch (metaString(event, 'writePolicy')) {
      case 'everyone':
        return `${actorName(event)} let every member post in ${groupLabel(event)}`
      case 'admins':
        return `${actorName(event)} limited posting in ${groupLabel(event)} to admins`
      case 'named':
        return `${actorName(event)} limited posting in ${groupLabel(event)} to named members`
      default:
        return `${actorName(event)} changed who can post in ${groupLabel(event)}`
    }
  },
  'group.join_policy_changed': (event) => {
    switch (metaString(event, 'joinPolicy')) {
      case 'open':
        return `${actorName(event)} opened ${groupLabel(event)} to anyone who wants to join`
      case 'request':
        return `${actorName(event)} made ${groupLabel(event)} require a join request`
      default:
        return `${actorName(event)} changed who can join ${groupLabel(event)}`
    }
  },
  'group.join_requested': (event) => `${actorName(event)} asked to join ${groupLabel(event)}`,
  'group.join_request_approved': (event) =>
    `${actorName(event)} approved a request to join ${groupLabel(event)}`,
  'group.join_request_declined': (event) =>
    `${actorName(event)} declined a request to join ${groupLabel(event)}`,
  'group.join_request_withdrawn': (event) =>
    `${actorName(event)} withdrew a request to join ${groupLabel(event)}`,
  // Nobody answered a cancelled request, so the sentence names nobody.
  'group.join_request_cancelled': (event) =>
    `A request to join ${groupLabel(event)} was cancelled`,
  'group.avatar_changed': (event) =>
    metaFlag(event, 'cleared')
      ? `${actorName(event)} removed the photo from ${groupLabel(event)}`
      : `${actorName(event)} changed the photo of ${groupLabel(event)}`,

  'community.created': (event) => `${actorName(event)} created ${communityLabel(event)}`,
  'community.updated': (event) => `${actorName(event)} updated ${communityLabel(event)}`,
  'community.member_added': (event) =>
    `${actorName(event)} added a member to ${communityLabel(event)}`,
  'community.member_removed': (event) =>
    `${actorName(event)} removed a member from ${communityLabel(event)}`,
  'community.member_left': (event) => `${actorName(event)} left ${communityLabel(event)}`,
  'community.moderator_promoted': (event) =>
    `${actorName(event)} made a member a moderator of ${communityLabel(event)}`,
  'community.moderator_demoted': (event) =>
    `${actorName(event)} removed a moderator from ${communityLabel(event)}`,
  'community.group_linked': (event) =>
    `${actorName(event)} linked a group to ${communityLabel(event)}`,
  'community.group_unlinked': (event) =>
    `${actorName(event)} unlinked a group from ${communityLabel(event)}`,

  'user.created': (event) => {
    const role = metaString(event, 'role')
    const suffix = role ? ` as ${role}` : ''
    return `${actorName(event)} created ${accountLabel(event)}${suffix}`
  },
  // The target is gone by the time anybody reads this, so the role frozen into
  // metadata is the only description left.
  'user.deleted': (event) =>
    event.target?.name
      ? `${actorName(event)} deleted the account ${event.target.name}`
      : `${actorName(event)} deleted ${deletedAccountLabel(event)}`,
  'user.role_changed': (event) => {
    const from = metaString(event, 'fromRole')
    const to = metaString(event, 'toRole')
    if (from && to) return `${actorName(event)} changed ${targetName(event)} from ${from} to ${to}`
    return `${actorName(event)} changed the role of ${targetName(event)}`
  },
  'user.username_changed': (event) => {
    const from = metaString(event, 'fromUsername')
    const to = metaString(event, 'toUsername')
    if (from && to) {
      return `${actorName(event)} changed the username of ${targetName(event)} from ${from} to ${to}`
    }
    return `${actorName(event)} changed the username of ${targetName(event)}`
  },
  'user.sessions_revoked': (event) => {
    const revoked = metaNumber(event, 'revokedCount')
    if (revoked === null) return `${actorName(event)} revoked sessions for ${targetName(event)}`
    return `${actorName(event)} revoked ${revoked} session${revoked === 1 ? '' : 's'} for ${targetName(event)}`
  },
  'user.two_factor_reset': (event) =>
    `${actorName(event)} reset two-factor authentication for ${targetName(event)}`,
  'user.permissions_changed': (event) => {
    const granted = metaCapabilities(event, 'granted')
    const revoked = metaCapabilities(event, 'revoked')
    const parts: string[] = []
    if (granted.length > 0) parts.push(`granted ${formatCapabilityList(granted)}`)
    if (revoked.length > 0) parts.push(`revoked ${formatCapabilityList(revoked)}`)
    if (parts.length === 0) {
      return `${actorName(event)} saved permissions for ${targetName(event)} without changing them`
    }
    return `${actorName(event)} ${parts.join(' and ')} for ${targetName(event)}`
  },
  'user.banned': (event) => {
    const reason = metaString(event, 'reason')
    const suffix = reason ? ` — ${reason}` : ''
    return `${actorName(event)} banned ${targetName(event)}${suffix}`
  },
  'user.unbanned': (event) => `${actorName(event)} unbanned ${targetName(event)}`,
  'user.password_reset': (event) =>
    `${actorName(event)} reset the password for ${targetName(event)}`,

  'team.renamed': (event) => {
    const from = metaString(event, 'fromName')
    const to = metaString(event, 'toName')
    if (from && to) return `${actorName(event)} renamed the Team from “${from}” to “${to}”`
    return `${actorName(event)} renamed the Team`
  },

  'organization.created': (event) =>
    `${actorName(event)} created ${namedTarget(event, 'organization', 'name')}`,
  'organization.updated': (event) => {
    const from = metaString(event, 'fromName')
    const to = metaString(event, 'toName')
    if (from && to) return `${actorName(event)} renamed the organization “${from}” to “${to}”`
    return `${actorName(event)} updated ${namedTarget(event, 'organization', 'name')}`
  },
  'organization.deleted': (event) =>
    `${actorName(event)} deleted ${namedTarget(event, 'organization', 'name')}`,

  'invitation.sent': (event) =>
    `${actorName(event)} invited ${targetName(event)} to ${invitationOrganization(event)}`,
  'invitation.accepted': (event) =>
    `${actorName(event)} accepted the invitation to ${invitationOrganization(event)}`,
  'invitation.declined': (event) =>
    `${actorName(event)} declined the invitation to ${invitationOrganization(event)}`,
  'invitation.cancelled': (event) =>
    `${actorName(event)} cancelled the invitation of ${targetName(event)} to ${invitationOrganization(event)}`,
  'membership.granted': (event) =>
    `${actorName(event)} added ${targetName(event)} to ${invitationOrganization(event)}`,
  'membership.removed': (event) =>
    `${actorName(event)} removed ${targetName(event)} from ${invitationOrganization(event)}`,

  'wall.contributor_granted': (event) =>
    `${actorName(event)} let ${wallContributor(event)} post on the Wall`,
  'wall.contributor_revoked': (event) =>
    `${actorName(event)} stopped ${wallContributor(event)} posting on the Wall`,
  'wall.post_created': (event) => `${actorName(event)} posted on the Wall`,
  'wall.post_edited': (event) => `${actorName(event)} edited a Wall post`,
  'wall.post_removed': (event) => `${actorName(event)} removed a Wall post`,
}

/** `community.group_unlinked` → `Community group unlinked`. */
function describeFallback(kind: string): string {
  const words = kind.replace(/[._]/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function describeActivity(event: ActivityEvent): string {
  const build = Object.hasOwn(ACTIVITY_COPY, event.kind) ? ACTIVITY_COPY[event.kind] : undefined
  return build ? build(event) : describeFallback(event.kind)
}

/**
 * Whose initials the row's avatar carries: whoever did it, or nobody for the
 * system and for an account that has since gone.
 */
export function activityActorName(event: ActivityEvent): string | null {
  if (event.actorRole === 'system') return null
  return event.actor?.name ?? null
}
