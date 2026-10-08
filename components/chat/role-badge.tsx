import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import type { UserRole } from '@/lib/types'

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-role-admin' },
  agent: { label: 'Agent', className: 'bg-role-agent' },
  customer: { label: 'Customer', className: 'bg-role-customer' },
}

/**
 * The role of the person beside it, as the web client's `RoleBadge` draws it:
 * one tint per role, and the word always spelled out so the distinction does
 * not rest on colour alone.
 */
export function RoleBadge({ role }: { role: UserRole }) {
  const badge = ROLE_BADGE[role]
  if (!badge) return null

  return (
    <View
      className={cn('h-4 shrink-0 justify-center rounded-full px-1.5', badge.className)}
    >
      <Text
        variant="label"
        className="uppercase leading-none tracking-wide text-role-ink"
      >
        {badge.label}
      </Text>
    </View>
  )
}
