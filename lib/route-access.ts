import { USERS_SCREEN_CAPABILITIES, canAny, type Capability } from '@/lib/capabilities'
import type { UserRole } from '@/lib/types'

/**
 * Who may enter a screen, as one rule every guard reads.
 *
 * Two places used to answer this separately and could drift: the Admin Hub drew
 * a row only for a viewer holding the capability behind it, and the route the
 * row pushed had no check at all, so a deep link to `/labels` opened the screen
 * for anybody the `(admin)` group let in. Now the navigator's `Protected` guards
 * and the Hub's rows both read `SCREEN_ACCESS`, so a row is drawn exactly when
 * its screen can be entered.
 *
 * The API owns the rule, as it does for every capability: a guard here is the
 * courtesy of not opening a screen whose every request would be refused.
 *
 * Pure and free of React, so every answer is a table row.
 */

export type Access = {
  /** The roles that may enter. Absent means any signed-in role. */
  readonly roles?: readonly UserRole[]
  /**
   * At least one of these must be held. Absent means no capability is asked
   * for. An empty list is *not* the same as absent: like `canAny`, it is never
   * satisfied, so a screen gated on nothing by mistake stays shut rather than
   * opening for everyone.
   */
  readonly anyCapability?: readonly Capability[]
}

/**
 * The signed-in person, or nobody. `SessionUser` satisfies it; null and
 * undefined are nobody signed in, who may enter nothing guarded.
 */
export type RouteViewer =
  | { readonly role: UserRole; readonly capabilities: readonly Capability[] }
  | null
  | undefined

export function mayEnter(viewer: RouteViewer, access: Access): boolean {
  if (!viewer) return false
  if (access.roles !== undefined && !access.roles.includes(viewer.role)) return false
  if (access.anyCapability !== undefined && !canAny(viewer, access.anyCapability)) return false
  return true
}

/**
 * The three role groups under the root stack. A role only ever enters its own:
 * the role is the server's, read off the session, so an Agent deep-linking into
 * `/(admin)` finds the group missing from the navigator rather than open.
 */
export const ROLE_GROUP_ACCESS: Readonly<Record<UserRole, Access>> = {
  customer: { roles: ['customer'] },
  agent: { roles: ['agent'] },
  admin: { roles: ['admin'] },
}

/**
 * Organizations carry editing (`manage_organizations`) and their members
 * (`manage_memberships`). Holding neither leaves nothing to do there.
 */
const ORGANIZATIONS_SCREEN_CAPABILITIES: readonly Capability[] = [
  'manage_organizations',
  'manage_memberships',
]

/**
 * The Admin Hub's screens that need more than being an Admin, keyed by their
 * route name under `app/(admin)/(home)`.
 *
 * `roles` repeats the group they live in, so each row reads whole on its own.
 * `offer-add` asks for no capability because none backs it: it writes to the
 * mock catalog, which no API serves.
 */
export const SCREEN_ACCESS = {
  /** The Users API answers holders of any of these three, as the web Users page does. */
  users: { roles: ['admin'], anyCapability: USERS_SCREEN_CAPABILITIES },
  organizations: { roles: ['admin'], anyCapability: ORGANIZATIONS_SCREEN_CAPABILITIES },
  'organization/[id]': { roles: ['admin'], anyCapability: ORGANIZATIONS_SCREEN_CAPABILITIES },
  /** Creating and editing labels. Putting one on a conversation needs nothing. */
  labels: { roles: ['admin'], anyCapability: ['manage_labels'] },
  /** Writing the library. Reading it happens in the composer, open to all staff. */
  'saved-responses': { roles: ['admin'], anyCapability: ['manage_canned_replies'] },
  activity: { roles: ['admin'], anyCapability: ['view_team_activity'] },
  /** The Hub's chart carousel reads the same row, so a chart is drawn only where it opens. */
  'chart/[id]': { roles: ['admin'], anyCapability: ['view_team_analytics'] },
  'offer-add': { roles: ['admin'] },
} as const satisfies Record<string, Access>

export type GuardedScreen = keyof typeof SCREEN_ACCESS
