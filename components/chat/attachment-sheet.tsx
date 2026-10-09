import {
  Camera,
  FileText,
  Flag,
  Image as ImageIcon,
  MessageSquare,
  // Sparkles, // hidden with Quick Response
  X,
} from '@/components/icons'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type PanGesture,
} from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'

import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import {
  capturePhoto,
  pickDocument,
  pickFromLibrary,
  type AttachmentOutcome,
} from '@/lib/attachments'
import { motion } from '@/lib/motion'
import { shouldDismissSheet } from '@/lib/sheet-dismiss'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { AttachmentView } from '@/lib/types'

type AttachmentSheetProps = {
  visible: boolean
  onClose: () => void
  onPicked: (attachment: AttachmentView) => void
  onInsertText: (text: string) => void
  /**
   * Offered only where the composer can use saved responses: staff, in a thread
   * that belongs to an organization. Called once the sheet has finished closing,
   * because Android and iOS will not raise the picker's own window over one that
   * is still animating out.
   */
  onOpenSavedResponses?: () => void
  /**
   * Offered only to a Customer in their General Support: marks the next message as a Complaint.
   * Called as the sheet closes; the strip it raises is part of the composer, not a window.
   */
  onStartComplaint?: () => void
}

/**
 * `pick` options open a native picker and resolve to a real Attachment;
 * `insert` options are pure text (quick replies); `open` options hand off to a
 * screen of their own once this sheet has gone.
 */
type AttachmentOption =
  | {
      id: string
      title: string
      subtitle: string
      icon: typeof ImageIcon
      pick: () => Promise<AttachmentOutcome>
      insertText?: never
      open?: never
    }
  | {
      id: string
      title: string
      subtitle: string
      icon: typeof ImageIcon
      pick?: never
      insertText: string
      open?: never
    }
  | {
      id: string
      title: string
      subtitle: string
      icon: typeof ImageIcon
      pick?: never
      insertText?: never
      open: 'saved-responses' | 'complaint'
    }

const ATTACHMENT_OPTIONS: AttachmentOption[] = [
  {
    id: 'photo',
    title: 'Photo & Video Library',
    subtitle: 'Share images or screenshots',
    icon: ImageIcon,
    pick: pickFromLibrary,
  },
  {
    id: 'camera',
    title: 'Take Photo',
    subtitle: 'Capture photo with camera',
    icon: Camera,
    pick: capturePhoto,
  },
  {
    id: 'document',
    title: 'Document',
    subtitle: 'Attach invoice or PDF',
    icon: FileText,
    pick: pickDocument,
  },
  // Quick Response is hidden for now. It is the only `insert` option in the
  // sheet, so the union above and `onInsertText` are deliberately left in place
  // rather than narrowed to the `pick` half — narrowing them is a rewrite to
  // undo. Restore by uncommenting.
  // {
  //   id: 'quick-reply',
  //   title: 'Quick Response',
  //   subtitle: 'Insert standard support greeting',
  //   icon: Sparkles,
  //   insertText: 'Hi there! Thanks for reaching out. How can I assist you today?',
  // },
]

/**
 * What replaced the hidden Quick Response above: the organization's real saved
 * responses rather than one sentence written into the build.
 */
const SAVED_RESPONSES_OPTION: AttachmentOption = {
  id: 'saved-responses',
  title: 'Saved responses',
  subtitle: 'Insert an answer your team has saved',
  icon: MessageSquare,
  open: 'saved-responses',
}

/** Marks the next message as a Complaint, which only Admins read. */
const COMPLAINT_OPTION: AttachmentOption = {
  id: 'complaint',
  title: 'Send as a complaint',
  subtitle: 'Only admins will see it',
  icon: Flag,
  open: 'complaint',
}

const DENIED_COPY = {
  camera: {
    title: 'Camera access needed',
    body: 'Enable camera access in Settings to take a photo from here.',
  },
  library: {
    title: 'Photo access needed',
    body: 'Enable photo access in Settings to attach images or video.',
  },
} as const

function SheetSurface({
  y,
  drag,
  onMeasure,
  children,
}: {
  y: SharedValue<number>
  /** Wrapped around the surface itself — `GestureDetector` needs the ref. */
  drag: PanGesture
  onMeasure: (height: number) => void
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const bottomPad = screenBottomPad(insets.bottom, 16)
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }))

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => {
          onMeasure(e.nativeEvent.layout.height)
        }}
        style={[style, { paddingBottom: bottomPad }]}
        className="rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-2 shadow-2xl shadow-black/20"
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
}

export function AttachmentSheet({
  visible,
  onClose,
  onPicked,
  onInsertText,
  onOpenSavedResponses,
  onStartComplaint,
}: AttachmentSheetProps) {
  // Somewhere to start before the sheet has been laid out. Replaced by the
  // real height on the first `onLayout`, which is well before a finger can
  // reach it, but a sheet that opened from a guess would still be a sheet that
  // opened.
  const [restingHeight] = useState(() => Dimensions.get('window').height)
  const height = useSharedValue(restingHeight)
  const y = useSharedValue(restingHeight)
  /** Where the sheet was when the finger landed on it. */
  const start = useSharedValue(0)
  const reduceMotion = useReducedMotion()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const options = useMemo(
    () => [
      ...ATTACHMENT_OPTIONS,
      ...(onOpenSavedResponses ? [SAVED_RESPONSES_OPTION] : []),
      ...(onStartComplaint ? [COMPLAINT_OPTION] : []),
    ],
    [onOpenSavedResponses, onStartComplaint],
  )

  const measure = useCallback(
    (measured: number) => {
      if (measured > 0) height.set(measured)
    },
    [height],
  )

  useEffect(() => {
    if (!visible) return
    y.set(height.get())
    if (reduceMotion) {
      y.set(0)
      return
    }
    y.set(withSpring(0, motion.springs.overlay))
  }, [visible, reduceMotion, height, y])

  const dismiss = useCallback(
    (velocity = 0) => {
      if (reduceMotion) {
        y.set(height.get())
        onClose()
        return
      }
      // Clamped: past the bottom edge is off screen, and a sheet that
      // overshot would spring back up into view on its way out.
      y.set(
        withSpring(
          height.get(),
          { ...motion.springs.overlay, velocity, overshootClamping: true },
          (done) => {
            if (done) scheduleOnRN(onClose)
          },
        ),
      )
    },
    [height, onClose, reduceMotion, y],
  )

  /**
   * One gesture over the whole sheet rather than a handler per region.
   *
   * `activeOffsetY` is what keeps the option rows tappable: a press that never
   * travels 12px vertically is never claimed here, so the pan only exists once
   * somebody has plainly started dragging. Everything below runs on the UI
   * thread — the sheet follows the finger whatever React is doing.
   */
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onStart(() => {
          // Where the sheet actually is, which is not always where it rests: a
          // finger landing on one still springing open has to carry on from the
          // frame the eye last saw. Tracking the raw translation instead would
          // read the sheet as being at 0 and snap it there on the first frame.
          start.set(y.get())
        })
        .onUpdate((e) => {
          // Down is the way out and tracks exactly; up is resistance, because
          // there is nothing above this sheet to drag it to.
          const next = start.get() + e.translationY
          y.set(next >= 0 ? next : next * motion.rubberBand)
        })
        .onEnd((e) => {
          if (
            shouldDismissSheet({
              // How far down the sheet is, not how far the finger moved — the
              // two differ for exactly the grab `onStart` exists to handle.
              travel: y.get(),
              velocity: e.velocityY,
              height: height.get(),
            })
          ) {
            scheduleOnRN(dismiss, e.velocityY)
            return
          }
          y.set(withSpring(0, { ...motion.springs.overlay, velocity: e.velocityY }))
        }),
    [dismiss, height, start, y],
  )

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.get(),
      [0, height.get()],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }))

  function handleSelectText(insertText: string) {
    onInsertText(insertText)
    dismiss()
  }

  async function handleOption(option: AttachmentOption) {
    if (pendingId) return

    if (option.open === 'complaint') {
      onStartComplaint?.()
      dismiss()
      return
    }

    if (option.open !== undefined) {
      // The composer raises the picker from `onClose`, after this sheet is gone.
      onOpenSavedResponses?.()
      dismiss()
      return
    }

    if (option.insertText !== undefined) {
      handleSelectText(option.insertText)
      return
    }

    setPendingId(option.id)
    try {
      const outcome = await option.pick()
      if (outcome.status === 'picked') {
        onPicked(outcome.attachment)
        dismiss()
        return
      }
      if (outcome.status === 'denied') {
        if (outcome.reason !== 'denied-settings') return
        const copy = DENIED_COPY[outcome.scope]
        Alert.alert(copy.title, copy.body)
      }
    } catch {
      Alert.alert('Could not attach', 'Something went wrong opening that picker.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => dismiss()}
    >
      {/* A `Modal` is its own view root on Android: gestures inside it are not
          seen by the app's `GestureHandlerRootView`, so the sheet brings one. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View className="flex-1 justify-end">
            <Animated.View
              style={backdropStyle}
              className="absolute inset-0 bg-black/40"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                className="flex-1"
                onPress={() => dismiss()}
              />
            </Animated.View>

            <SheetSurface y={y} drag={drag} onMeasure={measure}>
              <View className="pb-3 pt-1">
                <View className="items-center py-2.5">
                  <View className="h-1.5 w-12 rounded-full bg-line" />
                </View>

                <View className="flex-row items-center justify-between px-1">
                  <Text variant="title" className="font-bold text-ink">
                    Share & Attach
                  </Text>
                  <TactilePressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={() => dismiss()}
                    className="size-8 items-center justify-center rounded-full bg-line/80"
                  >
                    <X color={colors.inkSoft} size={16} />
                  </TactilePressable>
                </View>
              </View>

              <View className="gap-2 pb-1">
                {options.map((item) => (
                  <TactilePressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    accessibilityState={{
                      disabled: pendingId !== null,
                      busy: pendingId === item.id,
                    }}
                    disabled={pendingId !== null}
                    onPress={() => void handleOption(item)}
                    className="flex-row items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-xs shadow-black/8 active:bg-primary-soft/40"
                  >
                    <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
                      {pendingId === item.id ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <item.icon color={colors.primary} size={22} />
                      )}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="meta" className="font-semibold text-ink">
                        {item.title}
                      </Text>
                      <Text variant="label" className="mt-0.5 font-normal text-muted">
                        {item.subtitle}
                      </Text>
                    </View>
                  </TactilePressable>
                ))}
              </View>
            </SheetSurface>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  )
}
