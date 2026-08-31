import AsyncStorage from '@react-native-async-storage/async-storage'
import type { UserRole } from '@/lib/types'

export const SESSION_KEY = 'ism.session'

export type SessionBlob = {
  email: string | null
  role: UserRole
}

const ROLES: UserRole[] = ['admin', 'agent', 'customer']

const DEFAULT_BLOB: SessionBlob = { email: null, role: 'customer' }

let memory: SessionBlob = { ...DEFAULT_BLOB }

export function parseSessionBlob(raw: string | null): SessionBlob {
  if (!raw) return { ...DEFAULT_BLOB }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_BLOB }
    const rec = parsed as Record<string, unknown>
    const role = ROLES.includes(rec.role as UserRole)
      ? (rec.role as UserRole)
      : 'customer'
    const emailRaw = rec.email
    const email =
      typeof emailRaw === 'string' && emailRaw.trim() !== ''
        ? emailRaw.trim()
        : null
    return { email, role }
  } catch {
    return { ...DEFAULT_BLOB }
  }
}

export function isLoggedIn(blob: SessionBlob): boolean {
  return Boolean(blob.email)
}

export function blobAfterLogin(blob: SessionBlob, email: string): SessionBlob {
  return { email: email.trim(), role: blob.role }
}

export function blobAfterSignOut(blob: SessionBlob): SessionBlob {
  return { email: null, role: blob.role }
}

export function blobAfterRoleChange(
  blob: SessionBlob,
  role: UserRole,
): SessionBlob {
  return { email: blob.email, role }
}

export function getSession(): SessionBlob {
  return memory
}

export function setSessionMemory(blob: SessionBlob): void {
  memory = blob
}

export async function persistSession(blob: SessionBlob): Promise<void> {
  setSessionMemory({ ...blob })
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(blob))
  } catch {
    // Expo Go only ships AsyncStorage 2.x; v3 native module is null.
  }
}

export async function hydrateSession(): Promise<SessionBlob> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY)
    const blob = parseSessionBlob(raw)
    setSessionMemory({ ...blob })
    return blob
  } catch {
    return getSession()
  }
}

export async function loginSession(email: string): Promise<SessionBlob> {
  const current = await hydrateSession()
  const blob = blobAfterLogin(current, email)
  await persistSession(blob)
  return blob
}

export async function signOutSession(): Promise<SessionBlob> {
  const current = await hydrateSession()
  const blob = blobAfterSignOut(current)
  await persistSession(blob)
  return blob
}

export async function setSessionRole(role: UserRole): Promise<SessionBlob> {
  const current = await hydrateSession()
  const blob = blobAfterRoleChange(current, role)
  await persistSession(blob)
  return blob
}
