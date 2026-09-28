export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName
}

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

/**
 * Whether this id is the company persona: what a Customer is shown in place of
 * any staff member (`company:<organizationId>`, or `company:app` where there is
 * no organization). The API sends it as an ordinary person — a message's
 * sender, a group member, a Post's author — so nothing that reads one changes
 * shape; what changes is that it is never drawn as somebody.
 *
 * It can never be the viewer: the viewer's own id is a user id, so a persona's
 * message is never outgoing and its Post never offers Edit or Delete.
 */
export function isCompanyPersona(id: string): boolean {
  return id.startsWith('company:')
}

/**
 * The letters on a person's avatar. A persona gets the first letter of the
 * organization's name, the way a company's mark reads, rather than the two
 * initials of somebody's name — "Acme Support" is not "AS".
 */
export function avatarInitials(person: { id: string; name: string }): string {
  if (!isCompanyPersona(person.id)) return initials(person.name)
  const first = Array.from(person.name.trim())[0]
  return first ? first.toUpperCase() : '?'
}

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const diffMs = Math.max(0, nowMs - then)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
