import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Shield } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useSheetKeyboardInset } from '@/lib/keyboard-inset'
import { colors, screenBottomPad } from '@/lib/tokens'

/** The API's limit on a note's text (`CreateNoteSchema`, `EditNoteSchema`). */
export const NOTE_TEXT_MAX = 4000

type NoteSheetProps = {
  visible: boolean
  /** "Add note" or "Edit note". */
  title: string
  /** The message the note is about, quoted so the writer can see which one. */
  about?: { name: string; body: string } | null
  /** Empty for a new note; the note's wording for an edit. */
  initialText?: string
  onClose: () => void
  /** Answers the refusal to show, or null when it landed. */
  onSave: (text: string) => Promise<string | null>
}

/**
 * Writing an internal note, new or rewritten, built on `MessageEditSheet`.
 *
 * A refusal keeps the sheet open with the reason under the field, so the words
 * are not lost. Closing with words that were never saved asks first, the way the
 * note field on Conversation details does, with Discard as the choice that has
 * to be made rather than the default.
 */
export function NoteSheet({ visible, ...rest }: NoteSheetProps) {
  // Mounted only while open, so each open starts from `initialText`, and the
  // Modal lives beside the draft so Android's Back can ask before discarding.
  return visible ? <Sheet {...rest} /> : null
}

function Sheet({
  title,
  about,
  initialText = '',
  onClose,
  onSave,
}: Omit<NoteSheetProps, 'visible'>) {
  const [text, setText] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = text.trim()
  const changed = trimmed !== initialText.trim()
  const canSave = trimmed.length > 0 && changed && !saving

  function close() {
    if (saving) return
    if (!changed || trimmed === '') {
      onClose()
      return
    }
    Alert.alert(
      initialText ? 'Discard your changes?' : 'Discard this note?',
      initialText ? 'The note keeps its current wording.' : 'It has not been added to the conversation yet.',
      [
        { text: 'Keep writing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ],
    )
  }

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
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      {/* A Modal is its own Android window, so it needs its own insets. */}
      <SafeAreaProvider>
        <SheetBody
          title={title}
          about={about}
          text={text}
          onChangeText={setText}
          saving={saving}
          error={error}
          canSave={canSave}
          onClose={close}
          onSave={save}
        />
      </SafeAreaProvider>
    </Modal>
  )
}

function SheetBody({
  title,
  about,
  text,
  onChangeText: setText,
  saving,
  error,
  canSave,
  onClose: close,
  onSave: save,
}: {
  title: string
  about?: { name: string; body: string } | null
  text: string
  onChangeText: (text: string) => void
  saving: boolean
  error: string | null
  canSave: boolean
  onClose: () => void
  onSave: () => void
}) {
  const insets = useSafeAreaInsets()
  const { ref: backdropRef, keyboardInset } = useSheetKeyboardInset()
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 justify-end"
    >
      <View
        ref={backdropRef}
        className="flex-1 justify-end bg-black/40"
        style={{ paddingBottom: keyboardInset }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={close}
          className="absolute inset-0"
        />
        <View
          className="gap-3 rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
          style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
        >
          <View className="h-1 w-10 self-center rounded-full bg-line" />

          <View className="flex-row items-center justify-between gap-2">
            <Text variant="title" className="text-ink">
              {title}
            </Text>
            <View
              accessible
              accessibilityLabel="Staff only, never shown to the Customer"
              className="flex-row items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1"
            >
              <Shield color={colors.amber} size={12} />
              <Text variant="label" className="text-amber">
                Staff only
              </Text>
            </View>
          </View>

          {about ? (
            <View
              accessible
              accessibilityLabel={`About the message from ${about.name}: ${about.body}`}
              className="gap-0.5 rounded-xl border-l-2 border-primary bg-bg px-3 py-2"
            >
              <Text variant="label" numberOfLines={1} className="font-semibold text-ink-soft">
                About a message from {about.name}
              </Text>
              <Text variant="meta" numberOfLines={3} className="text-muted">
                {about.body}
              </Text>
            </View>
          ) : null}

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={NOTE_TEXT_MAX}
            placeholder="Write a note for the team…"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Internal note, never shown to the Customer"
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
            <Button variant="outline" disabled={saving} onPress={close}>
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
