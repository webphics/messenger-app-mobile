import type { ApiResult } from '@/lib/api-result'
import type { Community, Conversation, OrganizationSummary } from '@/lib/types'

/**
 * What the Broadcast composer's audience pickers draw and decide, with nothing
 * native in it.
 *
 * #25 is why this exists: the composer used to draw every organization,
 * community and group as an animated chip in one scroll view, and an Admin —
 * whose list of groups is every group there is — froze the phone opening it.
 * The pickers are now virtualised lists over these rows, and the groups come a
 * page at a time from the API rather than out of the inbox.
 */

/** One row in a picker. `meta` is the quieter second half of its label. */
export type AudienceOption = { id: string; name: string; meta: string | null }

/** Reused group ids looked up one by one before the picker opens. Past this, none are. */
export const GROUP_LOOKUP_CAP = 25

function memberMeta(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`
}

export function organizationOption(organization: OrganizationSummary): AudienceOption {
  return { id: organization.id, name: organization.name, meta: memberMeta(organization.memberCount) }
}

export function communityOption(community: Community): AudienceOption {
  return { id: community.id, name: community.name, meta: memberMeta(community.memberCount) }
}

/** A group's row, or null for any other kind of conversation. */
export function groupOption(conversation: Conversation): AudienceOption | null {
  if (conversation.type !== 'group') return null
  const title = 'title' in conversation ? conversation.title?.trim() : ''
  const members = 'members' in conversation && Array.isArray(conversation.members)
    ? conversation.members.length
    : null
  return {
    id: conversation.id,
    name: title || 'Untitled group',
    meta: members === null ? null : memberMeta(members),
  }
}

/** The rows whose name or meta holds `search`, ignoring case. All of them for an empty search. */
export function matchingOptions(
  options: readonly AudienceOption[],
  search: string,
): readonly AudienceOption[] {
  const needle = search.trim().toLowerCase()
  if (!needle) return options
  return options.filter(
    (option) =>
      option.name.toLowerCase().includes(needle) ||
      (option.meta?.toLowerCase().includes(needle) ?? false),
  )
}

/**
 * The rows held with the next page after them. A row already held keeps its
 * place: the API orders groups by activity, so a group written to between two
 * pages can come back on the second.
 */
export function appendPage(
  held: readonly AudienceOption[],
  page: readonly AudienceOption[],
): AudienceOption[] {
  const seen = new Set(held.map((option) => option.id))
  const fresh = page.filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
  return fresh.length === 0 ? [...held] : [...held, ...fresh]
}

/** The set with `id` added, or taken out when it was already there. Never the same set. */
export function toggleInSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * What a picker's row on the Audience step says is chosen: the first name and
 * how many more, or a count where no name is known — a reused group that was
 * too far down the list to look up, say.
 */
export function chosenLabel(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
  noun: { one: string; many: string },
): string {
  if (ids.length === 0) return 'None chosen'
  const first = ids.map((id) => names.get(id)).find((name) => name !== undefined)
  if (first === undefined) return `${ids.length} ${ids.length === 1 ? noun.one : noun.many}`
  return ids.length === 1 ? first : `${first} and ${ids.length - 1} more`
}

/** What looking up one reused group said. */
export type GroupLookup =
  | { id: string; outcome: 'found'; name: string }
  | { id: string; outcome: 'gone' }
  | { id: string; outcome: 'unknown' }

/**
 * One lookup's answer. Only a `conversation_not_found` refusal says the group is
 * gone; no signal, or a refusal of any other kind, says nothing about it.
 */
export function groupLookupOf(id: string, result: ApiResult<Conversation>): GroupLookup {
  if (result.ok) {
    const option = groupOption(result.value)
    return option ? { id, outcome: 'found', name: option.name } : { id, outcome: 'gone' }
  }
  if (result.failure.kind === 'refused' && result.failure.code === 'conversation_not_found') {
    return { id, outcome: 'gone' }
  }
  return { id, outcome: 'unknown' }
}

/**
 * The reused groups that still exist, in `settleAudience`'s terms, and their
 * names.
 *
 * `known` is null — remove nothing — when any lookup could not answer, or when
 * there were too many to look up at all: a dropped connection must never empty
 * an audience, and the API ignores a group that has gone.
 */
export function settleGroupLookups(
  seedCount: number,
  lookups: readonly GroupLookup[],
): { known: ReadonlySet<string> | null; names: Map<string, string> } {
  const names = new Map<string, string>()
  for (const lookup of lookups) {
    if (lookup.outcome === 'found') names.set(lookup.id, lookup.name)
  }
  const complete =
    seedCount <= GROUP_LOOKUP_CAP &&
    lookups.length === seedCount &&
    lookups.every((lookup) => lookup.outcome !== 'unknown')
  return { known: complete ? new Set(names.keys()) : null, names }
}
