import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, View } from 'react-native'

import { ArrowLeftRight, CheckCircle, ChevronRight } from '@/components/icons'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { colors } from '@/lib/tokens'
import type { ThreadManagement } from '@/lib/use-thread-management'

/**
 * Ending this conversation, and handing it to somebody else.
 *
 * Only ever rendered for the person the API would let do it — see
 * `canManageAssignment` — so nothing here is disabled or greyed: a control
 * that appears is a control that works, and one the rule excludes is not
 * drawn at all.
 *
 * The two are deliberately different weights. Transfer opens a list and is
 * committed by picking a name from it, which is the confirmation. Close is a
 * single tap that ends the work, so it asks first — and because closing is
 * reversible (the Customer writing in reopens the thread, and it comes back to
 * whoever closed it) the confirmation is a plain one rather than a destructive
 * one.
 */

type ThreadManagementSectionProps = {
  management: ThreadManagement
}

export function ThreadManagementSection({ management }: ThreadManagementSectionProps) {
  const [picking, setPicking] = useState(false)
  const { candidates, candidatesFailed, loadCandidates, pending, error } = management

  const toggleTransfer = useCallback(() => {
    setPicking((open) => {
      if (!open) loadCandidates()
      return !open
    })
  }, [loadCandidates])

  const confirmClose = useCallback(() => {
    Alert.alert(
      'Close this conversation?',
      'It moves out of your queue. If the customer writes again it reopens and comes back to you.',
      [
        { text: 'Keep open', style: 'cancel' },
        { text: 'Close', onPress: management.close },
      ],
    )
  }, [management])

  return (
    <View className="gap-3 rounded-2xl border border-line/70 bg-surface p-3.5">
      <Text variant="label" className="uppercase tracking-wide text-muted">
        This conversation
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Transfer to another agent"
        accessibilityState={{ expanded: picking }}
        onPress={toggleTransfer}
        className="min-h-11 flex-row items-center gap-3 active:opacity-70"
      >
        <View className="size-9 items-center justify-center rounded-2xl bg-primary-soft">
          <ArrowLeftRight color={colors.primary} size={18} />
        </View>
        <Text variant="meta" className="min-w-0 flex-1 font-semibold text-ink">
          Transfer to another agent
        </Text>
        {pending === 'transfer' ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ChevronRight
            color={colors.muted}
            size={18}
            style={picking ? { transform: [{ rotate: '90deg' }] } : undefined}
          />
        )}
      </Pressable>

      {picking ? (
        <View accessibilityLiveRegion="polite" className="gap-1.5 pl-12">
          {candidatesFailed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={loadCandidates}
              className="min-h-11 justify-center active:opacity-70"
            >
              <Text variant="meta" className="text-primary">
                Could not load the team. Try again.
              </Text>
            </Pressable>
          ) : candidates === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : candidates.length === 0 ? (
            <Text variant="meta" className="py-2 text-muted">
              There is no other agent to transfer this to.
            </Text>
          ) : (
            candidates.map((agent) => (
              <Pressable
                key={agent.id}
                accessibilityRole="button"
                accessibilityLabel={`Transfer to ${agent.name}`}
                disabled={pending !== null}
                onPress={() => management.transfer(agent.id)}
                className={cn(
                  'min-h-11 justify-center rounded-2xl border border-line/70 px-3.5 active:opacity-70',
                  pending !== null && 'opacity-60',
                )}
              >
                <Text variant="meta" className="font-semibold text-ink">
                  {agent.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close this conversation"
        disabled={pending !== null}
        onPress={confirmClose}
        className={cn(
          'min-h-11 flex-row items-center gap-3 active:opacity-70',
          pending !== null && 'opacity-60',
        )}
      >
        <View className="size-9 items-center justify-center rounded-2xl bg-success/15">
          <CheckCircle color={colors.success} size={18} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="meta" className="font-semibold text-ink">
            Close conversation
          </Text>
          <Text variant="label" className="mt-0.5 font-normal text-muted">
            Reopens if the customer writes again
          </Text>
        </View>
        {pending === 'close' ? <ActivityIndicator color={colors.success} /> : null}
      </Pressable>

      {error ? (
        <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
