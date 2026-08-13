import { PEOPLE } from '@/lib/mock-data'
import { getSession } from '@/lib/session'
import type { Person } from '@/lib/types'

export function getDevUser(): Person {
  const role = getSession().role
  const person = PEOPLE.find((p) => p.role === role)
  if (!person) throw new Error(`No mock person for role ${role}`)
  return person
}

export function getDevUserId(): string {
  return getDevUser().id
}
