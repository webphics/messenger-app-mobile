import type { ManagedUser, UserRole } from '@/lib/types'

/**
 * Reading the Admin user directory: what a row says about somebody, and which
 * of the actions on it are theirs to take.
 *
 * Pure, and separate from the screen, because the interesting parts are two
 * tables. One is what a row *says* — an account with no name, a ban that has
 * an expiry, a person invited somewhere they have not accepted — each of
 * which is a sentence worth getting right once. The other is who an Admin may
 * act on, and the answer that matters there is themselves: nothing in the API
 * stops an Admin banning, demoting or deleting their own account, and a phone
 * is a bad place to find that out.
 */

/** The name to draw. An account created by invitation may not have one yet. */
export function userDisplayName(user: ManagedUser): string {
  return user.name?.trim() || user.email
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  agent: 'Agent',
  customer: 'Customer',
}

export function userRoleLabel(role: UserRole): string {
  return ROLE_LABEL[role]
}

/** One state worth flagging on a row. Never colour alone; each carries its word. */
export type UserFlag = {
  label: string
  tone: 'danger' | 'warning' | 'neutral' | 'success'
}

/**
 * What is notable about this account, in the order it matters.
 *
 * A ban first, because it is the state that changes what the account can do
 * at all. An unverified email next, because it is usually why somebody is
 * asking about the account. Then the two facts an Admin uses to decide
 * whether a revocation or a reset is worth doing: whether a second factor is
 * set, and how many sessions are live.
 *
 * No flag for the ordinary case. A row saying "Verified · No 2FA · 0 sessions"
 * about every healthy account is a row where nothing stands out, which is the
 * opposite of what a flag is for.
 */
export function userFlags(user: ManagedUser): UserFlag[] {
  const flags: UserFlag[] = []
  if (user.isBanned) flags.push({ label: 'Banned', tone: 'danger' })
  if (!user.emailVerified) flags.push({ label: 'Unverified', tone: 'warning' })
  if (user.is2faEnabled) flags.push({ label: '2FA', tone: 'success' })
  if (user.activeSessionCount > 0) {
    flags.push({
      label:
        user.activeSessionCount === 1 ? '1 session' : `${user.activeSessionCount} sessions`,
      tone: 'neutral',
    })
  }
  return flags
}

/**
 * Where this person belongs, in one line.
 *
 * Memberships and pending invitations are different facts and read as
 * different words: somebody invited to an organization is not in it, and a
 * directory that counted the two together would make an Admin think an
 * invitation had been accepted.
 */
export function membershipSummary(user: ManagedUser): string {
  const joined = user.organizations.length
  const pending = user.pendingInvitations.length

  const parts: string[] = []
  if (joined > 0) {
    parts.push(joined === 1 ? '1 organization' : `${joined} organizations`)
  }
  if (pending > 0) parts.push(`${pending} invited`)
  if (parts.length === 0) return 'No organization yet'
  return parts.join(' · ')
}

/**
 * Whether an Admin may act on this row at all.
 *
 * Their own account is the one they may not: banning, demoting or deleting
 * yourself from a phone is a mistake with no way back on the same phone. The
 * API permits all three — it asks only that the actor is an Admin — so this
 * is a rule this client adds rather than mirrors, which is why it is written
 * down here instead of being an absent button.
 */
export function isSelf(user: ManagedUser, viewerId: string | null): boolean {
  return viewerId !== null && user.id === viewerId
}

/** Which of the row's actions to draw. */
export type UserRowActions = {
  /** Role, sign out, 2FA reset, password, ban or unban, delete. */
  account: boolean
  /** Taking them out of an organization they are in. */
  removeMembership: boolean
  /** Inviting or adding them to another organization. */
  invite: boolean
}

/**
 * Which actions a row offers.
 *
 * Two rules, and the server's comes first. A row the API marks
 * `manageable: false` refuses every change an Admin could make to it, the
 * membership ones included, so it offers none and the list of where they
 * belong stays read-only. Nothing on screen says why: the flag carries no
 * reason and neither does the row.
 *
 * Then the client's own rule, `isSelf`: the viewer's own row drops the
 * account actions and removal, and keeps invite.
 */
export function userRowActions(user: ManagedUser, viewerId: string | null): UserRowActions {
  if (!user.manageable) return { account: false, removeMembership: false, invite: false }
  const own = isSelf(user, viewerId)
  return { account: !own, removeMembership: !own, invite: true }
}

/**
 * The ids of every row the API will not let an Admin manage.
 *
 * For a screen that lists people by a shape without the flag, such as an
 * organization's members, and has the directory beside it to look them up in.
 */
export function unmanageableIds(users: ManagedUser[]): Set<string> {
  return new Set(users.filter((user) => !user.manageable).map((user) => user.id))
}

/**
 * Which roles a row may be changed to.
 *
 * The three roles there are, minus whatever the row already is.
 */
export function otherRoles(role: UserRole): UserRole[] {
  return (['admin', 'agent', 'customer'] as const).filter((other) => other !== role)
}

/**
 * The organizations worth offering to invite somebody into: the ones they are
 * neither in nor already invited to.
 *
 * A declined invitation is *not* excluded. Declining is an answer to one ask
 * and not a standing refusal, and re-inviting somebody who said no last
 * quarter is a thing an Admin legitimately does.
 */
export function invitableOrganizations<T extends { id: string }>(
  all: T[],
  user: ManagedUser,
): T[] {
  const taken = new Set([
    ...user.organizations.map((organization) => organization.id),
    ...user.pendingInvitations.map((invitation) => invitation.organization.id),
  ])
  return all.filter((organization) => !taken.has(organization.id))
}
