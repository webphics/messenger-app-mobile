import { Fragment, memo, useMemo } from 'react'
import { Alert, Linking, Text } from 'react-native'

import { cn } from '@/lib/cn'
import { linkify } from '@/lib/linkify'

function openLink(href: string) {
  Linking.openURL(href).catch(() => {
    Alert.alert('Could not open link', href)
  })
}

/**
 * The link colour for a paragraph on `primary` (an outgoing bubble) or not. On
 * the primary fill a primary link would vanish, so it keeps the text's own
 * colour and the underline carries it.
 */
export function linkTint(onPrimary: boolean): string | undefined {
  return onPrimary ? undefined : 'text-primary'
}

/**
 * Somebody's text with its links made tappable.
 *
 * Renders *inside* a `<Text>` the caller already owns, so the paragraph keeps
 * its variant, colour, clamp and measurement; only the link runs are nested
 * `Text` with a press of their own. Underlined as well as coloured, because on
 * an outgoing bubble the link and the words around it are the same colour.
 */
export const LinkedText = memo(function LinkedText({
  text,
  linkClassName,
}: {
  text: string
  linkClassName?: string
}) {
  // Bare `Text` rather than the design-system one: its default variant would
  // reset the size and colour each run is meant to inherit from the paragraph.
  const segments = useMemo(() => linkify(text), [text])

  return segments.map((segment, index) =>
    segment.kind === 'text' ? (
      <Fragment key={index}>{segment.text}</Fragment>
    ) : (
      <Text
        key={index}
        accessibilityRole="link"
        accessibilityHint="Opens in your browser"
        suppressHighlighting={false}
        onPress={() => openLink(segment.href)}
        className={cn('underline', linkClassName)}
      >
        {segment.text}
      </Text>
    ),
  )
})
