import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import type { ApiResult } from '@/lib/api-result'
import { colors, screenBottomPad } from '@/lib/tokens'
import { WALL_POST_BODY_MAX, wallActionRefusal } from '@/lib/wall-actions'
import type { WallPostEditInput } from '@/lib/wall-api'
import type { WallPost } from '@/lib/types'

/**
 * The author's own edit, over the one field this build lets them change.
 *
 * A Post's link and its attachments are left exactly as they were: there is
 * no picker wired into an edit yet — that arrives with Compose (#76), whose
 * upload plumbing this would otherwise have to invent early — and a Post's
 * link is small enough free text that fixing it is a delete-and-repost away
 * for now. `updateWallPost` never sends either field, so the API leaves both
 * untouched (`UpdateWallPostSchema`), and the one thing this form promises —
 * every reaction already on the Post survives — is true regardless: the API
 * never touches reactions on an edit at all.
 */

type WallPostEditSheetProps = {
  visible: boolean
  post: WallPost
  onClose: () => void
  onSave: (input: WallPostEditInput) => Promise<ApiResult<WallPost>>
}

export function WallPostEditSheet({ visible, post, onClose, onSave }: WallPostEditSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own Android window — see `WallPostActionsSheet` for why
          this needs its own SafeAreaProvider rather than the root's insets. */}
      <SafeAreaProvider>
        {/*
          `Modal` keeps its children mounted while hidden, so a Cancel that
          left a half-typed draft in the body field would otherwise still be
          there the next time this Post's edit is opened. Keying on `visible`
          remounts `EditSheet` fresh on every open instead — reopening always
          starts from what the Post actually holds now, not from what
          somebody typed and abandoned, and needs no effect to say so.
        */}
        <EditSheet key={String(visible)} post={post} onClose={onClose} onSave={onSave} />
      </SafeAreaProvider>
    </Modal>
  )
}

function EditSheet({
  post,
  onClose,
  onSave,
}: {
  post: WallPost
  onClose: () => void
  onSave: (input: WallPostEditInput) => Promise<ApiResult<WallPost>>
}) {
  const insets = useSafeAreaInsets()
  const [body, setBody] = useState(post.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = body.trim()
  // A body cannot be sent empty (`WALL_POST_BODY_MAX` schema, `min: 1`) — there
  // is no way for this form to ask the API to clear one, only to change it —
  // so a Post that already has a body cannot be edited down to nothing here.
  const canSave = trimmed.length > 0 && trimmed !== (post.body ?? '') && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    const result = await onSave({ body: trimmed })
    setSaving(false)
    if (result.ok) {
      onClose()
      return
    }
    setError(wallActionRefusal(result.failure))
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
              Edit post
            </Text>
            <Text variant="meta" className="tabular-nums text-muted">
              {trimmed.length}/{WALL_POST_BODY_MAX}
            </Text>
          </View>

          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={WALL_POST_BODY_MAX}
            placeholder="Share something with this organization."
            placeholderTextColor={colors.muted}
            accessibilityLabel="Post text"
            editable={!saving}
            className="min-h-32 rounded-xl border border-line/70 bg-bg px-3 py-2.5 text-base text-ink"
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
            <Button disabled={!canSave} accessibilityState={{ disabled: !canSave, busy: saving }} onPress={save}>
              {saving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text>Save</Text>
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
