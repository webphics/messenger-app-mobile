import { X } from '@/components/icons'
import { Modal, Pressable, Image, View, useWindowDimensions } from 'react-native'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'

import { colors, screenBottomPad, screenTopPad } from '@/lib/tokens'

type ImagePreviewModalProps = {
  uri: string
  name?: string
  visible: boolean
  onClose: () => void
}

/**
 * Full-bleed photo preview. Modal is its own Android window — nest
 * SafeAreaProvider so insets are not the consumed root ones.
 */
export function ImagePreviewModal({
  uri,
  name,
  visible,
  onClose,
}: ImagePreviewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        <PreviewSurface uri={uri} name={name} onClose={onClose} />
      </SafeAreaProvider>
    </Modal>
  )
}

function PreviewSurface({
  uri,
  name,
  onClose,
}: {
  uri: string
  name?: string
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()

  return (
    <View className="flex-1 bg-ink">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close image preview"
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 z-10 flex-row justify-end px-3"
        style={{ paddingTop: screenTopPad(insets.top) }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={onClose}
          className="size-11 items-center justify-center rounded-full bg-ink/60"
        >
          <X color={colors.primaryForeground} size={22} />
        </Pressable>
      </View>
      <View
        pointerEvents="box-none"
        className="flex-1 items-center justify-center px-2"
        style={{
          paddingTop: screenTopPad(insets.top),
          paddingBottom: screenBottomPad(insets.bottom, 8),
        }}
      >
        <Pressable onPress={onClose} accessibilityLabel={name || 'Photo'}>
          <Image
            source={{ uri }}
            accessibilityLabel={name || 'Photo'}
            resizeMode="contain"
            style={{
              width: width - 16,
              height: height * 0.82,
            }}
          />
        </Pressable>
      </View>
    </View>
  )
}
