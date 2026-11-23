import type { ManagedUser, OrganizationMember } from '@/lib/types'

/**
 * The rows the organization members screen draws, decided off the screen so
 * the order the two requests land in becomes a table rather than a race.
 *
 * The members list and the user directory are asked for separately (CR-01),
 * so either can answer first. "Could be invited" is the directory minus the
 * members, and that difference means nothing until the members are known: a
 * directory that lands first would otherwise offer an Invite button to every
 * current member and fill the list in front of the loading state. And when the
 * members could not be read at all, the difference cannot be taken, so nothing
 * is listed and the failure is what the screen shows.
 */

export type MembersState =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; members: OrganizationMember[] }

export type MemberScreenRow =
  | { kind: 'member'; member: OrganizationMember }
  | { kind: 'candidate'; user: ManagedUser }

export function memberScreenRows({
  state,
  directory,
  canManage,
  query,
  memberName,
  userName,
}: {
  state: MembersState
  directory: readonly ManagedUser[]
  canManage: boolean
  query: string
  memberName: (member: OrganizationMember) => string
  userName: (user: ManagedUser) => string
}): MemberScreenRow[] {
  if (state.status !== 'ready') return []

  const inside = new Set(state.members.map((member) => member.id))
  const q = query.trim().toLowerCase()

  const memberRows: MemberScreenRow[] = state.members
    .filter((member) => !q || memberName(member).toLowerCase().includes(q))
    .map((member) => ({ kind: 'member', member }))

  const candidateRows: MemberScreenRow[] = (canManage ? directory : [])
    .filter((user) => !inside.has(user.id))
    .filter((user) => !q || userName(user).toLowerCase().includes(q))
    .map((user) => ({ kind: 'candidate', user }))

  return [...memberRows, ...candidateRows]
}
