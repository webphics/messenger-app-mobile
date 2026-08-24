import {
  Camera,
  FileText,
  Image as ImageIcon,
  Sparkles,
  X,
} from '@/components/icons'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  View,
} from 'react-native'
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
import { hapticLight, hapticSelection } from '@/lib/haptics'
import { motion } from '@/lib/motion'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { MessageAttachment } from '@/lib/types'

type AttachmentSheetProps = {
  visible: boolean
  onClose: () => void
  onPicked: (attachment: MessageAttachment) => void
  onInsertText: (text: string) => void
}

/**
 * `pick` options open a native picker and resolve to a real Attachment;
 * `insert` options are pure text (quick replies).
 */
type AttachmentOption =
  | {
      id: string
      title: string
      subtitle: string
      icon: typeof ImageIcon
      pick: () => Promise<AttachmentOutcome>
      insertText?: never
    }
  | {
      id: string
      title: string
      subtitle: string
      icon: typeof ImageIcon
      pick?: never
      insertText: string
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
  {
    id: 'quick-reply',
    title: 'Quick Response',
    subtitle: 'Insert standard support greeting',
    icon: Sparkles,
    insertText: 'Hi there! Thanks for reaching out. How can I assist you today?',
  },
]

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
  translateY,
  children,
}: {
  translateY: Animated.Value
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const bottomPad = screenBottomPad(insets.bottom, 16)

  return (
    <Animated.View
      style={[{ transform: [{ translateY }] }, { paddingBottom: bottomPad }]}
      className="rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-2 shadow-2xl shadow-black/20"
    >
      {children}
    </Animated.View>
  )
}

export function AttachmentSheet({
  visible,
  onClose,
  onPicked,
  onInsertText,
}: AttachmentSheetProps) {
  // Lazy initialiser, not `useRef(new Animated.Value(400))`: useRef evaluates
  // its argument on every render and discards all but the first, so the plain
  // form allocates a throwaway Animated.Value per render.
  const [translateY] = useState(() => new Animated.Value(400))
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      translateY.setValue(400)
      Animated.spring(translateY, {
        toValue: 0,
        damping: motion.springs.overlay.damping,
        stiffness: motion.springs.overlay.stiffness,
        mass: motion.springs.overlay.mass,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, translateY])

  function dismiss() {
    Animated.timing(translateY, {
      toValue: 400,
      duration: motion.durations.overlay,
      useNativeDriver: true,
    }).start(() => {
      onClose()
    })
  }

  function handleSelectText(insertText: string) {
    hapticSelection()
    onInsertText(insertText)
    dismiss()
  }

  async function handleOption(option: AttachmentOption) {
    if (pendingId) return

    if (option.insertText !== undefined) {
      handleSelectText(option.insertText)
      return
    }

    hapticSelection()
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

  // Dedicated PanResponder for the top grab handle + header area (circled section).
  // Lazy initialiser for the same reason as translateY above — PanResponder.create
  // builds an object and six closures, and useRef would rebuild them every render.
  const [headerPanResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dy > 2 || Math.abs(gesture.dy) > Math.abs(gesture.dx)
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        return gesture.dy > 2
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy)
        } else {
          translateY.setValue(gesture.dy * 0.15)
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 45 || gesture.vy > 0.25) {
          hapticLight()
          dismiss()
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: motion.springs.overlay.damping,
            stiffness: motion.springs.overlay.stiffness,
            mass: motion.springs.overlay.mass,
            useNativeDriver: true,
          }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          damping: motion.springs.overlay.damping,
          stiffness: motion.springs.overlay.stiffness,
          mass: motion.springs.overlay.mass,
          useNativeDriver: true,
        }).start()
      },
    }),
  )

  // PanResponder for downward drag on the option list area
  const [bodyPanResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        return gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx)
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy)
        } else {
          translateY.setValue(gesture.dy * 0.15)
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 55 || gesture.vy > 0.3) {
          hapticLight()
          dismiss()
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: motion.springs.overlay.damping,
            stiffness: motion.springs.overlay.stiffness,
            mass: motion.springs.overlay.mass,
            useNativeDriver: true,
          }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          damping: motion.springs.overlay.damping,
          stiffness: motion.springs.overlay.stiffness,
          mass: motion.springs.overlay.mass,
          useNativeDriver: true,
        }).start()
      },
    }),
  )

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, 260],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
    >
      <SafeAreaProvider>
        <View className="flex-1 justify-end">
          <Animated.View
            style={{ opacity: backdropOpacity }}
            className="absolute inset-0 bg-black/40"
          >
            <Pressable className="flex-1" onPress={dismiss} />
          </Animated.View>

          <SheetSurface translateY={translateY}>
            <View {...headerPanResponder.panHandlers} className="pb-3 pt-1">
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
                  onPress={dismiss}
                  className="size-8 items-center justify-center rounded-full bg-line/80"
                >
                  <X color={colors.inkSoft} size={16} />
                </TactilePressable>
              </View>
            </View>

            <View {...bodyPanResponder.panHandlers} className="gap-2 pb-1">
              {ATTACHMENT_OPTIONS.map((item) => (
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
    </Modal>
  )
}
