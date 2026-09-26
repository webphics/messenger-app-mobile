import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { CloseConversationSheet } from '@/components/chat/close-conversation-sheet'
import { DetailsCard } from '@/components/chat/details-card'
import {
  ArrowLeftRight,
  CheckCircle,
  ChevronRight,
  RotateCcw,
  Settings,
} from '@/components/icons'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import type { ThreadActionsView } from '@/lib/conversation-access'
import { colors } from '@/lib/tokens'
import type { ThreadManagement } from '@/lib/use-thread-management'

/**
 * Ending this conversation, and handing it to somebody else.
 *
 * Each control is drawn only when the conversation's `access` offers it (see
 * `threadActionsView`), so nothing here is disabled or greyed: a control that
 * appears is a control the API accepts, and one it does not offer is not drawn
 * at all. The API has already applied the Close and Transfer Capabilities,
 * which this client never sees, and the Shared queue switch, where Close is
 * offered and Transfer is not.
 *
 * The two are deliberately different weights. Transfer opens a list and is
 * committed by picking a name from it, which is the confirmation. Close opens
 * a sheet that asks for a summary of the support given, which the API requires,
 * and writing it is the confirmation. Closing is reversible (the Customer
 * writing in reopens the thread), so the sheet is a plain form rather than a
 * destructive prompt.
 */

type ThreadManagementSectionProps = {
  management: ThreadManagement
  /** What the API offers. A closed thread offers Reopen in Close's place. */
  actions: Pick<ThreadActionsView, 'transfer' | 'close' | 'reopen'>
  /** Whether a reopened thread comes back to whoever closed it, or to the team. */
  supportAssignment: boolean
}

export function ThreadManagementSection({
  management,
  actions,
  supportAssignment,
}: ThreadManagementSectionProps) {
  const { transfer: canTransfer, close: canClose, reopen: canReopen } = actions
  const [picking, setPicking] = useState(false)
  const [summarising, setSummarising] = useState(false)
  const { candidates, candidatesFailed, loadCandidates, pending, error } = management

  const toggleTransfer = useCallback(() => {
    setPicking((open) => {
      if (!open) loadCandidates()
      return !open
    })
  }, [loadCandidates])


  return (
    <DetailsCard icon={Settings} title="Manage conversation">

      {canTransfer ? (
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
      ) : null}

      {canTransfer && picking ? (
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

      {canReopen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reopen this conversation"
          disabled={pending !== null}
          onPress={management.reopen}
          className={cn(
            'min-h-11 flex-row items-center gap-3 active:opacity-70',
            pending !== null && 'opacity-60',
          )}
        >
          <View className="size-9 items-center justify-center rounded-2xl bg-primary-soft">
            <RotateCcw color={colors.primary} size={18} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="meta" className="font-semibold text-ink">
              Reopen conversation
            </Text>
            <Text variant="label" className="mt-0.5 font-normal text-muted">
              {supportAssignment
                ? 'Returns to whoever closed it, or to the queue'
                : 'Returns to the open queue'}
            </Text>
          </View>
          {pending === 'reopen' ? <ActivityIndicator color={colors.primary} /> : null}
        </Pressable>
      ) : null}

      {canClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close this conversation"
          disabled={pending !== null}
          onPress={() => setSummarising(true)}
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
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
          {error}
        </Text>
      ) : null}

      <CloseConversationSheet
        visible={summarising}
        reopenNote={
          supportAssignment
            ? 'If the customer writes again it reopens and comes back to you.'
            : 'If the customer writes again it reopens for the team.'
        }
        onClose={() => setSummarising(false)}
        onConfirm={management.close}
      />
    </DetailsCard>
  )
}
