import { ActivityIndicator, Pressable, View } from 'react-native'

import { DetailsCard } from '@/components/chat/details-card'
import { AlertCircle, Building, Check } from '@/components/icons'
import { buttonTextVariants, buttonVariants } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { assignLabel } from '@/lib/onboarding-placement'
import { colors } from '@/lib/tokens'
import type { ConversationPerson } from '@/lib/types'
import type { OnboardingPlacement } from '@/lib/use-onboarding-placement'

/**
 * Inviting the Customer of a General Support thread to one or more organizations.
 *
 * Drawn only where `placeableOnboardingCustomer` names somebody. Each organization is a row that
 * toggles, and the button under them sends the selection in one request; that tap is the
 * confirmation, the way picking a name is for Transfer. Nothing is destructive here: each
 * organization becomes an Invitation card in General Support, and the Customer joins only by
 * choosing Join on it.
 *
 * Every control here is a plain Pressable dressed as a Button, never the shared Button. Each
 * press changes what this card renders, or leaves the screen, while the Button's Reanimated
 * press animation is still committing to the view it pressed; on Fabric that crashed with a
 * view inserted into a parent it already had, the same way the Manage conversation section
 * avoids by using Pressables.
 */
export function OnboardingPlacementSection({
  customer,
  placement,
}: {
  customer: ConversationPerson
  placement: OnboardingPlacement
}) {
  const { organizations, selected, assigning, error } = placement

  return (
    <DetailsCard icon={Building} title="Organizations">
      <Text variant="meta" className="text-ink-soft">
        Invite {customer.name} to an organization. Each one is sent as an invitation card in this
        General Support conversation, which they join or decline.
      </Text>

      {organizations.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} />
      ) : organizations.status === 'failed' ? (
        <View className="items-start gap-2" accessibilityLiveRegion="polite">
          <View className="flex-row items-center gap-1.5">
            <AlertCircle color={colors.danger} size={14} />
            <Text variant="meta" className="text-danger">
              {organizations.message || 'The organizations could not be loaded.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={placement.reloadOrganizations}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Text className={buttonTextVariants({ variant: 'outline', size: 'sm' })}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : organizations.organizations.length === 0 ? (
        <Text variant="meta" className="text-muted">
          There are no organizations to add them to yet.
        </Text>
      ) : (
        <View className="gap-1.5">
          {organizations.organizations.map((organization) => {
            const checked = selected.includes(organization.id)
            return (
              <Pressable
                key={organization.id}
                accessibilityRole="checkbox"
                accessibilityLabel={organization.name}
                accessibilityState={{ checked, disabled: assigning }}
                disabled={assigning}
                onPress={() => placement.toggle(organization.id)}
                className={cn(
                  'min-h-11 flex-row items-center gap-3 rounded-2xl border px-3.5 active:opacity-70',
                  checked ? 'border-primary bg-primary-soft' : 'border-line/70',
                  assigning && 'opacity-60',
                )}
              >
                <View
                  className={cn(
                    'size-5 items-center justify-center rounded-md border',
                    checked ? 'border-primary bg-primary' : 'border-line',
                  )}
                >
                  {checked ? <Check color={colors.surface} size={14} /> : null}
                </View>
                <Text
                  variant="meta"
                  numberOfLines={1}
                  className={cn('min-w-0 flex-1', checked ? 'font-semibold text-primary' : 'text-ink')}
                >
                  {organization.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {organizations.status === 'ready' && organizations.organizations.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={assignLabel(selected.length)}
          accessibilityState={{ disabled: selected.length === 0, busy: assigning }}
          disabled={selected.length === 0 || assigning}
          onPress={placement.assign}
          className={cn(buttonVariants(), selected.length === 0 && 'opacity-40')}
        >
          {assigning ? <ActivityIndicator color={colors.surface} /> : null}
          <Text className={buttonTextVariants()}>{assignLabel(selected.length)}</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
          {error}
        </Text>
      ) : null}
    </DetailsCard>
  )
}
