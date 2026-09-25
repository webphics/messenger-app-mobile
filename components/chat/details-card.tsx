import type { ReactNode } from 'react'
import { View } from 'react-native'

import type { IconComponent } from '@/components/icons'
import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'

/**
 * One section of Conversation details.
 *
 * A white card lifted off the desk, headed by an icon and a title at title
 * weight, so each section reads as its own block at a glance. The earlier
 * version used grey wells under a small uppercase eyebrow, and five of those in
 * a column blurred into one. The icon chip stays neutral: lavender is kept for
 * the controls on the card, which is where the eye should land next.
 */
export function DetailsCard({
  icon: Icon,
  title,
  trailing,
  children,
}: {
  icon: IconComponent
  title: string
  /** Sits at the end of the heading: a count, a tag or a small action. */
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <View className="gap-3.5 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8">
      <View className="min-h-8 flex-row items-center gap-2.5">
        <View className="size-8 items-center justify-center rounded-xl bg-bg">
          <Icon color={colors.inkSoft} size={17} />
        </View>
        <Text variant="title" numberOfLines={1} className="min-w-0 flex-1 text-ink">
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  )
}
