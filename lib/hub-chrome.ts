import type { UserRole } from '@/lib/types'

const HUB_EYEBROW_BY_ROLE: Record<UserRole, string> = {
  contact: 'SUPPORT',
  agent: 'AGENT',
  admin: 'ADMIN',
}

const HUB_GREETING_BY_ROLE: Record<UserRole, string> = {
  contact: 'How can we help, {name}? 👋',
  agent: 'Ready when you are, {name} 👋',
  admin: 'Welcome back, {name} 👋',
}

export function hubEyebrow(role: UserRole): string {
  return HUB_EYEBROW_BY_ROLE[role]
}

export function hubGreeting(role: UserRole, name: string): string {
  return HUB_GREETING_BY_ROLE[role].replace('{name}', name)
}
