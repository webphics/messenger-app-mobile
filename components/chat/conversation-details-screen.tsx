import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
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
import type { ConversationDetails } from '@/lib/use-conversation-details'
import { isStaffConversation } from '@/lib/types'
import type { Conversation, ConversationNote, UserRole } from '@/lib/types'

type ConversationDetailsScreenProps = {
  conversation: Conversation
  viewerRole: UserRole
  organizationNames?: ReadonlyMap<string, string>
  details: ConversationDetails
  /** How many attachments and links the loaded history holds, for the Media row. */
  sharedCount: number
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
  sharedCount,
}: ConversationDetailsScreenProps) {
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardInset()
  const title = conversationTitle(conversation, organizationNames)
  const fields = conversationDetailFields(conversation)
  const labels = appliedLabels(conversation)
  const offerable = offerableLabels(details.all, conversation)
  const showLabels = canLabel(conversation, viewerRole)
  const showNotes = canReadNotes(conversation, viewerRole)
  const members = isStaffConversation(conversation) ? conversation.members : []
  const isGroup =
    conversation.type === 'group' || conversation.type === 'community_announcement'

  return (
    <View className="flex-1 bg-bg">
      <InScreenHeader>
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
            offerable={offerable}
            busy={details.labelBusy}
            error={details.labelError}
            onAttach={details.attach}
            onDetach={details.detach}
          />
        ) : null}

        {showNotes ? (
          <NotesSection
            notes={details.notes}
            onReload={details.reloadNotes}
            onAdd={details.addNote}
            adding={details.addingNote}
            error={details.noteError}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Shared in chat, ${sharedCount} items`}
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
            <Text variant="label" className="mt-0.5 font-normal text-muted">
              {sharedCount === 0
                ? 'Photos, videos, voice notes, documents and links'
                : `${sharedCount} shared so far`}
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
 */
function LabelsSection({
  applied,
  offerable,
  busy,
  error,
  onAttach,
  onDetach,
}: {
  applied: { id: string; name: string; color: Parameters<typeof labelChipColors>[0] }[]
  offerable: { id: string; name: string; color: Parameters<typeof labelChipColors>[0] }[]
  busy: string | null
  error: string | null
  onAttach: (id: string) => void
  onDetach: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)

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
            hitSlop={10}
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
        {applied.map((label) => {
          const chip = labelChipColors(label.color)
          const working = busy === label.id
          return (
            <Pressable
              key={label.id}
              accessibilityRole="button"
              accessibilityLabel={`Remove label ${label.name}`}
              accessibilityState={{ busy: working, disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => onDetach(label.id)}
              style={{ backgroundColor: chip.wash }}
              className={cn(
                'min-h-8 flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70',
                working && 'opacity-60',
              )}
            >
              <Text variant="label" style={{ color: chip.ink }} className="font-semibold">
                {label.name}
              </Text>
              <X color={chip.ink} size={12} />
            </Pressable>
          )
        })}
        {applied.length === 0 ? (
          <Text variant="meta" className="text-muted">
            No labels attached
          </Text>
        ) : null}
      </View>

      {adding && offerable.length > 0 ? (
        <View className="gap-1.5 border-t border-line/70 pt-3">
          <Text variant="label" className="uppercase tracking-wide text-muted">
            Add a label
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {offerable.map((label) => {
              const chip = labelChipColors(label.color)
              const working = busy === label.id
              return (
                <Pressable
                  key={label.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add label ${label.name}`}
                  accessibilityState={{ busy: working, disabled: busy !== null }}
                  disabled={busy !== null}
                  onPress={() => onAttach(label.id)}
                  style={{ backgroundColor: chip.wash }}
                  className={cn(
                    'min-h-8 flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70',
                    working && 'opacity-60',
                  )}
                >
                  <Plus color={chip.ink} size={12} />
                  <Text
                    variant="label"
                    style={{ color: chip.ink }}
                    className="font-semibold"
                  >
                    {label.name}
                  </Text>
                </Pressable>
              )
            })}
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
}: {
  notes: ConversationDetails['notes']
  onReload: () => void
  onAdd: (text: string) => void
  adding: boolean
  error: string | null
}) {
  const [draft, setDraft] = useState('')

  function submit() {
    const trimmed = draft.trim()
    if (trimmed === '' || adding) return
    onAdd(trimmed)
    setDraft('')
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
