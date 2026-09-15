import { View } from 'react-native'

import { ArrowBigDown, ArrowBigUp } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { colors } from '@/lib/tokens'
import type { WallVoteDirection } from '@/lib/types'

/**
 * The Wall's ranking signal, not a Reaction (`CONTEXT.md`): its own pill,
 * bordered and set apart from the chip row beside it, so a reader never
 * mistakes a judgement for an expression or the other way round.
 *
 * Only the net score renders, sized for a thumb between two large controls —
 * there is no downvote count to show even if this wanted to, since the API
 * deliberately never offers one, so nothing here tries to derive it from
 * `score` and `upvoteCount` either.
 *
 * Casting the direction already showing on the control clears it, the
 * opposite direction replaces it — the same toggle `POST /wall/posts/:id/vote`
 * itself applies. The change lands on screen before the server answers and
 * unwinds on a refusal or a dead network (`lib/use-wall`'s `vote`).
 */

type WallPostVoteProps = {
  score: number
  myVote: WallVoteDirection | null
  onVote: (direction: WallVoteDirection) => void
}

export function WallPostVote({ score, myVote, onVote }: WallPostVoteProps) {
  return (
    <View className="flex-row items-center gap-0.5 self-start rounded-full border border-line/70 bg-line/25 p-0.5">
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={myVote === 'up' ? 'Remove your upvote' : 'Upvote this post'}
        accessibilityState={{ selected: myVote === 'up' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => onVote('up')}
        className={cn('size-9 items-center justify-center rounded-full', myVote === 'up' && 'bg-primary-soft')}
      >
        <ArrowBigUp
          color={myVote === 'up' ? colors.primary : colors.muted}
          fill={myVote === 'up' ? colors.primary : 'transparent'}
          size={20}
        />
      </TactilePressable>

      <Text
        variant="meta"
        accessibilityLabel={`Score: ${score}`}
        className={cn(
          'min-w-6 text-center font-semibold tabular-nums',
          myVote === 'up' ? 'text-primary' : myVote === 'down' ? 'text-danger' : 'text-ink-soft',
        )}
      >
        {score}
      </Text>

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={myVote === 'down' ? 'Remove your downvote' : 'Downvote this post'}
        accessibilityState={{ selected: myVote === 'down' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => onVote('down')}
        className={cn('size-9 items-center justify-center rounded-full', myVote === 'down' && 'bg-danger/10')}
      >
        <ArrowBigDown
          color={myVote === 'down' ? colors.danger : colors.muted}
          fill={myVote === 'down' ? colors.danger : 'transparent'}
          size={20}
        />
      </TactilePressable>
    </View>
  )
}
