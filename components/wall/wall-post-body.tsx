import { useCallback, useState } from 'react'
import { View, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native'

import { TactilePressable } from '@/components/ui/tactile-pressable'
import { LinkedText, linkTint } from '@/components/ui/linked-text'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { wallBodyEmphasis, WALL_BODY_CLAMP_LINES } from '@/lib/wall-card'

/**
 * The two ways a Post's body is set, as one pair of classes rather than two
 * copies of it: the measuring text below has to be laid out at exactly the size
 * the visible one is, or it measures a column nobody is reading.
 *
 * `text-xl` rather than `text-lg` because `DESIGN.md`'s type scale has no `lg`
 * step — an orphan one is called out there by name.
 */
const EMPHASIS = {
  lead: 'text-xl font-medium leading-8 text-ink',
  body: 'text-ink-soft',
} as const

/**
 * A Post's text, clamped only when clamping it would actually hide something.
 *
 * Whether the body overflows is measured rather than guessed from its length:
 * the same three hundred characters overflow on a narrow phone and do not on a
 * tablet, and Bengali sets taller than Latin at the same size. React Native
 * reports the lines it laid out, so the measurement is the layout event with the
 * clamp off — `onTextLayout` on an unclamped copy, drawn to nobody.
 *
 * The control appears only when there is something behind it, so a Post of two
 * lines never carries one it does not need, and the emphasis comes from
 * `wallBodyEmphasis`: a short body with no collage above it is set a step
 * larger, so that one word and five hundred characters both look deliberate
 * rather than like the same template with more in it.
 */
export function WallPostBody({ body, hasImages }: { body: string; hasImages: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const emphasis = EMPHASIS[wallBodyEmphasis(body, hasImages)]

  const measure = useCallback((event: NativeSyntheticEvent<TextLayoutEventData>) => {
    setOverflows(event.nativeEvent.lines.length > WALL_BODY_CLAMP_LINES)
  }, [])

  return (
    <View className="gap-1.5">
      {/*
        The measuring copy: the same text at the same width with no clamp on it,
        laid out and never drawn. Reading the clamped one instead would answer
        "as many lines as the clamp allows" and never more, whatever the body.
      */}
      <Text
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        variant="body"
        onTextLayout={measure}
        // Stretched to the container's width, or it would size to its own
        // content and measure a column nobody is reading.
        className={cn('absolute left-0 right-0 top-0 opacity-0', emphasis)}
        pointerEvents="none"
      >
        {body}
      </Text>

      {/*
        `body` in both cases rather than `title` for a lead: a Post's own words
        are not a heading, and `Text`'s title variant would announce them as one.
        What "lead" changes is the size and the weight, which is all it means.
      */}
      <Text
        variant="body"
        numberOfLines={expanded ? undefined : WALL_BODY_CLAMP_LINES}
        className={emphasis}
      >
        <LinkedText text={body} linkClassName={linkTint(false)} />
      </Text>

      {overflows ? (
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less' : 'Show more'}
          accessibilityState={{ expanded }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setExpanded(current => !current)}
          className="min-h-6 self-start justify-center"
        >
          <Text variant="label" className="text-primary">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </TactilePressable>
      ) : null}
    </View>
  )
}
