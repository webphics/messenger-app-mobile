import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { colors, screenBottomPad } from '@/lib/tokens'

/** The API's bound on a close summary, the same as a note's and a message body's. */
const SUMMARY_MAX = 4000

/**
 * The summary gate on closing a Support DM, mirroring the web client's
 * `CloseConversationDialog`.
 *
 * The API rejects a close without a summary, so writing one is the only way
 * through: there is no "close without a summary" button, because it would
 * always fail. What is written is kept with the thread for staff and never
 * shown to the Customer, which the sheet says before anyone types.
 *
 * Built from `MessageEditSheet`. A refused close leaves the sheet open with the
 * draft under the refusal, because the summary is the part somebody spent time
 * on and the reason may be one they can fix, such as a lost connection.
 */

type CloseConversationSheetProps = {
  visible: boolean
  /** How the reopen reads, which depends on whether the thread returns to its closer. */
  reopenNote: string
  onClose: () => void
  /** Answers the refusal to show, or null when the close landed. */
  onConfirm: (summary: string) => Promise<string | null>
}

export function CloseConversationSheet({
  visible,
  reopenNote,
  onClose,
  onConfirm,
}: CloseConversationSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A Modal is its own Android window, so it needs its own SafeAreaProvider. */}
      <SafeAreaProvider>
        {/* Keyed on `visible` so every open starts blank, as the web dialog does. */}
        <SummarySheet
          key={String(visible)}
          reopenNote={reopenNote}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      </SafeAreaProvider>
    </Modal>
  )
}

function SummarySheet({
  reopenNote,
  onClose,
  onConfirm,
}: Omit<CloseConversationSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets()
  const [summary, setSummary] = useState('')
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = summary.trim()
  const canClose = trimmed.length > 0 && !closing

  async function confirm() {
    if (!canClose) return
    setClosing(true)
    setError(null)

    const refusal = await onConfirm(trimmed)
    setClosing(false)
    if (!refusal) {
      onClose()
      return
    }
    setError(refusal)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-end"
    >
      <View className="flex-1 justify-end bg-black/40">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          className="gap-3 rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
          style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
        >
          <View className="h-1 w-10 self-center rounded-full bg-line" />

          <View className="flex-row items-center justify-between">
            <Text variant="title" className="text-ink">
              Close this conversation?
            </Text>
            <Text variant="meta" className="tabular-nums text-muted">
              {trimmed.length}/{SUMMARY_MAX}
            </Text>
          </View>

          <Text variant="meta" className="text-muted">
            Record what support you gave. Other staff can read it; the customer never sees it.{' '}
            {reopenNote}
          </Text>

          <TextInput
            value={summary}
            onChangeText={setSummary}
            multiline
            maxLength={SUMMARY_MAX}
            placeholder="What did the customer need, and what did you do about it?"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Summary of support given"
            editable={!closing}
            autoFocus
            className="min-h-28 rounded-xl border border-line/70 bg-bg px-3 py-2.5 font-normal text-base text-ink"
            style={{ textAlignVertical: 'top' }}
          />

          {error ? (
            <Text variant="meta" accessibilityLiveRegion="polite" className="text-danger">
              {error}
            </Text>
          ) : null}

          <View className="flex-row justify-end gap-2 pt-1">
            <Button variant="outline" disabled={closing} onPress={onClose}>
              <Text>Cancel</Text>
            </Button>
            <Button
              disabled={!canClose}
              accessibilityState={{ disabled: !canClose, busy: closing }}
              onPress={confirm}
            >
              {closing ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text>Close conversation</Text>
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
