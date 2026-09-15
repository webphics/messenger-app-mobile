import * as Clipboard from 'expo-clipboard'
import { Modal, Pressable, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Ban, Copy, Link, Pencil, Trash2 } from '@/components/icons'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { hapticSuccess } from '@/lib/haptics'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { WallPostAction } from '@/lib/wall-actions'
import type { WallPost } from '@/lib/types'

/**
 * What the control at the top of a Post's card opens.
 *
 * A sheet rather than a menu, which is what every other list of choices in this
 * app is, and it draws exactly the actions `wallPostActions` returned — so the
 * card can be sure it never opens an empty one.
 *
 * `edit`, `delete` and `takedown` close the sheet and hand the tap up rather
 * than acting here: an edit opens a second sheet of its own
 * (`WallPostEditSheet`) and a removal needs a confirmation first
 * (`WallPostCard`'s `Alert.alert`), neither of which belongs inside a sheet
 * that is about to be dismissed out from under them.
 */

const LABELS: Record<WallPostAction, { title: string; icon: typeof Copy; destructive?: boolean }> = {
  'copy-body': { title: 'Copy text', icon: Copy },
  'copy-link': { title: 'Copy link', icon: Link },
  edit: { title: 'Edit post', icon: Pencil },
  delete: { title: 'Delete post', icon: Trash2, destructive: true },
  takedown: { title: 'Take down', icon: Ban, destructive: true },
}

type SheetProps = {
  onClose: () => void
  post: WallPost
  actions: WallPostAction[]
  onEdit: () => void
  onRemove: (mode: 'delete' | 'takedown') => void
}

export function WallPostActionsSheet({
  visible,
  ...sheet
}: SheetProps & { visible: boolean }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={sheet.onClose}
      statusBarTranslucent
    >
      {/*
        A Modal is its own Android window, so the insets the root provider holds
        have already been consumed by the screen underneath: read without one of
        its own, the bottom inset is zero and the sheet sits under the gesture
        bar. `ImagePreviewModal` nests one for the same reason.
      */}
      <SafeAreaProvider>
        <Sheet {...sheet} />
      </SafeAreaProvider>
    </Modal>
  )
}

function Sheet({ onClose, post, actions, onEdit, onRemove }: SheetProps) {
  const insets = useSafeAreaInsets()

  async function run(action: WallPostAction) {
    if (action === 'edit') {
      onClose()
      onEdit()
      return
    }
    if (action === 'delete' || action === 'takedown') {
      onClose()
      onRemove(action)
      return
    }

    const text = action === 'copy-body' ? (post.body ?? '') : (post.link?.url ?? '')
    if (text !== '') {
      await Clipboard.setStringAsync(text)
      hapticSuccess()
    }
    onClose()
  }

  return (
    <View className="flex-1 justify-end bg-black/40">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        className="rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
      >
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
        {actions.map(action => {
          const { title, icon: Icon, destructive } = LABELS[action]
          return (
            <TactilePressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={title}
              onPress={() => void run(action)}
              className="min-h-14 flex-row items-center gap-3 rounded-2xl px-2"
            >
              <View
                className={cn(
                  'size-9 items-center justify-center rounded-xl',
                  destructive ? 'bg-danger/10' : 'bg-primary-soft',
                )}
              >
                <Icon color={destructive ? colors.danger : colors.primary} size={18} />
              </View>
              <Text variant="title" className={destructive ? 'text-danger' : 'text-ink'}>
                {title}
              </Text>
            </TactilePressable>
          )
        })}
      </View>
    </View>
  )
}
