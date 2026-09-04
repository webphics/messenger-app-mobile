import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { router, useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AlertCircle, ChevronRight, Image as ImageIcon, Plus, X } from '@/components/icons'
import { InScreenHeader } from '@/components/in-screen-header'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { chatMediaHref } from '@/lib/chat-route-id'
import { cn } from '@/lib/cn'
import {
  appliedLabels,
  canLabel,
  canReadNotes,
  conversationDetailFields,
  conversationPeerRole,
  labelChipColors,
  offerableLabels,
} from '@/lib/conversation-details'
import { conversationPeer, conversationTitle } from '@/lib/conversation-title'
import { initials } from '@/lib/display'
import { useKeyboardInset } from '@/lib/keyboard-inset'
import { formatDayLabel } from '@/lib/message-day'
import { colors, screenBottomPad } from '@/lib/tokens'
import type {
  ConversationDetails,
  LabelsState,
} from '@/lib/use-conversation-details'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, ConversationNote, Label, UserRole } from '@/lib/types'

type ConversationDetailsScreenProps = {
  conversation: Conversation
  viewerRole: UserRole
  organizationNames?: ReadonlyMap<string, string>
  details: ConversationDetails
}

/**
 * What a thread is, beside what was said in it.
 *
 * The mobile counterpart of the web client's Conversation Details pane, and the
 * same rules read off the same payload: who the thread is with, what type and
 * state it is in, the labels staff have put on it, the internal notes they have
 * written about it, and the way into everything shared in it.
 *
 * Every block is conditional, and none of the conditions are invented here.
 * A Customer's payload carries no assignment, no labels and no notes, and the
 * API refuses all three to a Customer who asks — so the screen shows a Customer
 * who they are talking to and what has been shared, and nothing that would be a
 * lie or a 403. See `lib/conversation-details`.
 */
export function ConversationDetailsScreen({
  conversation,
  viewerRole,
  organizationNames,
  details,
}: ConversationDetailsScreenProps) {
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardInset()
  /**
   * The note being written, held here rather than in `NotesSection`.
   *
   * Because leaving is what loses it, and only something above the section can
   * stand between the draft and the way out. See `confirmLeave`.
   */
  const [draft, setDraft] = useState('')
  const title = conversationTitle(conversation, organizationNames)
  const fields = conversationDetailFields(conversation)
  const labels = appliedLabels(conversation)
  const showLabels = canLabel(conversation, viewerRole)
  const showNotes = canReadNotes(conversation, viewerRole)
  const members = isStaffConversation(conversation) ? conversation.members : []
  const isGroup =
    conversation.type === 'group' || conversation.type === 'community_announcement'

  /**
   * Leaving with a note half-written.
   *
   * A note is the one thing on this screen that is not saved as it is made: a
   * label is written the moment it is tapped, and a note sits in a field until
   * somebody presses Add. Walking out of the screen would take it with no sign
   * that anything was lost, so it asks first — and the answer is destructive, so
   * Discard is the one that has to be chosen rather than the one that happens by
   * default.
   */
  const leave = useCallback(() => router.back(), [])
  const confirmLeave = useCallback(() => {
    if (draft.trim() === '') {
      leave()
      return true
    }
    Alert.alert(
      'Discard this note?',
      'It has not been added to the conversation yet.',
      [
        { text: 'Keep writing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: leave },
      ],
    )
    return true
  }, [draft, leave])

  // Android's own Back is one other way out, and it loses a draft just as
  // thoroughly as the header's.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', confirmLeave)
    return () => sub.remove()
  }, [confirmLeave])

  // iOS's edge-swipe is a third way out this stack screen allows, and it does
  // not go through `onBack` or hardware Back at all — only `beforeRemove` sees it.
  const navigation = useNavigation()
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (draft.trim() === '') return
      e.preventDefault()
      Alert.alert('Discard this note?', 'It has not been added to the conversation yet.', [
        { text: 'Keep writing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ])
    })
  }, [draft, navigation])

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader onBack={confirmLeave}>
        <View className="min-w-0 flex-1 pr-2">
          <Text variant="body" className="font-semibold text-ink" numberOfLines={1}>
            Conversation details
          </Text>
          <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
            {title}
          </Text>
        </View>
      </InScreenHeader>

      {/*
        Android too: edge-to-edge sets `setDecorFitsSystemWindows(false)`, so the
        window never resizes for the IME and the note field this screen ends in
        would sit behind the keyboard the moment it is tapped — nothing visible
        of what is being typed. The thread's composer is lifted the same way; see
        lib/keyboard-inset.ts.
      */}
      <View className="flex-1" style={{ paddingBottom: keyboardInset }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            paddingBottom: screenBottomPad(insets.bottom, 24),
          }}
          keyboardShouldPersistTaps="handled"
          // The note field is the last thing on the screen, so a keyboard that
          // opens over it has to be able to be scrolled out from under.
          keyboardDismissMode="on-drag"
        >
        <IdentityCard conversation={conversation} title={title} />

        <Section title="Conversation info">
          {fields.map((field) => (
            <View key={field.label} className="gap-0.5">
              <Text variant="label" className="uppercase tracking-wide text-muted">
                {field.label}
              </Text>
              <Text variant="meta" className="font-semibold text-ink">
                {field.value}
              </Text>
            </View>
          ))}
        </Section>

        {isGroup && members.length > 0 ? (
          <Section title={`Members · ${members.length}`}>
            {members.map((member) => (
              <View
                key={member.id}
                className="min-h-11 flex-row items-center justify-between gap-2"
              >
                <Text
                  variant="meta"
                  numberOfLines={1}
                  className="min-w-0 flex-1 font-semibold text-ink"
                >
                  {member.name}
                </Text>
                <Text variant="label" className="uppercase tracking-wide text-muted">
                  {member.role}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {showLabels ? (
          <LabelsSection
            applied={labels}
            labels={details.labels}
            conversation={conversation}
            busy={details.labelBusy}
            error={details.labelError}
            onAttach={details.attach}
            onDetach={details.detach}
            onReloadLabels={details.reloadLabels}
          />
        ) : null}

        {showNotes ? (
          <NotesSection
            notes={details.notes}
            onReload={details.reloadNotes}
            onAdd={details.addNote}
            adding={details.addingNote}
            error={details.noteError}
            draft={draft}
            onChangeDraft={setDraft}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shared in chat"
          onPress={() => router.push(chatMediaHref(conversation.id))}
          className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-3 active:opacity-70"
        >
          <View className="size-10 items-center justify-center rounded-2xl bg-primary-soft">
            <ImageIcon color={colors.primary} size={20} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="meta" className="font-semibold text-ink">
              Shared in chat
            </Text>
            {/* No count. What is shared lives a page fetch away, and a number
                here would either cost that fetch on the way into this screen or
                report only the page the thread happened to hold. */}
            <Text variant="label" className="mt-0.5 font-normal text-muted">
              Photos, videos, voice notes, documents and links
            </Text>
          </View>
          <ChevronRight color={colors.muted} size={18} />
        </Pressable>
        </ScrollView>
      </View>
    </View>
  )
}

/**
 * Who the thread is with.
 *
 * The peer where there is one, and the title where the thread is a group or a
 * Customer's own support line — `conversationTitle` already knows the
 * difference, and this only draws it larger than the header does.
 */
function IdentityCard({
  conversation,
  title,
}: {
  conversation: Conversation
  title: string
}) {
  const peer = conversationPeer(conversation)
  const online = peer?.isOnline === true
  const role = conversationPeerRole(conversation)

  return (
    <View className="items-center gap-2 rounded-2xl bg-line/25 px-4 py-5">
      <View className="relative">
        <Avatar alt={title} className="size-16">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="headline" className="font-bold text-primary">
              {initials(title)}
            </Text>
          </AvatarFallback>
        </Avatar>
        {online ? (
          <View className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2 border-bg bg-success" />
        ) : null}
      </View>
      <Text variant="title" className="text-center text-ink">
        {title}
      </Text>
      {role ? (
        <View className="rounded-full bg-primary-soft px-2.5 py-0.5">
          <Text variant="label" className="font-bold uppercase tracking-wide text-primary">
            {role}
          </Text>
        </View>
      ) : null}
      {isStaffConversation(conversation) && conversation.description ? (
        <Text variant="meta" className="text-center text-muted">
          {conversation.description}
        </Text>
      ) : null}
    </View>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <View className="gap-3 rounded-2xl bg-line/25 px-3.5 py-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label" className="uppercase tracking-wide text-muted">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  )
}

/**
 * The labels on this thread, and the ones it could wear.
 *
 * A chip is the control that removes it, which is how the web client does it
 * too — a label is one tap to add and one to take off, and a separate delete
 * affordance beside each would be a second control for a reversible action.
 * The × says so, because a chip that reads as a badge is not obviously a button.
 *
 * No confirm on removal, deliberately: the chip reappears under *Add a label*
 * the moment it comes off, so undoing is the same one tap that did it. A dialog
 * in front of that would cost more than the mistake it prevents.
 */
function LabelsSection({
  applied,
  labels,
  conversation,
  busy,
  error,
  onAttach,
  onDetach,
  onReloadLabels,
}: {
  applied: Label[]
  labels: LabelsState
  conversation: Conversation
  busy: string | null
  error: string | null
  onAttach: (id: string) => void
  onDetach: (id: string) => void
  onReloadLabels: () => void
}) {
  const [adding, setAdding] = useState(false)
  const offerable =
    labels.status === 'ready' ? offerableLabels(labels.labels, conversation) : []

  return (
    <Section
      title="Labels"
      action={
        offerable.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Done adding labels' : 'Add a label'}
            accessibilityState={{ expanded: adding }}
            onPress={() => setAdding((open) => !open)}
            hitSlop={12}
            className="flex-row items-center gap-1 active:opacity-60"
          >
            {adding ? (
              <X color={colors.primary} size={14} />
            ) : (
              <Plus color={colors.primary} size={14} />
            )}
            <Text variant="label" className="font-bold text-primary">
              {adding ? 'Done' : 'Add'}
            </Text>
          </Pressable>
        ) : null
      }
    >
      <View className="flex-row flex-wrap gap-1.5">
        {applied.map((label) => (
          <LabelChip
            key={label.id}
            label={label}
            action="remove"
            busy={busy === label.id}
            disabled={busy !== null}
            onPress={onDetach}
          />
        ))}
        {applied.length === 0 ? (
          <Text variant="meta" className="text-muted">
            No labels attached
          </Text>
        ) : null}
      </View>

      {/*
        A list that would not load is not an organization with no labels in it,
        and the difference is the whole reason to say anything: one of the two is
        worth asking again for, and an Add control that simply never appears
        cannot be told apart from the other.
      */}
      {labels.status === 'failed' ? (
        <View className="items-start gap-2" accessibilityLiveRegion="polite">
          <View className="flex-row items-center gap-1.5">
            <AlertCircle color={colors.danger} size={14} />
            <Text variant="meta" className="text-danger">
              The labels for this organization could not be loaded.
            </Text>
          </View>
          <Button variant="outline" size="sm" onPress={onReloadLabels}>
            <Text>Try again</Text>
          </Button>
        </View>
      ) : null}

      {adding && offerable.length > 0 ? (
        <View className="gap-1.5 border-t border-line/70 pt-3">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Add a label
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {offerable.map((label) => (
              <LabelChip
                key={label.id}
                label={label}
                action="add"
                busy={busy === label.id}
                disabled={busy !== null}
                onPress={onAttach}
              />
            ))}
          </View>
        </View>
      ) : null}

      {error ? (
        <Text variant="meta" accessibilityLiveRegion="polite" className="text-danger">
          {error}
        </Text>
      ) : null}
    </Section>
  )
}

/**
 * One label, as a chip that does what its icon says.
 *
 * A stadium at chip weight rather than at 44 dp: the visual is the web client's
 * chip, and a row of them at touch height would read as a row of buttons.
 * `hitSlop` is what makes the target the size a thumb needs — AGENTS.md, "if
 * visual <24px, expand hit area". Horizontal slop is smaller than vertical
 * because chips sit shoulder to shoulder and a wide one would swallow its
 * neighbour's edge.
 */
function LabelChip({
  label,
  action,
  busy,
  disabled,
  onPress,
}: {
  label: Label
  action: 'add' | 'remove'
  busy: boolean
  disabled: boolean
  onPress: (id: string) => void
}) {
  const chip = labelChipColors(label.color)
  const removing = action === 'remove'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${removing ? 'Remove' : 'Add'} label ${label.name}`}
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }}
      onPress={() => onPress(label.id)}
      style={{ backgroundColor: chip.wash }}
      className={cn(
        'min-h-8 flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70',
        busy && 'opacity-60',
      )}
    >
      {removing ? null : <Plus color={chip.ink} size={12} />}
      <Text variant="label" style={{ color: chip.ink }} className="font-semibold">
        {label.name}
      </Text>
      {removing ? <X color={chip.ink} size={12} /> : null}
    </Pressable>
  )
}


/**
 * The notes staff have written about this thread.
 *
 * Three answers, never conflated — the web client's own note, and it holds here
 * for the same reason: "No notes yet" is a claim about the conversation, and
 * making it while the fetch is in flight or has failed tells an Agent there is
 * nothing to read on a thread that may have several notes on it.
 */
function NotesSection({
  notes,
  onReload,
  onAdd,
  adding,
  error,
  draft,
  onChangeDraft,
}: {
  notes: ConversationDetails['notes']
  onReload: () => void
  onAdd: (text: string) => void
  adding: boolean
  error: string | null
  /**
   * Held by the screen rather than here, so that leaving with something typed
   * can be caught before it is lost. See `confirmLeave`.
   */
  draft: string
  onChangeDraft: (text: string) => void
}) {
  const setDraft = onChangeDraft

  // A note is cleared only once `adding` resolves without an error — clearing
  // it at submit time would lose what was typed the moment the request fails,
  // the same mistake `thread-screen.tsx` avoids for a refused send.
  const wasAdding = useRef(adding)
  useEffect(() => {
    if (wasAdding.current && !adding && !error) setDraft('')
    wasAdding.current = adding
  }, [adding, error, setDraft])

  function submit() {
    const trimmed = draft.trim()
    if (trimmed === '' || adding) return
    onAdd(trimmed)
  }

  return (
    <Section title="Internal staff notes">
      {notes.status === 'loading' ? (
        <ActivityIndicator accessibilityLabel="Loading notes…" />
      ) : notes.status === 'failed' ? (
        <View className="items-start gap-2" accessibilityLiveRegion="polite">
          <View className="flex-row items-center gap-1.5">
            <AlertCircle color={colors.danger} size={14} />
            <Text variant="meta" className="text-danger">
              The notes on this conversation could not be loaded.
            </Text>
          </View>
          <Button variant="outline" size="sm" onPress={onReload}>
            <Text>Try again</Text>
          </Button>
        </View>
      ) : notes.status === 'ready' && notes.notes.length === 0 ? (
        <Text variant="meta" className="text-muted">
          No notes yet. A note is staff-only and is never shown to the Customer.
        </Text>
      ) : notes.status === 'ready' ? (
        <View className="gap-2">
          {notes.notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </View>
      ) : null}

      <View className="gap-2 border-t border-line/70 pt-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write an internal note…"
          placeholderTextColor={colors.muted}
          multiline
          // ⌘/Ctrl+Enter is a desktop gesture; on a phone the button is the
          // submit, and Enter has to stay a newline in a field that takes
          // paragraphs.
          accessibilityLabel="Internal note, never shown to the Customer"
          className="min-h-20 rounded-xl border border-line/70 bg-surface px-3 py-2.5 text-base text-ink"
          style={{ textAlignVertical: 'top' }}
        />
        {error ? (
          <Text variant="meta" accessibilityLiveRegion="polite" className="text-danger">
            {error}
          </Text>
        ) : null}
        <Button
          // Kept enabled until the request starts, then disabled with a spinner
          // beside the label it already had.
          disabled={draft.trim() === '' || adding}
          accessibilityState={{ disabled: draft.trim() === '' || adding, busy: adding }}
          className="self-end"
          size="sm"
          onPress={submit}
        >
          {adding ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : null}
          <Text>Add note</Text>
        </Button>
      </View>
    </Section>
  )
}

function NoteCard({ note }: { note: ConversationNote }) {
  return (
    <View className="gap-1 rounded-xl border border-line/70 bg-surface px-3 py-2.5">
      <Text variant="meta" className="text-ink">
        {note.text}
      </Text>
      <Text variant="label" className="font-normal text-muted">
        {note.author.name} · {formatDayLabel(note.createdAt)}
      </Text>
    </View>
  )
}
