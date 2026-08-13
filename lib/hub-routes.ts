import type { Href } from 'expo-router'

import type { UserRole } from '@/lib/types'

export const ROLE_HREF = {
  contact: '/(contact)',
  agent: '/(agent)',
  admin: '/(admin)',
} as const satisfies Record<UserRole, Href>

export function knowledgeListHref(group: 'agent' | 'admin') {
  return group === 'admin'
    ? ('/(admin)/knowledge' as const)
    : ('/(agent)/knowledge' as const)
}

export function knowledgeHref(group: 'agent' | 'admin', id: string) {
  return group === 'admin'
    ? { pathname: '/(admin)/(home)/article/[id]' as const, params: { id } }
    : { pathname: '/(agent)/(home)/article/[id]' as const, params: { id } }
}

export function chartHref(id: string) {
  return { pathname: '/(admin)/chart/[id]' as const, params: { id } }
}

export function dynamicRouteId(
  raw: string | string[] | undefined,
  pathname: string,
  segment: string,
): string | undefined {
  const fromParams = Array.isArray(raw) ? raw[0] : raw
  if (fromParams && fromParams !== '[id]') return fromParams
  const parts = pathname.split('/').filter(Boolean)
  const i = parts.indexOf(segment)
  const next = i >= 0 ? parts[i + 1] : undefined
  if (!next || next === '[id]') return undefined
  return decodeURIComponent(next)
}
