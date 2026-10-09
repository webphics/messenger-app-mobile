import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { Building, ChevronRight } from '@/components/icons'
import { buttonTextVariants, buttonVariants } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { chatHref } from '@/lib/chat-route-id'
import { cn } from '@/lib/cn'
import {
  invitationCardEvents,
  invitationCardLine,
  invitationEventTime,
  type InvitationCardEvent,
} from '@/lib/message-invitation'
import { acceptInvitation, declineInvitation } from '@/lib/org-api'
import { colors } from '@/lib/tokens'
import type { InvitationCardState, MessageInvitation } from '@/lib/types'

/**
 * Where the card stands, as the pill in its corner says it. Colour and words together, so the
 * state never rests on colour alone.
 */
const STATE_PILL: Record<InvitationCardState, { label: string; box: string; text: string }> = {
  pending: { label: 'Pending', box: 'bg-primary-soft', text: 'text-primary' },
  joined: { label: 'Joined', box: 'bg-success/10', text: 'text-success' },
  declined: { label: 'Declined', box: 'bg-danger/10', text: 'text-danger' },
  withdrawn: { label: 'Withdrawn', box: 'bg-line/70', text: 'text-muted' },
}

/** The dot beside each step of the card's record. */
const EVENT_DOT: Record<InvitationCardEvent['kind'], string> = {
  invited: 'bg-primary',
  joined: 'bg-success',
  declined: 'bg-danger',
  withdrawn: 'bg-muted',
}

/**
 * An Invitation card (`CONTEXT.md`) in General Support: an organization asking the Customer to
 * join it. The Customer answers a pending one here with Join or Decline; once joined, the card
 * opens the organization's support conversation that joining created. Staff read the same card
 * without the buttons.
 *
 * The card's state is the API's and arrives as the answer lands (a re-sent `message.created`),
 * so a press only asks; it never redraws the card itself. A refusal is said under the buttons.
 *
 * Plain Pressables dressed as Buttons, never the shared Button: a press here changes what the
 * card renders while the Button's press animation is still committing, which crashed on Fabric
 * (see `OnboardingPlacementSection`).
 */
export function InvitationCard({
  invitation,
  sentAt,
  canAnswer,
  onJoined,
}: {
  invitation: MessageInvitation
  /** When the invitation was sent: the card message's own time. */
  sentAt: string
  /** Only the invited Customer answers it. */
  canAnswer: boolean
  /** After Join is accepted, so the Customer's organization list catches up. */
  onJoined?: () => void
}) {
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const pending = invitation.state === 'pending'
  const name = invitation.organization.name
  const pill = STATE_PILL[invitation.state]

  async function answer(kind: 'join' | 'decline') {
    if (busy) return
    setBusy(kind)
    setProblem(null)
    const result =
      kind === 'join'
        ? await acceptInvitation(invitation.id)
        : await declineInvitation(invitation.id)
    setBusy(null)
    if (!result.ok) {
      // The same words the invitations card on Settings uses for the same refusals.
      setProblem(
        result.failure.kind === 'refused'
          ? result.failure.message
          : result.failure.kind === 'unreachable'
            ? 'No connection. Try again.'
            : 'That could not be answered right now.',
      )
      return
    }
    if (kind === 'join') onJoined?.()
  }

  return (
    <View className="my-3 items-center px-5">
      <View
        accessibilityLabel={`Invitation from ${name}`}
        className="w-full max-w-84 gap-4 rounded-3xl border border-line/60 bg-surface p-4 shadow-md shadow-black/8"
      >
        <View className="flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-xl bg-primary-soft">
            <Building color={colors.primary} size={20} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="label" className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Organization invitation
            </Text>
            <Text variant="body" className="font-semibold text-ink" numberOfLines={1}>
              {name}
            </Text>
          </View>
          <View className={cn('rounded-full px-2 py-0.5', pill.box)}>
            <Text variant="label" className={cn('text-[11px] font-semibold', pill.text)}>
              {pill.label}
            </Text>
          </View>
        </View>

        <Text variant="meta" className="text-ink-soft">
          {invitationCardLine(invitation.state, canAnswer, name)}
        </Text>

        {/*
          The record: when it was sent, and when it was answered or withdrawn, as a short
          timeline. The rule between the dots says the two belong to one invitation.
        */}
        <View className="gap-2">
          {invitationCardEvents(sentAt, invitation).map((event, index, events) => (
            <View key={event.kind} className="relative flex-row items-center gap-2.5">
              {index < events.length - 1 ? (
                <View pointerEvents="none" className="absolute left-[3px] top-3 h-full w-px bg-line" />
              ) : null}
              <View pointerEvents="none" className={cn('size-[7px] rounded-full', EVENT_DOT[event.kind])} />
              <Text variant="label" className="font-semibold text-ink">
                {event.label}
              </Text>
              <Text
                variant="label"
                className="ml-auto font-normal text-muted"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {invitationEventTime(event.at)}
              </Text>
            </View>
          ))}
        </View>

        {pending && canAnswer ? (
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Join ${name}`}
              accessibilityState={{ busy: busy === 'join', disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => void answer('join')}
              className={cn(buttonVariants(), 'min-h-11 flex-1', busy && 'opacity-60')}
            >
              {busy === 'join' ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text className={buttonTextVariants()}>Join</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decline ${name}`}
              accessibilityState={{ busy: busy === 'decline', disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => void answer('decline')}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'min-h-11 flex-1',
                busy && 'opacity-60',
              )}
            >
              {busy === 'decline' ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text className={buttonTextVariants({ variant: 'outline' })}>Decline</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {problem ? (
          <Text variant="label" className="font-normal text-danger">
            {problem}
          </Text>
        ) : null}

        {invitation.state === 'joined' && invitation.supportConversationId ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open the ${name} conversation`}
            onPress={() => router.push(chatHref(invitation.supportConversationId as string))}
            className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-11 flex-row gap-1')}
          >
            <Text className={buttonTextVariants({ variant: 'secondary' })}>Open conversation</Text>
            <ChevronRight color={colors.primary} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
