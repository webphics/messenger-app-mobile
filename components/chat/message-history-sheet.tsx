import { useMemo } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { messageHistoryRows } from '@/lib/message-history'
import { formatReceiptStamp } from '@/lib/message-receipt-format'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { Message } from '@/lib/types'
import { useMessageHistory } from '@/lib/use-message-history'

/**
 * Every wording one message has had, newest first, each with when it was
 * written: what "(edited)" on a bubble is a claim about, made checkable.
 *
 * Who wrote a wording is drawn only when the API names them, and it never names
 * them to a Customer — they see that an Agent's reply changed and what it said
 * before, not who changed it. Nothing here branches on a role.
 */

type MessageHistorySheetProps = {
  conversationId: string
  /** The message whose history is open, or null when the sheet is closed. */
  message: Message | null
  onClose: () => void
}

export function MessageHistorySheet({ conversationId, message, onClose }: MessageHistorySheetProps) {
  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A Modal is its own Android window, so it needs its own SafeAreaProvider,
          as the edit sheet does. */}
      <SafeAreaProvider>
        {message ? (
          <HistorySheet conversationId={conversationId} message={message} onClose={onClose} />
        ) : null}
      </SafeAreaProvider>
    </Modal>
  )
}

function HistorySheet({
  conversationId,
  message,
  onClose,
}: {
  conversationId: string
  message: Message
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const { state, reload } = useMessageHistory(conversationId, message.id, message.editedAt)
  const rows = useMemo(
    () => (state.status === 'ready' ? messageHistoryRows(state.history) : []),
    [state],
  )

  return (
    <View className="flex-1 justify-end bg-black/40">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close edit history"
        onPress={onClose}
        className="absolute inset-0"
      />
      <View
        className="max-h-[80%] gap-3 rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
        style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
      >
        <View className="h-1 w-10 self-center rounded-full bg-line" />

        <Text variant="title" accessibilityRole="header" className="text-ink">
          Edit history
        </Text>
        <Text variant="meta" className="text-muted">
          Every version of this message, newest first. Sent {formatReceiptStamp(message.createdAt)}.
        </Text>

        {state.status === 'loading' ? (
          <View className="items-center py-6">
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading edit history" />
          </View>
        ) : state.status === 'failed' ? (
          <View className="items-start gap-2 py-2">
            <Text variant="meta" accessibilityLiveRegion="polite" className="text-danger">
              The history of this message could not be loaded.
            </Text>
            <Button variant="outline" onPress={reload}>
              <Text>Try again</Text>
            </Button>
          </View>
        ) : (
          <ScrollView contentContainerClassName="gap-2 pb-1">
            {rows.map((row, index) => {
              const stamp = formatReceiptStamp(row.writtenAt)
              const byline = [row.label, stamp, row.writtenBy?.name].filter(Boolean).join(' · ')
              return (
                <View
                  key={`${row.writtenAt}-${String(index)}`}
                  accessible
                  accessibilityLabel={`${byline}. ${row.body}`}
                  className={
                    index === 0
                      ? 'gap-1 rounded-xl rounded-l-none border-l-2 border-primary bg-primary/10 px-3 py-2'
                      : 'gap-1 rounded-xl rounded-l-none border-l-2 border-line bg-bg px-3 py-2'
                  }
                >
                  <Text variant="meta" className="tabular-nums text-muted" numberOfLines={2}>
                    {byline}
                  </Text>
                  <Text className="text-ink">{row.body}</Text>
                </View>
              )
            })}
            {state.history.originalRecorded ? null : (
              <Text variant="meta" className="text-muted">
                Earlier wordings of this message were not kept.
              </Text>
            )}
          </ScrollView>
        )}

        <View className="flex-row justify-end pt-1">
          <Button variant="outline" onPress={onClose}>
            <Text>Close</Text>
          </Button>
        </View>
      </View>
    </View>
  )
}
