import { Pressable, ScrollView, View } from 'react-native'

import { Flag, X } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { colors } from '@/lib/tokens'

/**
 * Shown above the composer while the next message is marked as a Complaint (`CONTEXT.md`): says
 * who will read it, asks what it is about, and can be dismissed to send a normal message instead.
 * Only drawn for a Customer in their General Support.
 *
 * What it is about is a row of choices rather than a menu: a Customer belongs to a handful of
 * organizations at most, and each choice is one tap with its name in full.
 */
export function ComplaintStrip({
  organizations,
  organizationId,
  onChange,
  onDismiss,
}: {
  organizations: readonly { id: string; name: string }[]
  /** The organization it is about, or null when it is about the app itself. */
  organizationId: string | null
  onChange: (organizationId: string | null) => void
  onDismiss: () => void
}) {
  const choices: { id: string | null; name: string }[] = [
    ...organizations,
    { id: null, name: 'Not about an organization' },
  ]

  return (
    <View className="gap-2 border-b border-line/40 bg-danger/5 px-4 py-2.5">
      <View className="flex-row items-center gap-2">
        <Flag color={colors.danger} size={14} />
        <Text variant="label" className="min-w-0 flex-1 font-semibold text-danger" numberOfLines={1}>
          Sending as a complaint · only admins will see it
        </Text>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Send as a normal message instead"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onDismiss}
          className="size-8 items-center justify-center rounded-full bg-surface"
        >
          <X color={colors.muted} size={16} />
        </TactilePressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2"
      >
        {choices.map((choice) => {
          const picked = choice.id === organizationId
          return (
            <Pressable
              key={choice.id ?? 'about-the-app'}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={`About ${choice.name}`}
              onPress={() => onChange(choice.id)}
              className={cn(
                'min-h-9 justify-center rounded-full border px-3',
                picked ? 'border-danger bg-danger/10' : 'border-line bg-surface',
              )}
            >
              <Text
                variant="label"
                className={picked ? 'font-semibold text-danger' : 'font-medium text-ink-soft'}
              >
                {choice.name}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
