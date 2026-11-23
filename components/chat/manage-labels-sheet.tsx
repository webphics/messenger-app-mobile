import { Modal, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Tag, X } from '@/components/icons'
import { LabelsScreen } from '@/components/hub/labels-screen'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { colors, screenTopPad } from '@/lib/tokens'
import type { Label } from '@/lib/types'

/**
 * The label manager, over the thread it was opened from.
 *
 * The same screen as the Admin Hub's Labels route — create, retire, bring
 * back — and the only way to it for an Agent holding `manage_labels`, since
 * the Hub lives under `(admin)`. The web client's Manage labels dialog is the
 * same arrangement: deciding which labels exist stays its own place, and the
 * conversation is a door to it rather than a second copy of it.
 *
 * Mounted only while open, so each open reads the catalogue afresh.
 */
export function ManageLabelsSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean
  onClose: () => void
  /** Every label the manager wrote, so the card underneath stays true. */
  onChanged: (label: Label) => void
}) {
  if (!visible) return null
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* A Modal is its own window, so it needs its own insets. */}
      <SafeAreaProvider>
        <SheetBody onClose={onClose} onChanged={onChanged} />
      </SafeAreaProvider>
    </Modal>
  )
}

function SheetBody({
  onClose,
  onChanged,
}: {
  onClose: () => void
  onChanged: (label: Label) => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}>
      <View className="flex-row items-center justify-between bg-surface px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <Tag color={colors.primary} size={18} />
          </View>
          <Text variant="headline" className="text-ink">
            Manage labels
          </Text>
        </View>
        <TactilePressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onClose}
          className="size-9 items-center justify-center rounded-full bg-line/80"
        >
          <X color={colors.inkSoft} size={18} />
        </TactilePressable>
      </View>
      <LabelsScreen onChanged={onChanged} bottomInset={insets.bottom} />
    </View>
  )
}
