import type { UserRole } from '@/lib/types'

const HUB_EYEBROW_BY_ROLE: Record<UserRole, string> = {
  customer: 'SUPPORT',
  agent: 'AGENT',
  admin: 'ADMIN',
}

const HUB_GREETING_BY_ROLE: Record<UserRole, string> = {
  customer: 'How can we help, {name}? 👋',
  agent: 'Ready when you are, {name} 👋',
  admin: 'Welcome back, {name} 👋',
}

export function hubEyebrow(role: UserRole): string {
  return HUB_EYEBROW_BY_ROLE[role]
}

/**
 * The same greeting for someone whose name is not there to use.
 *
 * A name is missing for a frame at a time — the hub renders before the session
 * mirror has anyone in it, and after a sign-out while the navigation lands — and
 * substituting an empty string leaves "Ready when you are,  👋": a comma with
 * nothing after it, which reads as a bug rather than as a greeting.
 */
const HUB_GREETING_WITHOUT_NAME: Record<UserRole, string> = {
  customer: 'How can we help? 👋',
  agent: 'Ready when you are 👋',
  admin: 'Welcome back 👋',
}

export function hubGreeting(role: UserRole, name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return HUB_GREETING_WITHOUT_NAME[role]
  return HUB_GREETING_BY_ROLE[role].replace('{name}', trimmed)
}
