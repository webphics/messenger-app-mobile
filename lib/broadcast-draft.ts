import type { BroadcastAudience } from '@/lib/types'

/**
 * The rules a Broadcast draft is checked against before it is sent, mirrored from
 * `CreateBroadcastSchema` so the composer can say so before the API does.
 */

export const BROADCAST_TITLE_MAX = 120
export const BROADCAST_BODY_MAX = 4000

export const NO_AUDIENCE: BroadcastAudience = {
  userIds: [],
  groupIds: [],
  communityIds: [],
  organizationIds: [],
}

/** How many things were picked, across every kind of audience. */
export function audienceSize(audience: BroadcastAudience): number {
  return (
    audience.userIds.length +
    audience.groupIds.length +
    audience.communityIds.length +
    audience.organizationIds.length
  )
}

/** The sentence for what was picked: "2 organizations and 1 community". */
export function audienceSummary(audience: BroadcastAudience): string {
  const parts = [
    [audience.organizationIds.length, 'organization', 'organizations'],
    [audience.communityIds.length, 'community', 'communities'],
    [audience.groupIds.length, 'group', 'groups'],
    [audience.userIds.length, 'person', 'people'],
  ] as const
  const named = parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  if (named.length === 0) return 'Nobody yet'
  if (named.length === 1) return named[0]
  return `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`
}

/** What is wrong with a draft, or null when it can be sent. */
export function broadcastDraftProblem(draft: {
  title: string
  body: string
  audience: BroadcastAudience
}): string | null {
  const title = draft.title.trim()
  const body = draft.body.trim()
  if (!title) return 'Give the announcement a title.'
  if (title.length > BROADCAST_TITLE_MAX) {
    return `Keep the title to ${BROADCAST_TITLE_MAX} characters.`
  }
  if (!body) return 'Write the announcement.'
  if (body.length > BROADCAST_BODY_MAX) {
    return `Keep the announcement to ${BROADCAST_BODY_MAX} characters.`
  }
  if (audienceSize(draft.audience) === 0) {
    return 'Choose at least one organization, community or group.'
  }
  return null
}

/** Adds or removes one id from one kind of audience. */
export function toggleAudience(
  audience: BroadcastAudience,
  kind: keyof BroadcastAudience,
  id: string,
): BroadcastAudience {
  const held = audience[kind]
  return {
    ...audience,
    [kind]: held.includes(id) ? held.filter((item) => item !== id) : [...held, id],
  }
}
