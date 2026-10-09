import { router, type Href } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, ScrollView, View } from 'react-native'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'

import { ChevronLeft, MessageSquare, Plus, User, X } from '@/components/icons'
import { SearchFieldWithClear } from '@/components/search-field-with-clear'
import { Input } from '@/components/ui/input'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import {
  createCannedReply,
  listPickerCannedReplies,
  recordCannedReplyUse,
} from '@/lib/canned-reply-api'
import {
  CANNED_REPLY_BODY_MAX,
  CANNED_REPLY_TITLE_MAX,
  cannedReplyDraftProblem,
  quickCreateTitle,
  visibleCannedReplies,
} from '@/lib/canned-reply-library'
import { cn } from '@/lib/cn'
import { failureNotice } from '@/lib/conversation-failure'
import { PLACEHOLDER_HINT } from '@/lib/saved-response-placeholders'
import { getSession } from '@/lib/session'
import { colors, screenBottomPad, screenTopPad } from '@/lib/tokens'
import type { CannedReply } from '@/lib/types'

/**
 * Picking a saved response to put in the composer.
 *
 * Selecting inserts text and does nothing else — no send, no status change, no
 * label. Each of those has a policy in front of it that does not stop applying
 * because a saved response invoked it, and an Agent can still edit the words
 * before they go. The one thing a selection records is a use, which is what
 * orders the list: most used first.
 *
 * Offered: the thread's own organization's responses, never an archived one —
 * a response names one company's policies, and one from another organization is
 * one tap from being sent to the wrong customer — and the viewer's personal
 * ones, which are their own words and go anywhere.
 *
 * A search that matches nothing offers to create it, the way a messenger offers
 * to add a contact it cannot find: a "Create" row, or the keyboard's return
 * key. It becomes a short form here, and saving puts it straight into the
 * composer.
 */

type SavedResponsePickerProps = {
  visible: boolean
  onClose: () => void
  /** The thread's organization; null for one with none, offered personal responses only. */
  organizationId: string | null
  /** Holds `manage_canned_replies`: may save to the organization, and is shown the library. */
  canManage: boolean
  onSelect: (reply: CannedReply) => void
}

type PickerState =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; replies: CannedReply[] }

type Draft = { title: string; body: string; shared: boolean }

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
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const canShare = canManage && organizationId !== null

  // Read on every opening rather than cached: the body mounts with the sheet,
  // and a library somebody changed a minute ago should be the one offered.
  const load = useCallback(() => {
    void listPickerCannedReplies(organizationId).then((result) => {
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
  // The API sends them most used first; narrowing keeps that order.
  const rows = useMemo(
    () => visibleCannedReplies(library, { showArchived: false, search }),
    [library, search],
  )
  const trimmedSearch = search.trim()
  const offersCreate = state.status === 'ready' && trimmedSearch !== '' && rows.length === 0

  /** Inserts it and counts the use. A failed count costs one uncounted use, nothing more. */
  const choose = useCallback(
    (reply: CannedReply) => {
      onSelect(reply)
      void recordCannedReplyUse(reply.id)
    },
    [onSelect],
  )

  const startDraft = useCallback((title: string) => {
    setDraft({ title: quickCreateTitle(title), body: '', shared: false })
    setProblem(null)
  }, [])

  const saveDraft = useCallback(() => {
    if (!draft || saving) return
    const invalid = cannedReplyDraftProblem({
      organizationId: draft.shared ? organizationId : null,
      title: draft.title,
      body: draft.body,
      requiresOrganization: draft.shared,
    })
    if (invalid) {
      setProblem(invalid)
      return
    }
    setSaving(true)
    setProblem(null)
    void createCannedReply({
      organizationId: draft.shared ? organizationId : null,
      title: draft.title.trim(),
      body: draft.body.trim(),
    }).then((result) => {
      setSaving(false)
      if (!result.ok) {
        setProblem(failureNotice(result.failure, 'Could not save the response').hint)
        return
      }
      choose(result.value)
    })
  }, [choose, draft, organizationId, saving])

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
  // The library screen lives under the Admin Hub, which only an Admin enters.
  const canOpenLibrary = getSession().role === 'admin'

  const renderItem = useCallback(
    ({ item }: { item: CannedReply }) => (
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`Insert ${item.title}${item.scope === 'personal' ? ', personal' : ''}`}
        onPress={() => choose(item)}
        className="gap-1 rounded-2xl border border-line/70 bg-surface p-3.5 active:bg-primary-soft/40"
      >
        <View className="flex-row items-center gap-1.5">
          <Text variant="label" className="shrink font-semibold text-ink" numberOfLines={1}>
            {item.title}
          </Text>
          {item.scope === 'personal' ? (
            <View className="flex-row items-center gap-1 rounded-full bg-line/70 px-2 py-0.5">
              <User color={colors.muted} size={11} />
              <Text variant="label" className="text-[11px] font-medium text-muted">
                Personal
              </Text>
            </View>
          ) : null}
        </View>
        {/* Two lines: enough to tell two similar titles apart without a scroll through paragraphs. */}
        <Text variant="meta" className="text-muted" numberOfLines={2}>
          {item.body}
        </Text>
      </TactilePressable>
    ),
    [choose],
  )

  const header = (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-2">
        {draft ? (
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Back to saved responses"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => setDraft(null)}
            className="size-8 items-center justify-center rounded-full bg-line/80"
          >
            <ChevronLeft color={colors.inkSoft} size={18} />
          </TactilePressable>
        ) : (
          <View className="size-8 items-center justify-center rounded-full bg-primary-soft">
            <MessageSquare color={colors.primary} size={18} />
          </View>
        )}
        <Text variant="headline" className="text-ink">
          {draft ? 'New saved response' : 'Saved responses'}
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
  )

  if (draft) {
    return (
      <View
        className="flex-1 bg-bg"
        style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
      >
        <View className="border-b border-line/60 bg-surface px-4 pb-3.5">{header}</View>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: screenBottomPad(insets.bottom, 24),
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="gap-1.5">
            <Text variant="label" className="uppercase tracking-wide text-muted">
              Title
            </Text>
            <Input
              value={draft.title}
              onChangeText={(title) => setDraft({ ...draft, title })}
              maxLength={CANNED_REPLY_TITLE_MAX}
              placeholder="What you search for"
              accessibilityLabel="Title"
              editable={!saving}
              className="h-11 rounded-2xl border-line/80 bg-line/35 px-3.5 font-sans text-base text-ink"
            />
          </View>
          <View className="gap-1.5">
            <Text variant="label" className="uppercase tracking-wide text-muted">
              Message
            </Text>
            <Input
              value={draft.body}
              onChangeText={(body) => setDraft({ ...draft, body })}
              maxLength={CANNED_REPLY_BODY_MAX}
              placeholder="Hi {first_name|there}, …"
              accessibilityLabel="Message"
              multiline
              autoFocus
              textAlignVertical="top"
              editable={!saving}
              className="h-32 rounded-2xl border-line/80 bg-line/35 px-3.5 py-3 font-sans text-base text-ink"
            />
            <Text variant="label" className="font-normal text-muted">
              {PLACEHOLDER_HINT}
            </Text>
          </View>

          {canShare ? (
            <View className="gap-1.5">
              <Text variant="label" className="uppercase tracking-wide text-muted">
                Who can use it
              </Text>
              <View className="flex-row gap-2">
                {[
                  { shared: false, label: 'Just me' },
                  { shared: true, label: 'This organization' },
                ].map((option) => {
                  const selected = draft.shared === option.shared
                  return (
                    <TactilePressable
                      key={option.label}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setDraft({ ...draft, shared: option.shared })}
                      className={cn(
                        'min-h-11 flex-1 items-center justify-center rounded-2xl border px-3',
                        selected ? 'border-primary/40 bg-primary-soft' : 'border-line/80 bg-surface',
                      )}
                    >
                      <Text
                        variant="label"
                        className={selected ? 'font-semibold text-primary' : 'text-ink-soft'}
                      >
                        {option.label}
                      </Text>
                    </TactilePressable>
                  )
                })}
              </View>
            </View>
          ) : (
            <Text variant="meta" className="text-muted">
              Saved as personal: only you will see it.
            </Text>
          )}

          {problem ? (
            <Text accessibilityLiveRegion="polite" variant="label" className="text-danger">
              {problem}
            </Text>
          ) : null}

          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Save and insert"
            accessibilityState={{ busy: saving, disabled: saving }}
            disabled={saving}
            onPress={saveDraft}
            className={cn(
              'min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary',
              saving && 'opacity-60',
            )}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : null}
            <Text variant="label" className="font-semibold text-primary-foreground">
              Save & insert
            </Text>
          </TactilePressable>
        </ScrollView>
      </View>
    )
  }

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Math.max(screenTopPad(insets.top), 16) }}
    >
      <View className="gap-3 border-b border-line/60 bg-surface px-4 pb-3.5">
        {header}
        <SearchFieldWithClear
          value={search}
          onChangeText={setSearch}
          placeholder="Search or create…"
          accessibilityLabel="Search saved responses"
          returnKeyType="go"
          onSubmitEditing={() => {
            if (offersCreate) startDraft(trimmedSearch)
            else if (rows[0]) choose(rows[0])
          }}
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
          // Loading is not none, none is not none matching the search, and a
          // failed read is not an empty library — an Agent told "nothing saved"
          // when the read failed goes and retypes an answer that was there.
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
          ) : offersCreate ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel={`Create ${quickCreateTitle(trimmedSearch)}`}
              onPress={() => startDraft(trimmedSearch)}
              className="flex-row items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/50 p-3.5"
            >
              <View className="size-9 items-center justify-center rounded-full bg-primary">
                <Plus color={colors.primaryForeground} size={18} />
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="label" className="font-semibold text-ink" numberOfLines={1}>
                  Create “{quickCreateTitle(trimmedSearch)}”
                </Text>
                <Text variant="meta" className="text-muted">
                  No match. Save it as a new response.
                </Text>
              </View>
            </TactilePressable>
          ) : (
            <View className="items-center px-4 py-12">
              <Text variant="title" className="text-center text-ink">
                No saved responses yet
              </Text>
              <Text variant="meta" className="mt-1 text-center text-muted">
                Type to search, or save the answer you send most.
              </Text>
              <View className="mt-4 flex-row flex-wrap justify-center gap-2">
                <TactilePressable
                  accessibilityRole="button"
                  accessibilityLabel="New saved response"
                  onPress={() => startDraft('')}
                  className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-5"
                >
                  <Plus color={colors.primaryForeground} size={16} />
                  <Text variant="label" className="font-semibold text-primary-foreground">
                    New saved response
                  </Text>
                </TactilePressable>
                {canOpenLibrary ? (
                  <TactilePressable
                    accessibilityRole="button"
                    accessibilityLabel="Manage saved responses"
                    onPress={manage}
                    className="min-h-11 justify-center rounded-full border border-line/80 bg-surface px-5"
                  >
                    <Text variant="label" className="font-semibold text-ink">
                      Manage
                    </Text>
                  </TactilePressable>
                ) : null}
              </View>
            </View>
          )
        }
      />
    </View>
  )
}
