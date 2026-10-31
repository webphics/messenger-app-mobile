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
import { router, usePreventRemove } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  AlertCircle,
  ChevronRight,
  FileText,
  Flag,
  Image as ImageIcon,
  Plus,
  Shield,
  Tag,
  Users,
  X,
} from '@/components/icons'
import { InScreenHeader } from '@/components/in-screen-header'
import { DetailsCard } from '@/components/chat/details-card'
import { OnboardingPlacementSection } from '@/components/chat/onboarding-placement-section'
import { ThreadManagementSection } from '@/components/chat/thread-management-section'
import { ReportSheet } from '@/components/moderation/report-sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { LinkedText, linkTint } from '@/components/ui/linked-text'
import { Text } from '@/components/ui/text'
import { chatMediaHref } from '@/lib/chat-route-id'
import {
  detailsView,
  threadActionsView,
  type DetailsView,
  type ThreadActionsView,
} from '@/lib/conversation-access'
import { cn } from '@/lib/cn'
import {
  appliedLabels,
  conversationDetailFields,
  conversationPeerRole,
  labelChipColors,
  offerableLabels,
  peerPresence,
  supportStatusTone,
  type DetailField,
  type StatusTone,
} from '@/lib/conversation-details'
import { conversationPeer, conversationTitle } from '@/lib/conversation-title'
import { avatarInitials, initials, isCompanyPersona } from '@/lib/display'
import { useKeyboardInset } from '@/lib/keyboard-inset'
import { formatDayLabel } from '@/lib/message-day'
import { colors, screenBottomPad } from '@/lib/tokens'
import type {
  ConversationDetails,
  LabelsState,
} from '@/lib/use-conversation-details'
import type { ThreadManagement } from '@/lib/use-thread-management'
import type { OnboardingPlacement } from '@/lib/use-onboarding-placement'
import { isStaffConversation } from '@/lib/types'
import type {
  Conversation,
  ConversationNote,
  ConversationPerson,
  ConversationStaffPerson,
  Label,
} from '@/lib/types'

type ConversationDetailsScreenProps = {
  conversation: Conversation
  organizationNames?: ReadonlyMap<string, string>
  details: ConversationDetails
  /** Whether Support DMs are worked by assignment. See `lib/support-assignment`. */
  supportAssignment: boolean
  /**
   * Closing, reopening and transferring, for whoever the API offers one of them
   * to. Absent for everybody else, which is how the section stays undrawn rather
   * than drawn and disabled. See `threadActionsView`.
   */
  management?: ThreadManagement
  /** Which of Transfer, Close and Reopen the API offers. None when absent. */
  threadActions?: ThreadActionsView
  /** Whether the API offers labels, the notes, and the field to add one. None when absent. */
  offered?: DetailsView
  /**
   * Placing the Customer of an Onboarding thread in organizations, for a viewer who may.
   * Absent everywhere else. See `placeableOnboardingCustomer`.
   */
  placement?: { customer: ConversationPerson; placement: OnboardingPlacement }
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
 * Labels, notes and the thread actions draw from what the API offers this
 * viewer (`detailsView` and `threadActionsView` in `lib/conversation-access`),
 * which is nothing for a Customer. So a Customer sees who they are talking to
 * and what has been shared, and nothing that would be a lie or a 403.
 *
 * Laid out the way WhatsApp's and Messenger's contact screens are: the person
 * first and large, the shared media right under them, then one white card per
 * section, each headed by an icon and a title so the eye can jump between them.
 */
export function ConversationDetailsScreen({
  conversation,
  organizationNames,
  details,
  supportAssignment,
  management,
  threadActions = threadActionsView(undefined),
  offered = detailsView(undefined),
  placement,
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
  const fields = conversationDetailFields(conversation, supportAssignment)
  const field = (key: DetailField['key']) => fields.find((f) => f.key === key)?.value ?? null
  const labels = appliedLabels(conversation)
  /**
   * Applied labels are shown to anyone whose payload carries them (staff
   * shapes only, see `appliedLabels`). Attaching and detaching are the API's
   * `manageLabels`, so without the label Capability the chips are read-only.
   */
  const showLabels = offered.labels || labels.length > 0
  const members = isStaffConversation(conversation) ? conversation.members : []
  // A broadcast thread carries no members, so a group is the only many-person shape left.
  const isGroup = conversation.type === 'group'
  const statusTone: StatusTone =
    isStaffConversation(conversation) && conversation.status !== null
      ? supportStatusTone(conversation.status, supportAssignment)
      : 'neutral'

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
  // not go through `onBack` or hardware Back at all — only removal prevention
  // sees it. Discard empties the draft as well, so the prevention is off by the
  // time `repeat` lets the removal through rather than left on behind it.
  usePreventRemove(draft.trim() !== '', ({ repeat }) => {
    Alert.alert('Discard this note?', 'It has not been added to the conversation yet.', [
      { text: 'Keep writing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setDraft('')
          repeat()
        },
      },
    ])
  })

  return (
    <View className="flex-1 bg-bg">
      {/*
        One line. The name is the first thing in the card underneath, so a
        second copy of it here only made the header taller.
      */}
      <InScreenHeader onBack={confirmLeave}>
        <Text variant="title" numberOfLines={1} className="min-w-0 flex-1 pr-2 text-ink">
          {isGroup ? 'Group details' : 'Conversation details'}
        </Text>
      </InScreenHeader>

      {/*
        Android too: edge-to-edge sets `setDecorFitsSystemWindows(false)`, so the
        window never resizes for the IME and the note field this screen ends in
        would sit behind the keyboard the moment it is tapped, with nothing
        visible of what is being typed. The thread's composer is lifted the same
        way; see lib/keyboard-inset.ts.
      */}
      <View className="flex-1" style={{ paddingBottom: keyboardInset }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: screenBottomPad(insets.bottom, 24),
          }}
          keyboardShouldPersistTaps="handled"
          // The note field is the last thing on the screen, so a keyboard that
          // opens over it has to be able to be scrolled out from under.
          keyboardDismissMode="on-drag"
        >
          <IdentityCard
            conversation={conversation}
            title={title}
            type={field('type')}
            status={field('status')}
            statusTone={statusTone}
            assignee={field('assignee')}
          />

          <SharedInChatRow conversationId={conversation.id} />

          {isGroup && members.length > 0 ? <MembersSection members={members} /> : null}

          {placement ? (
            <OnboardingPlacementSection
              customer={placement.customer}
              placement={placement.placement}
            />
          ) : null}

          {management ? (
            <ThreadManagementSection
              management={management}
              actions={threadActions}
              supportAssignment={supportAssignment}
            />
          ) : null}

          {showLabels ? (
            <LabelsSection
              applied={labels}
              editable={offered.labels}
              labels={details.labels}
              conversation={conversation}
              busy={details.labelBusy}
              error={details.labelError}
              onAttach={details.attach}
              onDetach={details.detach}
              onReloadLabels={details.reloadLabels}
            />
          ) : null}

          {offered.readNotes ? (
            <NotesSection
              notes={details.notes}
              onReload={details.reloadNotes}
              writable={offered.writeNotes}
              onAdd={details.addNote}
              adding={details.addingNote}
              error={details.noteError}
              draft={draft}
              onChangeDraft={setDraft}
            />
          ) : null}

          {/*
            Last, apart from everything that runs the group: anybody who can
            read it may report it, whatever they hold. The API takes the
            group's own id and resolves its Community and creator itself.
          */}
          {isGroup ? <ReportGroupRow conversationId={conversation.id} /> : null}
        </ScrollView>
      </View>
    </View>
  )
}

function ReportGroupRow({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report group"
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-3 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8 active:opacity-70"
      >
        <View className="size-11 items-center justify-center rounded-2xl bg-danger/10">
          <Flag color={colors.danger} size={20} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-danger">
            Report group…
          </Text>
          <Text variant="meta" className="mt-0.5 text-muted">
            Its name, its description or what is posted in it
          </Text>
        </View>
      </Pressable>
      <ReportSheet
        visible={open}
        target={{ targetKind: 'group', targetId: conversationId }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const TONE_PILL: Record<StatusTone, { wash: string; ink: string; dot: string }> = {
  success: { wash: 'bg-success/15', ink: 'text-success', dot: 'bg-success' },
  attention: { wash: 'bg-amber/15', ink: 'text-amber', dot: 'bg-amber' },
  neutral: { wash: 'bg-primary-soft', ink: 'text-primary', dot: 'bg-primary' },
}

/**
 * Who the thread is with, and what state it is in, in one glance.
 *
 * The peer where there is one, and the title where the thread is a group or a
 * Customer's own support line; `conversationTitle` already knows the
 * difference. Type and status sit under the name as pills rather than as rows
 * further down, because they are the two facts somebody opens this screen to
 * check, and a pill is read without reading a label beside it.
 *
 * Nothing here is `font-bold`. On Android that weight skips the loaded Manrope
 * face for the system one, which on a phone with a custom system font draws
 * the name in somebody else's handwriting.
 */
function IdentityCard({
  conversation,
  title,
  type,
  status,
  statusTone,
  assignee,
}: {
  conversation: Conversation
  title: string
  type: string | null
  status: string | null
  statusTone: StatusTone
  /** Only where Support DMs are worked by assignment. */
  assignee: string | null
}) {
  const peer = conversationPeer(conversation)
  const online = peer?.isOnline === true
  const presence = peerPresence(conversation)
  const role = conversationPeerRole(conversation)
  const tone = TONE_PILL[statusTone]

  return (
    <View className="items-center rounded-3xl border border-line/70 bg-surface px-5 pb-6 pt-7 shadow-md shadow-black/8">
      <View className="relative">
        <Avatar alt={title} className="size-24">
          <AvatarFallback className="bg-primary-soft">
            <Text variant="display" className="font-semibold text-primary">
              {initials(title)}
            </Text>
          </AvatarFallback>
        </Avatar>
        {online ? (
          <View className="absolute bottom-1 right-1 size-5 rounded-full border-2 border-surface bg-success" />
        ) : null}
      </View>

      <Text variant="headline" className="mt-4 text-center font-semibold text-ink">
        {title}
      </Text>

      {presence ? (
        <Text
          variant="meta"
          className={cn('mt-1 text-center', online ? 'text-success' : 'text-muted')}
        >
          {presence}
        </Text>
      ) : null}

      {role || type || status ? (
        <View className="mt-3.5 flex-row flex-wrap justify-center gap-1.5">
          {role ? (
            <View className="rounded-full bg-primary-soft px-3 py-1">
              <Text variant="label" className="uppercase tracking-wide text-primary">
                {role}
              </Text>
            </View>
          ) : null}
          {type ? (
            <View className="rounded-full bg-bg px-3 py-1">
              <Text variant="label" className="text-ink-soft">
                {type}
              </Text>
            </View>
          ) : null}
          {status ? (
            <View
              accessible
              accessibilityLabel={`Status: ${status}`}
              className={cn('flex-row items-center gap-1.5 rounded-full px-3 py-1', tone.wash)}
            >
              <View className={cn('size-1.5 rounded-full', tone.dot)} />
              <Text variant="label" className={tone.ink}>
                {status}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {assignee ? (
        <Text variant="meta" className="mt-3 text-center text-muted">
          Assigned to{' '}
          <Text variant="meta" className="font-semibold text-ink">
            {assignee}
          </Text>
        </Text>
      ) : null}

      {isStaffConversation(conversation) && conversation.description ? (
        <Text variant="meta" className="mt-3 text-center text-ink-soft">
          {conversation.description}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * The way into everything shared in the thread.
 *
 * Second on the screen, right under who the thread is with, where WhatsApp and
 * Messenger both put their media row: it is what people most often open this
 * screen to reach.
 */
function SharedInChatRow({ conversationId }: { conversationId: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Shared in chat"
      onPress={() => router.push(chatMediaHref(conversationId))}
      className="min-h-11 flex-row items-center gap-3 rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8 active:opacity-70"
    >
      <View className="size-11 items-center justify-center rounded-2xl bg-primary-soft">
        <ImageIcon color={colors.primary} size={20} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="title" className="text-ink">
          Shared in chat
        </Text>
        {/* No count. What is shared lives a page fetch away, and a number
            here would either cost that fetch on the way into this screen or
            report only the page the thread happened to hold. */}
        <Text variant="meta" className="mt-0.5 text-muted">
          Photos, videos, voice notes, docs and links
        </Text>
      </View>
      <ChevronRight color={colors.muted} size={20} />
    </Pressable>
  )
}

function MembersSection({ members }: { members: ConversationStaffPerson[] }) {
  return (
    <DetailsCard icon={Users} title="Members" trailing={<CountBadge count={members.length} />}>
      <View>
        {members.map((member, index) => (
          <View
            key={member.id}
            className={cn(
              'min-h-12 flex-row items-center gap-3 py-2',
              index > 0 && 'border-t border-line/60',
            )}
          >
            <Avatar alt={member.name} className="size-9">
              <AvatarFallback className="bg-primary-soft">
                <Text variant="label" className="font-semibold text-primary">
                  {avatarInitials(member)}
                </Text>
              </AvatarFallback>
            </Avatar>
            <Text variant="body" numberOfLines={1} className="min-w-0 flex-1 text-ink">
              {member.name}
            </Text>
            {/* The company persona stands for every staff member a Customer
                shares the group with. It is the organization, not somebody
                holding a role, so it wears no role. */}
            {isCompanyPersona(member.id) ? null : (
              <Text variant="label" className="uppercase tracking-wide text-muted">
                {member.role}
              </Text>
            )}
          </View>
        ))}
      </View>
    </DetailsCard>
  )
}

function CountBadge({ count }: { count: number }) {
  return (
    <View className="min-w-7 items-center rounded-full bg-bg px-2 py-0.5">
      <Text variant="label" className="text-ink-soft" style={{ fontVariant: ['tabular-nums'] }}>
        {count}
      </Text>
    </View>
  )
}

/**
 * The labels on this thread, and the ones it could wear.
 *
 * Read-only when `editable` is off: the chips without their ×, and no Add.
 * The catalogue is not fetched then either, since it only feeds the Add tray.
 *
 * A chip is the control that removes it, which is how the web client does it
 * too — a label is one tap to add and one to take off, and a separate delete
 * affordance beside each would be a second control for a reversible action.
 * The × says so, because a chip that reads as a badge is not obviously a button.
 *
 * No confirm on removal, deliberately: the chip reappears under the add tray
 * the moment it comes off, so undoing is the same one tap that did it. A dialog
 * in front of that would cost more than the mistake it prevents.
 */
function LabelsSection({
  applied,
  editable,
  labels,
  conversation,
  busy,
  error,
  onAttach,
  onDetach,
  onReloadLabels,
}: {
  applied: Label[]
  /** The API's `manageLabels`: attach and detach are offered only when it is on. */
  editable: boolean
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
    editable && labels.status === 'ready' ? offerableLabels(labels.labels, conversation) : []

  return (
    <DetailsCard
      icon={Tag}
      title="Labels"
      trailing={
        offerable.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adding ? 'Done adding labels' : 'Add a label'}
            accessibilityState={{ expanded: adding }}
            onPress={() => setAdding((open) => !open)}
            hitSlop={8}
            className={cn(
              'min-h-8 flex-row items-center gap-1 rounded-full px-3 active:opacity-70',
              adding ? 'bg-bg' : 'bg-primary-soft',
            )}
          >
            {adding ? (
              <X color={colors.inkSoft} size={14} />
            ) : (
              <Plus color={colors.primary} size={14} />
            )}
            <Text variant="label" className={adding ? 'text-ink-soft' : 'text-primary'}>
              {adding ? 'Done' : 'Add'}
            </Text>
          </Pressable>
        ) : null
      }
    >
      {applied.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {applied.map((label) =>
            editable ? (
              <LabelChip
                key={label.id}
                label={label}
                action="remove"
                busy={busy === label.id}
                disabled={busy !== null}
                onPress={onDetach}
              />
            ) : (
              <LabelBadge key={label.id} label={label} />
            ),
          )}
        </View>
      ) : (
        <Text variant="meta" className="text-muted">
          No labels yet.
        </Text>
      )}

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
        <View className="gap-2.5 rounded-2xl bg-bg p-3">
          <Text variant="label" className="text-muted">
            Tap a label to add it
          </Text>
          <View className="flex-row flex-wrap gap-2">
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
    </DetailsCard>
  )
}

/** One label, as a chip with no control on it, for a viewer who may not edit labels. */
function LabelBadge({ label }: { label: Label }) {
  const chip = labelChipColors(label.color)

  return (
    <View
      accessible
      accessibilityLabel={`Label ${label.name}`}
      style={{ backgroundColor: chip.wash }}
      className="min-h-9 flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5"
    >
      <View className="size-2 rounded-full" style={{ backgroundColor: chip.ink }} />
      <Text variant="meta" style={{ color: chip.ink }} className="font-semibold">
        {label.name}
      </Text>
    </View>
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
      hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
      onPress={() => onPress(label.id)}
      style={{ backgroundColor: chip.wash }}
      className={cn(
        'min-h-9 flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 active:opacity-70',
        busy && 'opacity-60',
      )}
    >
      {removing ? (
        <View className="size-2 rounded-full" style={{ backgroundColor: chip.ink }} />
      ) : (
        <Plus color={chip.ink} size={13} />
      )}
      <Text variant="meta" style={{ color: chip.ink }} className="font-semibold">
        {label.name}
      </Text>
      {removing ? <X color={chip.ink} size={13} /> : null}
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
  writable,
  onAdd,
  adding,
  error,
  draft,
  onChangeDraft,
}: {
  notes: ConversationDetails['notes']
  onReload: () => void
  /** Whether the API lets this viewer add a note. Without it the notes are read-only. */
  writable: boolean
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
    <DetailsCard
      icon={FileText}
      title="Internal notes"
      trailing={
        // Said once, at the top, rather than in the empty state: it is as true
        // of the fifth note as of the first.
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
      }
    >
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
          No notes yet. The Customer never sees what is written here.
        </Text>
      ) : notes.status === 'ready' ? (
        <View className="gap-2.5">
          {notes.notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </View>
      ) : null}

      {writable ? (
        <View className="gap-2.5">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a note for the team…"
            placeholderTextColor={colors.muted}
            multiline
            // ⌘/Ctrl+Enter is a desktop gesture; on a phone the button is the
            // submit, and Enter has to stay a newline in a field that takes
            // paragraphs.
            accessibilityLabel="Internal note, never shown to the Customer"
            // `font-normal` names the Manrope face. Without it the field draws in
            // the system font, which on a phone with a custom system font is
            // whatever that font happens to be.
            className="min-h-24 rounded-2xl border border-line/80 bg-line/35 px-3.5 py-3 font-normal text-base text-ink"
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
      ) : null}
    </DetailsCard>
  )
}

/** One note: who wrote it and when on the first line, what they wrote under it. */
function NoteCard({ note }: { note: ConversationNote }) {
  return (
    <View className="flex-row gap-3 rounded-2xl bg-bg p-3">
      <Avatar alt={note.author.name} className="size-8">
        <AvatarFallback className="bg-surface">
          <Text variant="label" className="font-semibold text-ink-soft">
            {initials(note.author.name)}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-baseline gap-2">
          <Text variant="meta" numberOfLines={1} className="min-w-0 shrink font-semibold text-ink">
            {note.author.name}
          </Text>
          <Text variant="label" className="font-normal text-muted">
            {formatDayLabel(note.createdAt)}
          </Text>
        </View>
        <Text variant="meta" className="text-ink">
          <LinkedText text={note.text} linkClassName={linkTint(false)} />
        </Text>
      </View>
    </View>
  )
}
