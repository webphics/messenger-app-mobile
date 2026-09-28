/**
 * What the signed-in person may do, as the API told this session.
 *
 * The API owns the rule. It sends the viewer's effective set on the session
 * (`capabilities`, root ADR 0017): every capability for the super admin, the
 * stored set for other staff, nothing for a Customer. This module only reads
 * that list back, so a screen can hide a control the API would refuse. Hiding
 * is a courtesy, never the check: a request the viewer may not make is still
 * refused server-side.
 *
 * Pure and free of React, so every answer is a table row.
 */

/** The 29 capabilities, grouped the way the spec and the web client list them. */
export const CAPABILITY_GROUPS = {
  support: [
    'transfer',
    'close',
    'take_over',
    'manage_labels',
    'staff_dm',
    'delete_messages',
    'delete_conversation',
    'delete_own_messages',
    'delete_own_conversations',
    'delete_any_note',
  ],
  groups: ['create_groups', 'manage_group', 'set_group_policies', 'create_communities'],
  broadcasts: [
    'send_broadcasts',
    'view_acknowledgements',
    'pin_wall_posts',
    'remove_wall_posts',
    'manage_wall_contributors',
    'manage_canned_replies',
  ],
  reporting: ['view_team_analytics', 'view_team_activity'],
  workspace: [
    'manage_organizations',
    'message_customers',
    'manage_memberships',
    'manage_users',
    'change_roles',
    'manage_permissions',
    'manage_team',
  ],
} as const

export type CapabilityGroup = keyof typeof CAPABILITY_GROUPS

export type Capability = (typeof CAPABILITY_GROUPS)[CapabilityGroup][number]

/** Every capability, in group order. */
export const CAPABILITIES: readonly Capability[] = Object.values(CAPABILITY_GROUPS).flat()

/**
 * Never held by an agent, whatever the API stores. The workspace four, plus
 * managing memberships and Wall contributors, which are reached only from the
 * Users page, plus deleting *any* message or conversation: an agent is granted
 * the `delete_own_*` pair instead. In group order, as the web client lists them.
 */
export const ADMIN_ONLY_CAPABILITIES: readonly Capability[] = [
  'delete_messages',
  'delete_conversation',
  'manage_wall_contributors',
  'manage_memberships',
  'manage_users',
  'change_roles',
  'manage_permissions',
  'manage_team',
]

/**
 * The capabilities that act on people. Holding any one of them opens the
 * Accounts screen, as it opens the web Users page. Each action there checks
 * its own.
 */
export const USERS_SCREEN_CAPABILITIES: readonly Capability[] = [
  'manage_users',
  'change_roles',
  'manage_permissions',
]

const KNOWN: ReadonlySet<string> = new Set(CAPABILITIES)

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && KNOWN.has(value)
}

/**
 * The session's `capabilities`, keeping only names this build knows.
 *
 * Anything that is not an array reads as holding nothing, and so does a name
 * this build has never heard of. Both fail towards hiding a control, which is
 * the direction that offers nobody an action the API would refuse. An unknown
 * name is dropped rather than failing the whole list, because an API a release
 * ahead of this client will send capabilities this client has no control for.
 */
export function parseCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) return []
  const held: Capability[] = []
  for (const item of value) {
    if (isCapability(item) && !held.includes(item)) held.push(item)
  }
  return held
}

/**
 * Anything carrying a parsed set, the `SessionUser` included. Null and
 * undefined are nobody signed in.
 */
export type CapabilityViewer = { readonly capabilities: readonly Capability[] } | null | undefined

/** Whether the viewer holds this capability. Nobody signed in holds nothing. */
export function can(viewer: CapabilityViewer, capability: Capability): boolean {
  return viewer?.capabilities.includes(capability) === true
}

/**
 * Whether the viewer holds at least one of these. An empty list is never
 * satisfied, so a control gated on nothing is not drawn by accident.
 */
export function canAny(viewer: CapabilityViewer, capabilities: readonly Capability[]): boolean {
  return capabilities.some((capability) => can(viewer, capability))
}
