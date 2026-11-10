import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'

import { CheckCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import { refusalSentence } from '@/lib/api-result'
import { cn } from '@/lib/cn'
import { hapticSuccess } from '@/lib/haptics'
import { useSheetKeyboardInset } from '@/lib/keyboard-inset'
import { createReport, type ReportInput } from '@/lib/report-api'
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_COPY,
  REPORT_REASONS,
  reportDetailsVerdict,
  reportTargetNoun,
  type ReportReason,
} from '@/lib/report-reasons'
import { colors, screenBottomPad } from '@/lib/tokens'

/**
 * Reporting a Post, a Message or a group: a reason, an optional note, and a
 * receipt that says when somebody will look at it.
 *
 * One sheet for all three, because what a person is asked is the same whatever
 * they are reporting — only the noun in the title changes — and the API takes
 * all three on one route. It files the report itself rather than handing the
 * tap up: nothing about a report changes what the screen underneath shows.
 */

export type ReportTarget = Omit<ReportInput, 'reason' | 'details'>

type ReportSheetProps = {
  visible: boolean
  target: ReportTarget | null
  onClose: () => void
}

export function ReportSheet({ visible, target, onClose }: ReportSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own Android window — see `WallPostActionsSheet`. */}
      <SafeAreaProvider>
        {/* Keyed on `visible` so every open starts from no reason and no note. */}
        {target ? <Sheet key={String(visible)} target={target} onClose={onClose} /> : null}
      </SafeAreaProvider>
    </Modal>
  )
}

function Sheet({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const { ref: backdropRef, keyboardInset } = useSheetKeyboardInset()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const noun = reportTargetNoun(target.targetKind)

  async function submit() {
    const verdict = reportDetailsVerdict(reason, details)
    if (!verdict.ok || !reason) {
      setError(verdict.ok ? 'Choose a reason.' : verdict.message)
      return
    }
    setSending(true)
    setError(null)
    const result = await createReport({ ...target, reason, details: verdict.details })
    setSending(false)
    if (result.ok) {
      hapticSuccess()
      setSent(true)
      return
    }
    setError(refusalSentence(result.failure, 'The report could not be sent. Try again.'))
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
      <View ref={backdropRef} className="flex-1 justify-end bg-black/40" style={{ paddingBottom: keyboardInset }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          className="max-h-[80%] gap-3 rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
          style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
        >
          <View className="h-1 w-10 self-center rounded-full bg-line" />

          {sent ? (
            <View className="items-center gap-3 py-4" accessibilityLiveRegion="polite">
              <View className="size-12 items-center justify-center rounded-full bg-primary-soft">
                <CheckCheck color={colors.primary} size={22} />
              </View>
              <Text variant="title" className="text-center text-ink">
                Thanks — we review reports within 24 hours
              </Text>
              <Text variant="body" className="text-center text-muted">
                If it breaks our terms we remove it and act against the account that posted it. The person
                you reported is not told who reported them.
              </Text>
              <Button className="mt-2 self-stretch" onPress={onClose}>
                <Text>Done</Text>
              </Button>
            </View>
          ) : (
            <>
              <View className="gap-1">
                <Text variant="title" className="text-ink">
                  Report this {noun}
                </Text>
                <Text variant="meta" className="text-muted">
                  Why are you reporting it?
                </Text>
              </View>

              <ScrollView
                className="shrink"
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="gap-2 pb-1"
              >
                <View accessibilityRole="radiogroup" className="gap-2">
                  {REPORT_REASONS.map(option => {
                    const picked = option === reason
                    const copy = REPORT_REASON_COPY[option]
                    return (
                      <TactilePressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityLabel={`${copy.label}. ${copy.hint}`}
                        accessibilityState={{ checked: picked }}
                        disabled={sending}
                        onPress={() => {
                          setReason(option)
                          setError(null)
                        }}
                        className={cn(
                          'min-h-14 flex-row items-center gap-3 rounded-2xl border px-3.5 py-2.5',
                          picked ? 'border-primary/60 bg-primary-soft' : 'border-line/70 bg-surface',
                        )}
                      >
                        <View
                          className={cn(
                            'size-5 items-center justify-center rounded-full border-2',
                            picked ? 'border-primary' : 'border-line',
                          )}
                        >
                          {picked ? <View className="size-2.5 rounded-full bg-primary" /> : null}
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text variant="title" className="text-ink">
                            {copy.label}
                          </Text>
                          <Text variant="meta" className="text-muted">
                            {copy.hint}
                          </Text>
                        </View>
                      </TactilePressable>
                    )
                  })}
                </View>
              </ScrollView>

              {/* Outside the list, so only the reasons scroll and the note stays in view. */}
              <TextInput
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={REPORT_DETAILS_MAX}
                placeholder={reason === 'other' ? 'What is wrong with it…' : 'Anything else we should know (optional)…'}
                placeholderTextColor={colors.muted}
                accessibilityLabel="Note for the reviewer"
                editable={!sending}
                className="max-h-32 min-h-20 rounded-xl border border-line/70 bg-bg px-3 py-2.5 font-normal text-base text-ink"
                style={{ textAlignVertical: 'top' }}
              />

              {error ? (
                <Text variant="meta" accessibilityLiveRegion="polite" className="text-danger">
                  {error}
                </Text>
              ) : null}

              <View className="flex-row justify-end gap-2 pt-1">
                <Button variant="outline" disabled={sending} onPress={onClose}>
                  <Text>Cancel</Text>
                </Button>
                <Button
                  variant="destructive"
                  disabled={sending}
                  accessibilityState={{ disabled: sending, busy: sending }}
                  onPress={() => void submit()}
                >
                  {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
                  <Text>Report</Text>
                </Button>
              </View>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
