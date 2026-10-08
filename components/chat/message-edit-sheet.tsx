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
import { MESSAGE_BODY_MAX } from '@/lib/message-edit'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { Message } from '@/lib/types'

/**
 * Rewriting one message, over the one field an edit may touch.
 *
 * Built from `WallPostEditSheet`, which is the same shape one feature over, and
 * differs in the two ways a Message differs from a Post. It cannot empty the
 * message — the API's `min: 1` means there is no way for this form to ask for
 * that, and clearing a message is a delete rather than an edit to nothing. And
 * it can be refused for a reason that was not true when it opened: the window
 * closes on the server's clock, so a sheet somebody left open while they thought
 * about the wording stays open with the refusal under the box rather than
 * closing and throwing the draft away.
 *
 * Attachments, the quoted message and the reactions already on it are all left
 * exactly as they were. `editMessage` sends a body and nothing else, so this
 * form cannot ask the API to touch any of them even by accident.
 */

type MessageEditSheetProps = {
  visible: boolean
  message: Message
  onClose: () => void
  /** Answers the refusal to show, or null when it landed. See `ThreadMessages.edit`. */
  onSave: (body: string) => Promise<string | null>
}

export function MessageEditSheet({ visible, message, onClose, onSave }: MessageEditSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A Modal is its own Android window, so it needs its own SafeAreaProvider
          rather than the root's insets — the same reason the Wall's sheets do. */}
      <SafeAreaProvider>
        {/*
          `Modal` keeps its children mounted while hidden, so a Cancel that left
          a half-typed draft behind would still be there the next time this
          message is opened. Keying on `visible` remounts the form on every open
          instead, which also means it starts from what the message holds now
          rather than from what it held when the thread was last fetched — and
          needs no effect to say so.
        */}
        <EditSheet key={String(visible)} message={message} onClose={onClose} onSave={onSave} />
      </SafeAreaProvider>
    </Modal>
  )
}

function EditSheet({
  message,
  onClose,
  onSave,
}: {
  message: Message
  onClose: () => void
  onSave: (body: string) => Promise<string | null>
}) {
  const insets = useSafeAreaInsets()
  const [body, setBody] = useState(message.body)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = body.trim()
  const canSave = trimmed.length > 0 && trimmed !== message.body.trim() && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    const refusal = await onSave(trimmed)
    setSaving(false)
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
              Edit message
            </Text>
            <Text variant="meta" className="tabular-nums text-muted">
              {trimmed.length}/{MESSAGE_BODY_MAX}
            </Text>
          </View>

          <Text variant="meta" className="text-muted">
            Everyone in the conversation sees the new wording, and the message is marked as edited.
            The version you are replacing stays in its edit history.
          </Text>

          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={MESSAGE_BODY_MAX}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Message text"
            editable={!saving}
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
            <Button variant="outline" disabled={saving} onPress={onClose}>
              <Text>Cancel</Text>
            </Button>
            <Button
              disabled={!canSave}
              accessibilityState={{ disabled: !canSave, busy: saving }}
              onPress={save}
            >
              {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text>Save</Text>
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
