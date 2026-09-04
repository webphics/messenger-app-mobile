import { X } from '@/components/icons'
import { Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'

import { colors, screenBottomPad, screenTopPad } from '@/lib/tokens'

type VideoPreviewModalProps = {
  uri: string
  name?: string
  visible: boolean
  onClose: () => void
}

/**
 * Full-bleed video preview, the counterpart to `ImagePreviewModal`.
 *
 * A video in a thread plays where it sits, because there is a bubble around it
 * and a caption under it. A tile in the gallery is a 3-across square, which is
 * not a thing anybody watches — so tapping one opens the clip at the size of the
 * screen, with the platform's own controls, which is what the bubble gives it
 * too.
 *
 * Mounted only while open. `useVideoPlayer` holds a native player for as long as
 * the component lives, and a gallery of twenty clips must not hold twenty of
 * them; the tiles use `VideoThumb` for a poster and this exists for one at a
 * time.
 */
export function VideoPreviewModal({
  uri,
  name,
  visible,
  onClose,
}: VideoPreviewModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Its own Android window — nest SafeAreaProvider so insets are not the
          consumed root ones. */}
      <SafeAreaProvider>
        {visible ? <PreviewSurface uri={uri} name={name} onClose={onClose} /> : null}
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
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false
    // Opening a clip from a gallery is asking to watch it; the controls are
    // there for everything after that.
    p.play()
  })

  return (
    <View className="flex-1 bg-ink">
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
        className="flex-1 items-center justify-center px-2"
        style={{
          paddingTop: screenTopPad(insets.top),
          paddingBottom: screenBottomPad(insets.bottom, 8),
        }}
      >
        <VideoView
          player={player}
          accessibilityLabel={name || 'Video'}
          style={{ width: width - 16, height: height * 0.72 }}
          contentFit="contain"
          nativeControls
        />
      </View>
    </View>
  )
}
