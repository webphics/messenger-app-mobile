import { router, type Href } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, View } from 'react-native'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'

import { MessageSquare, X } from '@/components/icons'
import { SearchFieldWithClear } from '@/components/search-field-with-clear'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { listCannedReplies } from '@/lib/canned-reply-api'
import { visibleCannedReplies } from '@/lib/canned-reply-library'
import { failureNotice } from '@/lib/conversation-failure'
import { colors, screenBottomPad, screenTopPad } from '@/lib/tokens'
import type { CannedReply } from '@/lib/types'

/**
 * Picking a saved response to put in the composer.
 *
 * Selecting inserts text and does nothing else — no send, no status change, no
 * label. Each of those has a policy in front of it that does not stop applying
 * because a saved response invoked it, and an Agent can still edit the words
 * before they go.
 *
 * Only the thread's own organization's responses are offered, and never an
 * archived one: a response names one company's policies, and one from another
 * organization is one tap from being sent to the wrong customer.
 */

type SavedResponsePickerProps = {
  visible: boolean
  onClose: () => void
  organizationId: string
  /** Admins are pointed at the screen that manages the library when it is empty. */
  canManage: boolean
  onSelect: (reply: CannedReply) => void
}

type PickerState =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; replies: CannedReply[] }

export function SavedResponsePicker({ visible, ...props }: SavedResponsePickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      {/* Its own window, so its own inset provider — see NewChatModal. */}
      <SafeAreaProvider>
        <PickerBody {...props} />
      </SafeAreaProvider>
    </Modal>
  )
}

function keyExtractor(item: CannedReply) {
  return item.id
}

function PickerBody({
  onClose,
  organizationId,
  canManage,
  onSelect,
}: Omit<SavedResponsePickerProps, 'visible'>) {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<PickerState>({ status: 'loading' })
  const [search, setSearch] = useState('')

  // Read on every opening rather than cached: the body mounts with the sheet,
  // and a library an admin changed a minute ago should be the one offered.
  const load = useCallback(() => {
    void listCannedReplies({ organizationId }).then((result) => {
      if (result.ok) {
        setState({ status: 'ready', replies: result.value })
        return
      }
      const notice = failureNotice(result.failure, 'Could not load saved responses')
      setState({ status: 'failed', title: notice.title, hint: notice.hint })
    })
  }, [organizationId])

  useEffect(() => load(), [load])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    load()
  }, [load])

  const library = useMemo(() => (state.status === 'ready' ? state.replies : []), [state])
  const rows = useMemo(
    () => visibleCannedReplies(library, { showArchived: false, search }),
    [library, search],
  )

  /**
   * Leave the thread first, then go. The thread sits on the root stack above the
   * admin tabs, and a push or a navigate from here builds a second copy of those
   * tabs holding only this screen — no back arrow to the hub, and a stale copy
   * left under the Home tab (seen on the emulator with both). Popping the thread
   * lands in the tabs already mounted, and a navigate from there opens the screen
   * on the Home stack, above the hub. The router queues the two in order.
   */
  const manage = useCallback(() => {
    onClose()
    if (router.canGoBack()) router.back()
    router.navigate('/(admin)/saved-responses' as Href)
  }, [onClose])

  const renderItem = useCallback(
    ({ item }: { item: CannedReply }) => (
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`Insert ${item.title}`}
        onPress={() => onSelect(item)}
        className="gap-1 rounded-2xl border border-line/70 bg-surface p-3.5 active:bg-primary-soft/40"
      >
        <Text variant="label" className="font-semibold text-ink" numberOfLines={1}>
          {item.title}
        </Text>
        {/* Two lines: enough to tell two similar titles apart without a scroll through paragraphs. */}
        <Text variant="meta" className="text-muted" numberOfLines={2}>
          {item.body}
        </Text>
      </TactilePressable>
    ),
    [onSelect],
  )

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="gap-3 border-b border-line/60 bg-surface px-4 pb-3.5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
              <MessageSquare color={colors.primary} size={18} />
            </View>
            <Text variant="headline" className="text-ink">
              Saved responses
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
        <SearchFieldWithClear
          value={search}
          onChangeText={setSearch}
          placeholder="Search saved responses…"
          accessibilityLabel="Search saved responses"
        />
      </View>

      <FlatList
        className="flex-1 bg-bg"
        data={rows}
        keyExtractor={keyExtractor}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 py-3"
        contentContainerStyle={{ paddingBottom: screenBottomPad(insets.bottom, 12) }}
        renderItem={renderItem}
        ListEmptyComponent={
          // Four answers, never conflated. Loading is not none, none is not none
          // matching the search, and a failed read is not an empty library — an
          // Agent told "nothing saved" when the read failed goes and retypes an
          // answer that was there all along.
          state.status === 'loading' ? (
            <View className="py-12">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : state.status === 'failed' ? (
            <View className="items-center px-4 py-12">
              <Text variant="title" className="text-center text-ink">
                {state.title}
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {state.hint}
              </Text>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={retry}
                className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
              >
                <Text variant="label" className="font-semibold text-primary-foreground">
                  Try again
                </Text>
              </TactilePressable>
            </View>
          ) : library.length === 0 ? (
            <View className="items-center px-4 py-12">
              <Text variant="title" className="text-center text-ink">
                No saved responses yet
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                {canManage
                  ? 'Add the answers your team sends most often, and they will be offered here.'
                  : 'Ask an admin to add some for this organization.'}
              </Text>
              {canManage ? (
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="Manage saved responses"
                  onPress={manage}
                  className="mt-4 min-h-11 justify-center rounded-full bg-primary px-5"
                >
                  <Text variant="label" className="font-semibold text-primary-foreground">
                    Manage saved responses
                  </Text>
                </TactilePressable>
              ) : null}
            </View>
          ) : (
            <View className="items-center px-4 py-12">
              <Text variant="title" className="text-center text-ink">
                Nothing matches that search
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Try a word from the title or the text.
              </Text>
            </View>
          )
        }
      />
    </View>
  )
}
