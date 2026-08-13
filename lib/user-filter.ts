import type { Person, UserRole } from '@/lib/types'

export type UserRoleChip = 'all' | UserRole

export function mockEmail(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${slug || 'user'}@support.local`
}

export function filterUsers(
  people: Person[],
  query: string,
  role: UserRoleChip,
  onlineOnly: boolean,
): Person[] {
  const q = query.trim().toLowerCase()
  return people.filter((person) => {
    if (role !== 'all' && person.role !== role) return false
    if (onlineOnly && !person.isOnline) return false
    if (!q) return true
    return (
      person.displayName.toLowerCase().includes(q) ||
      person.role.includes(q) ||
      person.lastActiveLabel.toLowerCase().includes(q) ||
      mockEmail(person.displayName).includes(q)
    )
  })
}
