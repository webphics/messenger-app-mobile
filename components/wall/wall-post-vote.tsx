import { View } from 'react-native'

import { ThumbsDown, ThumbsUp } from '@/components/icons'
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
 * Drawn as Like and Dislike: the same up and down vote the API counts, worded
 * the way a reader expects. Only Staff see the net score between them
 * (`showScore`); a Customer sees the two buttons and no number, because a bare
 * "-1" under a Post read as odd and the score is a ranking signal for the team.
 * There is no dislike count to show even for Staff, since the API deliberately
 * never offers one, so nothing here tries to derive it from `score` and
 * `upvoteCount` either.
 *
 * A negative score shows without its minus sign, in red: "1" in red reads at a
 * glance where "-1" read as a typo. The accessibility label keeps the sign.
 *
 * Casting the direction already showing on the control clears it, the
 * opposite direction replaces it — the same toggle `POST /wall/posts/:id/vote`
 * itself applies. The change lands on screen before the server answers and
 * unwinds on a refusal or a dead network (`lib/use-wall`'s `vote`).
 */

type WallPostVoteProps = {
  score: number
  /** False for a Customer, who is never shown the score. */
  showScore: boolean
  myVote: WallVoteDirection | null
  onVote: (direction: WallVoteDirection) => void
}

export function WallPostVote({ score, showScore, myVote, onVote }: WallPostVoteProps) {
  return (
    <View className="flex-row items-center gap-0.5 self-start rounded-full border border-line/70 bg-line/25 p-0.5">
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={myVote === 'up' ? 'Remove your like' : 'Like this post'}
        accessibilityState={{ selected: myVote === 'up' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => onVote('up')}
        className={cn('size-9 items-center justify-center rounded-full', myVote === 'up' && 'bg-primary-soft')}
      >
        <ThumbsUp
          color={myVote === 'up' ? colors.primary : colors.muted}
          fill={myVote === 'up' ? colors.primary : 'transparent'}
          size={18}
        />
      </TactilePressable>

      {showScore ? (
        <Text
          variant="meta"
          accessibilityLabel={`Score: ${score}`}
          className={cn(
            'min-w-6 text-center font-semibold tabular-nums',
            score < 0
              ? 'text-danger'
              : myVote === 'up'
                ? 'text-primary'
                : myVote === 'down'
                  ? 'text-danger'
                  : 'text-ink-soft',
          )}
        >
          {Math.abs(score)}
        </Text>
      ) : null}

      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={myVote === 'down' ? 'Remove your dislike' : 'Dislike this post'}
        accessibilityState={{ selected: myVote === 'down' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => onVote('down')}
        className={cn('size-9 items-center justify-center rounded-full', myVote === 'down' && 'bg-danger/10')}
      >
        <ThumbsDown
          color={myVote === 'down' ? colors.danger : colors.muted}
          fill={myVote === 'down' ? colors.danger : 'transparent'}
          size={18}
        />
      </TactilePressable>
    </View>
  )
}
