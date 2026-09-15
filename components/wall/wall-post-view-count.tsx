import { View } from 'react-native'

import { Eye } from '@/components/icons'
import { Text } from '@/components/ui/text'
import { colors } from '@/lib/tokens'

/**
 * A Post's viewer count, in the meta row beside the vote pill.
 *
 * Quiet and non-interactive — there is nothing to tap, only a number to read
 * — which is what tells it apart from the vote pill and the reaction chips
 * either side of it on the card. Drawn whatever the count is, including
 * zero: an author with nobody watching learns that from the same place they
 * would learn otherwise, rather than the control vanishing exactly when the
 * answer is least welcome.
 */

type WallPostViewCountProps = {
  count: number
}

export function WallPostViewCount({ count }: WallPostViewCountProps) {
  return (
    <View
      accessible
      accessibilityLabel={count === 1 ? 'Seen by 1 person' : `Seen by ${count} people`}
      className="flex-row items-center gap-1.5"
    >
      <Eye color={colors.muted} size={16} />
      <Text variant="meta" className="font-semibold tabular-nums text-ink-soft">
        {count}
      </Text>
    </View>
  )
}
