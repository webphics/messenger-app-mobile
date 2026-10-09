import type { Organization } from '@/lib/types'

/**
 * The organization pill on a staff inbox.
 *
 * Staff narrow the list to the organizations they pick. Somebody with access to
 * one organization gets a pill named after it that switches the narrowing on
 * and off; somebody with access to several gets a pill called "Org" that opens
 * a list to pick one or more from. Nobody with no organization gets a pill,
 * because there would be nothing to narrow to. The web client's pill is the
 * same rule (`organization-filter.utils`).
 */
export type OrganizationPill =
  | { kind: 'none' }
  | { kind: 'single'; organization: Organization; active: boolean }
  | { kind: 'many'; selectedCount: number; active: boolean }

/**
 * The picked ids that still name an organization the viewer can reach, so a
 * pick that outlived a membership stops narrowing from behind a pill that no
 * longer offers it.
 */
export function reachableSelection(
  selected: readonly string[],
  organizations: readonly Organization[],
): string[] {
  const reachable = new Set(organizations.map((organization) => organization.id))
  return selected.filter((id) => reachable.has(id))
}

export function organizationPill(
  organizations: readonly Organization[],
  selected: readonly string[],
): OrganizationPill {
  const picked = reachableSelection(selected, organizations)
  const [only] = organizations
  if (!only) return { kind: 'none' }
  if (organizations.length === 1) {
    return { kind: 'single', organization: only, active: picked.includes(only.id) }
  }
  return { kind: 'many', selectedCount: picked.length, active: picked.length > 0 }
}

/** The selection with `id` added, or removed when it was already there. */
export function toggleOrganization(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
}
