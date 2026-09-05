import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  CornerUpLeft,
  Reply,
  RotateCcw,
} from '@/components/icons'
import { Dimensions, Image, Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { ImagePreviewModal } from '@/components/chat/image-preview-modal'
import { MessageMedia } from '@/components/chat/message-media'
import { VideoThumb } from '@/components/chat/video-thumb'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { hapticLight, hapticMedium, hapticSelection } from '@/lib/haptics'
import { fitImageSize } from '@/lib/image-layout'
import {
  isImageOrVideo,
  type QuoteLayoutMode,
} from '@/lib/message-attachment'
import { replyCaption, type ReactionGroup } from '@/lib/message-react'
import { messageStatusLabel } from '@/lib/message-status'
import { deskMessageEnter } from '@/lib/motion-enter'
import { motion } from '@/lib/motion'
import {
  measureWindowOrPage,
  type OpenMenuPayload,
} from '@/lib/overlay-frame'
import { colors } from '@/lib/tokens'
import type { DeliveryState } from '@/lib/thread-state'
import type {
  AttachmentKind,
  AttachmentView,
  ReceiptStatus,
} from '@/lib/types'

export type { OpenMenuPayload }

export type QuotedMessage = {
  name: string
  body: string
  isMe: boolean
  attachmentKind?: AttachmentKind
  thumbUri?: string
  layoutMode: QuoteLayoutMode
}

type MessageBubbleProps = {
  messageId: string
  body: string
  outgoing: boolean
  status: ReceiptStatus
  /**
   * Set only while this device is still carrying the message. It replaces the
   * receipt rather than sitting beside it: a message the server has not
   * acknowledged has no receipt to show.
   */
  delivery?: DeliveryState
  onRetrySend?: (messageId: string) => void
  senderName?: string
  quoted?: QuotedMessage
  reactions?: ReactionGroup[]
  currentUserId: string
  selected?: boolean
  enter?: boolean
  /**
   * Every attachment on the message, in the order the API sent them.
   *
   * Plural because the payload is. This client stages one at a time, so what it
   * sends carries one — but a message written on web can carry several, and the
   * bubble has to draw all of them rather than quietly keep the first.
   *
   * The first is the one the bubble is *shaped* around: a lone photo or video
   * makes the bubble borderless and takes the body as its caption. Anything
   * after it is stacked below, inside whatever chrome the first chose.
   */
  attachments?: AttachmentView[]
  /**
   * Absent where the long press has nothing to open — a thread this person may
   * only read, where they can neither reply nor react.
   *
   * The gesture goes with it rather than the menu alone: a long press dims the
   * bubble as it begins, and the dimming is only ever undone by the menu it
   * opened closing again. One that opened nothing would leave the bubble dark.
   */
  onOpenMenu?: (payload: OpenMenuPayload) => void
  onReply: (messageId: string) => void
  /**
   * Absent where this message cannot be reacted to — a thread this person may
   * only read, and a message the server has never seen.
   *
   * Absent rather than refused, because the chip row is the one place a
   * reaction is offered *outside* the long-press menu: a tap on a chip toggles
   * it. Where nothing can come of that, the chips are still drawn — they are
   * what other people reacted, which is worth reading — and simply are not
   * buttons.
   */
  onToggleReaction?: (messageId: string, emoji: string) => void
}

const SWIPE_REPLY = 56
const LONG_PRESS_MS = 150

/**
 * What a message this device is still carrying says about itself.
 *
 * A failed send stays on screen and says so, rather than disappearing: the
 * person wrote it, and a bubble that vanishes is indistinguishable from one that
 * arrived. Tapping sends it again — the only next move there is, and the reason
 * this is a control rather than a label.
 *
 * Both states read as words as well as colour, because a red tick and a grey one
 * are the same tick to anyone who cannot tell them apart.
 */
function Delivery({
  state,
  messageId,
  onRetry,
}: {
  state: DeliveryState
  messageId: string
  onRetry?: (messageId: string) => void
}) {
  if (state === 'uploading' || state === 'sending') {
    return (
      <View className="mt-1 items-end pr-1">
        <Text variant="label" className="text-muted">
          {/* Named separately because they are separate waits: the file goes up
              first, and on a phone that is the part that takes time. */}
          {state === 'uploading' ? 'Uploading…' : 'Sending…'}
        </Text>
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={onRetry ? "Not sent. Tap to send again." : "Not sent."}
      accessibilityLiveRegion="polite"
      onPress={() => onRetry?.(messageId)}
      disabled={!onRetry}
      hitSlop={12}
      className="mt-1 flex-row items-center justify-end gap-1 self-end py-1 pr-1 active:opacity-60"
    >
      <AlertCircle color={colors.danger} size={12} />
      <Text variant="label" className="text-danger">
        Not sent
      </Text>
      {onRetry ? (
        <>
          <Text variant="label" className="text-danger">
            ·
          </Text>
          <RotateCcw color={colors.danger} size={11} />
          <Text variant="label" className="font-medium text-danger">
            Retry
          </Text>
        </>
      ) : null}
    </Pressable>
  )
}

function Receipt({
  status,
  outgoing,
}: {
  status: ReceiptStatus
  outgoing: boolean
}) {
  if (!outgoing) return null
  const read = status === 'read'
  const Icon = status === 'sent' ? Check : CheckCheck
  return (
    <View
      accessibilityLabel={messageStatusLabel(status)}
      className="mt-1 items-end pr-1"
    >
      <Icon color={read ? colors.primary : colors.muted} size={13} />
    </View>
  )
}

const QuoteCaption = memo(function QuoteCaption({
  quoted,
  outgoing,
  senderName,
}: {
  quoted: QuotedMessage
  outgoing: boolean
  senderName?: string
}) {
  return (
    <View
      className={cn(
        'mb-1 flex-row items-center gap-1',
        // Messenger: label sits on the same edge as the cluster, not centered in the column.
        outgoing ? 'justify-end self-end' : 'justify-start self-start',
      )}
    >
      <CornerUpLeft color={colors.muted} size={11} />
      <Text
        variant="label"
        className="font-medium text-muted"
        numberOfLines={1}
      >
        {replyCaption({
          outgoing,
          senderName,
          quotedName: quoted.name,
          quotedIsMe: quoted.isMe,
        })}
      </Text>
    </View>
  )
})

const QuoteChrome = memo(function QuoteChrome({
  quoted,
  outgoing,
  senderName,
}: {
  quoted: QuotedMessage
  outgoing: boolean
  senderName?: string
}) {
  if (
    quoted.layoutMode === 'header-only' ||
    quoted.layoutMode === 'fused-on-image'
  ) {
    return (
      <View className={cn('mb-0.5', outgoing ? 'items-end' : 'items-start')}>
        <QuoteCaption quoted={quoted} outgoing={outgoing} senderName={senderName} />
      </View>
    )
  }

  return (
    <View className={cn('mb-0.5', outgoing ? 'items-end' : 'items-start')}>
      <QuoteCaption quoted={quoted} outgoing={outgoing} senderName={senderName} />
      <View className="max-w-[92%] flex-row items-center gap-2 overflow-hidden rounded-[18px] border border-line/80 bg-line/35 opacity-90">
        {quoted.thumbUri ? (
          // `<Image>` cannot decode mp4/mov, so a video quote needs a player
          // surface for its frame — otherwise the strip is a blank grey square.
          quoted.attachmentKind === 'video' ? (
            <VideoThumb
              uri={quoted.thumbUri}
              size={44}
              accessibilityLabel="Quoted video"
            />
          ) : (
            <Image
              source={{ uri: quoted.thumbUri }}
              className="size-11 bg-line/50"
              resizeMode="cover"
              accessibilityLabel="Quoted photo"
            />
          )
        ) : null}
        <View
          className={cn(
            'min-w-0 py-1.5',
            // `flex-1` only when the thumb shares the row. As the sole child it
            // makes the row grow to its max-width cap instead of hugging the
            // text — Yoga sizes an auto-width row to the available space once a
            // child wants to grow, so a two-word quote rendered full width.
            quoted.thumbUri ? 'flex-1 pr-3' : 'shrink px-3',
          )}
        >
          <Text
            variant="label"
            className="font-normal text-ink-soft"
            numberOfLines={2}
          >
            {quoted.body}
          </Text>
        </View>
      </View>
    </View>
  )
})

const FusedImageReply = memo(function FusedImageReply({
  quoted,
  body,
  outgoing,
  senderName,
}: {
  quoted: QuotedMessage
  body: string
  outgoing: boolean
  senderName?: string
}) {
  const { width: screenW, height: screenH } = Dimensions.get('window')
  // Full bubble column — reply text can overhang the photo (Messenger).
  const columnW = Math.min(300, Math.round(screenW * 0.74))
  // Quoted photo is intentionally smaller / recessed behind the reply bubble.
  const thumbMaxW = Math.min(152, Math.round(columnW * 0.52))
  const thumbMaxH = Math.min(Math.round(screenH * 0.28), Math.round(thumbMaxW * 1.2))
  const [box, setBox] = useState(() => fitImageSize(1, 1, thumbMaxW, thumbMaxH))
  const [previewOpen, setPreviewOpen] = useState(false)
  const thumb = quoted.thumbUri

  useEffect(() => {
    if (!thumb) return
    let cancelled = false
    Image.getSize(
      thumb,
      (w, h) => {
        if (!cancelled) setBox(fitImageSize(w, h, thumbMaxW, thumbMaxH))
      },
      () => {
        if (!cancelled) setBox(fitImageSize(1, 1, thumbMaxW, thumbMaxH))
      },
    )
    return () => {
      cancelled = true
    }
  }, [thumb, thumbMaxW, thumbMaxH])

  if (!thumb) return null

  // Overlap: bubble covers the bottom ~28px of the photo for layered depth.
  const overlap = 28

  return (
    <View
      style={{ width: columnW, minWidth: columnW }}
      className={cn(outgoing ? 'items-end' : 'items-start')}
    >
      <QuoteCaption quoted={quoted} outgoing={outgoing} senderName={senderName} />
      <View
        style={{
          width: columnW,
          minWidth: columnW,
          // Room under the photo so the overhanging bubble isn’t clipped.
          paddingBottom: Math.max(0, 44 - overlap),
        }}
        className={cn(
          'relative overflow-visible',
          outgoing ? 'items-end' : 'items-start',
        )}
      >
        {/* Recessed quoted photo — behind the reply bubble */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View quoted photo"
          onPress={() => setPreviewOpen(true)}
          style={{ zIndex: 0 }}
        >
          <View
            className="overflow-hidden rounded-2xl border border-line/50 bg-line/40"
            style={{ opacity: 0.88 }}
          >
            <Image
              source={{ uri: thumb }}
              style={{ width: box.width, height: box.height }}
              resizeMode="cover"
              accessibilityLabel="Quoted photo"
            />
          </View>
        </Pressable>
        {/*
          Messenger depth: reply sits in front, same corner as the photo,
          maxWidth = full column so it extends past the image.
        */}
        <View
          style={{
            zIndex: 2,
            maxWidth: columnW,
            // Pull up so it covers the bottom of the photo.
            marginTop: -overlap,
          }}
          className={cn(
            'px-3.5 py-2 shadow-md shadow-black/20',
            outgoing
              ? 'self-end rounded-[20px] rounded-br-md bg-primary'
              : 'self-start rounded-[20px] rounded-bl-md border border-line/70 bg-bubble-in',
          )}
        >
          <Text
            variant="body"
            className={outgoing ? 'text-primary-foreground' : 'text-ink'}
          >
            {body}
          </Text>
        </View>
      </View>
      <ImagePreviewModal
        uri={thumb}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </View>
  )
})

const ReactionBadge = memo(function ReactionBadge({
  reactions,
  outgoing,
  currentUserId,
  onToggleReaction,
}: {
  reactions: ReactionGroup[]
  outgoing: boolean
  currentUserId: string
  onToggleReaction?: (emoji: string) => void
}) {
  if (reactions.length === 0) return null
  const total = reactions.reduce((n, r) => n + r.userIds.length, 0)
  return (
    <View
      className={cn(
        'absolute -bottom-3.5 z-10 flex-row items-center rounded-full border border-line/80 bg-surface px-2 py-0.5 shadow-md shadow-black/15',
        outgoing ? 'right-2' : 'left-2',
      )}
    >
      {reactions.map((reaction) =>
        onToggleReaction ? (
          <Pressable
            key={reaction.emoji}
            accessibilityRole="button"
            accessibilityLabel={`React ${reaction.emoji}`}
            onPress={() => {
              hapticSelection()
              onToggleReaction(reaction.emoji)
            }}
            className="px-0.5 active:opacity-60"
          >
            <Text variant="meta">{reaction.emoji}</Text>
          </Pressable>
        ) : (
          <View key={reaction.emoji} className="px-0.5">
            <Text variant="meta">{reaction.emoji}</Text>
          </View>
        ),
      )}
      {total > 1 ? (
        <Text
          variant="label"
          className={cn(
            'ml-1 font-bold',
            reactions.some((r) => r.userIds.includes(currentUserId))
              ? 'text-primary'
              : 'text-muted',
          )}
        >
          {total}
        </Text>
      ) : null}
    </View>
  )
})

/** Shared, so a bubble with nothing attached is handed the same array every render. */
const NO_ATTACHMENTS: AttachmentView[] = []

/**
 * What a screen reader is told a bubble is.
 *
 * The count is named where there is more than one, because "Incoming image" for
 * a message carrying four of them describes a message that was not sent.
 */
function attachmentLabel(attachments: AttachmentView[], outgoing: boolean): string {
  const direction = outgoing ? 'Outgoing' : 'Incoming'
  const first = attachments[0]
  if (!first) return `${direction} message`
  if (attachments.length === 1) return `${direction} ${first.kind}`
  return `${direction} message with ${attachments.length} attachments`
}

export const MessageBubble = memo(function MessageBubble({
  messageId,
  body,
  outgoing,
  status,
  delivery,
  onRetrySend,
  senderName,
  quoted,
  reactions = [],
  currentUserId,
  selected,
  enter,
  attachments = NO_ATTACHMENTS,
  onOpenMenu,
  onReply,
  onToggleReaction,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const isFirstMount = useRef(true)
  const reduceMotion = useReducedMotion()
  const x = useSharedValue(0)
  const tint = useSharedValue(0)
  const swipedHaptic = useSharedValue(false)
  // The first attachment shapes the bubble; the rest are stacked inside it.
  const attachment = attachments[0]
  const trailing = attachments.slice(1)
  // A lone image or video goes borderless. A second attachment beneath it needs
  // somewhere to sit, so a message carrying more than one keeps its chrome.
  const borderless = isImageOrVideo(attachment) && trailing.length === 0
  const hasText = body.trim().length > 0
  const showChromeBubble = !borderless && (hasText || !!attachment)
  const fused =
    quoted?.layoutMode === 'fused-on-image' &&
    hasText &&
    !attachment &&
    !!quoted.thumbUri
  const showQuoteChrome = !!quoted && !fused
  const showMainBubble = !fused && (showChromeBubble || borderless || hasText)
  const screenW = Dimensions.get('window').width
  /** Force wide column when image/video has a caption — Yoga stretch was locking to thumb width. */
  const mediaCaptionWidth =
    borderless && hasText
      ? Math.min(300, Math.round(screenW * 0.74))
      : undefined

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (!selected && tint.value !== 0) {
      tint.value = withTiming(0, { duration: 60 })
    }
  }, [selected, tint])

  useEffect(() => {
    return () => {
      cancelAnimation(tint)
      cancelAnimation(x)
    }
  }, [tint, x])

  const reportOpen = useCallback(
    (absX: number, absY: number) => {
      if (!onOpenMenu) return
      const size = sizeRef.current
      const fallback = () => {
        onOpenMenu({
          messageId,
          outgoing,
          pageX: absX - size.width / 2,
          pageY: absY - size.height / 2,
          width: size.width,
          height: size.height,
        })
      }
      const node = bubbleRef.current
      if (!node) {
        fallback()
        return
      }
      void measureWindowOrPage(node, Dimensions.get('window')).then((rect) => {
        onOpenMenu({
          messageId,
          outgoing,
          pageX: rect.x,
          pageY: rect.y,
          width: rect.width,
          height: rect.height,
        })
      })
    },
    [messageId, onOpenMenu, outgoing],
  )

  const handleReply = useCallback(() => {
    onReply(messageId)
  }, [messageId, onReply])

  const handleToggleReaction = useMemo(
    () =>
      onToggleReaction
        ? (emoji: string) => {
            onToggleReaction(messageId, emoji)
          }
        : undefined,
    [messageId, onToggleReaction],
  )

  const gesture = useMemo(
    () =>
      Gesture.Race(
        ...(onOpenMenu
          ? [
              Gesture.LongPress()
                .minDuration(LONG_PRESS_MS)
                .maxDistance(12)
                .onBegin(() => {
                  tint.value = withTiming(0.55, { duration: 80 })
                })
                .onStart((e) => {
                  tint.value = 1
                  runOnJS(hapticMedium)()
                  runOnJS(reportOpen)(e.absoluteX, e.absoluteY)
                })
                .onFinalize((_, ok) => {
                  if (!ok) tint.value = withTiming(0, { duration: 60 })
                }),
            ]
          : []),
        Gesture.Pan()
          .activeOffsetX(18)
          .failOffsetY([-18, 18])
          .onUpdate((e) => {
            x.value = Math.max(0, Math.min(e.translationX, 80))
            if (x.value >= SWIPE_REPLY && !swipedHaptic.value) {
              swipedHaptic.value = true
              runOnJS(hapticLight)()
            } else if (x.value < SWIPE_REPLY) {
              swipedHaptic.value = false
            }
          })
          .onEnd(() => {
            if (x.value >= SWIPE_REPLY) runOnJS(handleReply)()
            x.value = withSpring(0, motion.springs.overlay)
            swipedHaptic.value = false
          }),
      ),
    [handleReply, onOpenMenu, reportOpen, swipedHaptic, tint, x],
  )

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }))
  const tintStyle = useAnimatedStyle(() => ({
    opacity: tint.value,
  }))
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.value,
      [0, 20, SWIPE_REPLY],
      [0, 0.35, 1],
      Extrapolation.CLAMP,
    ),
    transform: [
      {
        scale: interpolate(
          x.value,
          [0, SWIPE_REPLY],
          [0.55, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }))

  const a11yLabel = attachmentLabel(attachments, outgoing)

  return (
    <Animated.View
      entering={enter ? deskMessageEnter(!!reduceMotion) : undefined}
      className="pb-3.5"
    >
      <View className="justify-center" pointerEvents="box-none">
        <Animated.View style={iconStyle} className="absolute left-1 z-0">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Reply color={colors.primary} size={16} />
          </View>
        </Animated.View>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={swipeStyle}
            className={cn(
              'max-w-[78%]',
              outgoing ? 'self-end items-end' : 'self-start items-start',
            )}
          >
            {senderName ? (
              <Text variant="label" className="mb-1 px-1 font-normal text-muted">
                {senderName}
              </Text>
            ) : null}
            {showQuoteChrome && quoted ? (
              <QuoteChrome
                quoted={quoted}
                outgoing={outgoing}
                senderName={senderName}
              />
            ) : null}
            {fused && quoted ? (
              <View
                className={cn(
                  'relative overflow-visible',
                  outgoing ? 'self-end' : 'self-start',
                  reactions.length > 0 && 'mb-2',
                )}
              >
                <View
                  ref={bubbleRef}
                  collapsable={false}
                  accessibilityRole="button"
                  accessibilityLabel={a11yLabel}
                  onLayout={(e) => {
                    sizeRef.current = {
                      width: e.nativeEvent.layout.width,
                      height: e.nativeEvent.layout.height,
                    }
                  }}
                >
                  <FusedImageReply
                    quoted={quoted}
                    body={body}
                    outgoing={outgoing}
                    senderName={senderName}
                  />
                  <Animated.View
                    pointerEvents="none"
                    className={cn(
                      'absolute inset-0 rounded-[18px]',
                      outgoing ? 'bg-ink/25' : 'bg-ink/12',
                    )}
                    style={tintStyle}
                  />
                </View>
                <ReactionBadge
                  reactions={reactions}
                  outgoing={outgoing}
                  currentUserId={currentUserId}
                  onToggleReaction={handleToggleReaction}
                />
              </View>
            ) : null}
            {showMainBubble ? (
            <View
              className={cn(
                'relative overflow-visible',
                outgoing ? 'self-end' : 'self-start',
                reactions.length > 0 && 'mb-2',
              )}
              style={
                mediaCaptionWidth != null
                  ? { width: mediaCaptionWidth, minWidth: mediaCaptionWidth }
                  : undefined
              }
            >
              <View
                ref={bubbleRef}
                collapsable={false}
                accessibilityRole="button"
                accessibilityLabel={a11yLabel}
                onLayout={(e) => {
                  sizeRef.current = {
                    width: e.nativeEvent.layout.width,
                    height: e.nativeEvent.layout.height,
                  }
                }}
                className={cn(
                  'relative overflow-hidden shadow-sm',
                  showChromeBubble && 'px-4 py-2.5',
                  showChromeBubble &&
                    (outgoing
                      ? 'rounded-[22px] rounded-br-md bg-primary shadow-primary/25'
                      : 'rounded-[22px] rounded-bl-md border border-line/70 bg-bubble-in shadow-black/8'),
                  borderless && 'bg-transparent shadow-none',
                )}
                style={
                  mediaCaptionWidth != null
                    ? { width: mediaCaptionWidth, minWidth: mediaCaptionWidth }
                    : undefined
                }
              >
                {attachment ? (
                  <MessageMedia
                    attachment={attachment}
                    outgoing={outgoing}
                    caption={borderless ? body : undefined}
                  />
                ) : null}
                {trailing.map((extra, index) => (
                  <View
                    // Nothing in an attachment is a stable identity — two photos
                    // from one camera roll can share a URI after a re-pick — and
                    // the list is fixed for the life of the message, so the
                    // position is the honest key.
                    key={`${extra.uri}-${index}`}
                    className="mt-2"
                  >
                    <MessageMedia attachment={extra} outgoing={outgoing} />
                  </View>
                ))}
                {!borderless && hasText ? (
                  <Text
                    variant="body"
                    className={cn(
                      attachment ? 'mt-1.5' : undefined,
                      outgoing ? 'text-primary-foreground' : 'text-ink',
                    )}
                  >
                    {body}
                  </Text>
                ) : null}
                {!attachment && !hasText ? (
                  <Text
                    variant="body"
                    className={outgoing ? 'text-primary-foreground' : 'text-ink'}
                  >
                    {' '}
                  </Text>
                ) : null}
                <Animated.View
                  pointerEvents="none"
                  className={cn(
                    'absolute inset-0',
                    outgoing ? 'bg-ink/25' : 'bg-ink/12',
                  )}
                  style={tintStyle}
                />
              </View>
              <ReactionBadge
                reactions={reactions}
                outgoing={outgoing}
                currentUserId={currentUserId}
                onToggleReaction={handleToggleReaction}
              />
            </View>
            ) : null}
            {outgoing && delivery ? (
              <Delivery state={delivery} messageId={messageId} onRetry={onRetrySend} />
            ) : (
              <Receipt status={status} outgoing={outgoing} />
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  )
})
