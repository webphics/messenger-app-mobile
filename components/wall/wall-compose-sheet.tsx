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

import { Camera, FileText, Image as ImageIcon, Link as LinkIcon, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import {
  capturePhoto,
  formatBytes,
  pickDocument,
  pickFromLibrary,
  type PickedAttachment,
} from '@/lib/attachments'
import { rejectUploadReason } from '@/lib/attachment-upload'
import type { ApiResult } from '@/lib/api-result'
import { cn } from '@/lib/cn'
import { colors, screenBottomPad } from '@/lib/tokens'
import { wallActionRefusal, WALL_POST_BODY_MAX } from '@/lib/wall-actions'
import {
  hasWallComposeError,
  wallComposeDefaultOrganization,
  wallComposeErrors,
  wallComposeNeedsOrganizationChoice,
  wallKindAllowsDeadline,
  wallKindNeedsTitle,
  WALL_DEADLINE_CHOICES,
  WALL_POST_ATTACHMENT_MAX,
  WALL_POST_LINK_LABEL_MAX,
  WALL_POST_TITLE_MAX,
} from '@/lib/wall-compose'
import { wallKindColor, wallKindLabel } from '@/lib/wall-kind'
import { uploadWallFile, type WallPostCreateInput } from '@/lib/wall-api'
import { wallPostKinds, type Organization, type WallPost, type WallPostAttachment, type WallPostKind } from '@/lib/types'

/**
 * A Contributor's own new Post (#76).
 *
 * Deliberately not the thread composer: a Post has an audience to choose, a
 * link button, and a required image the thread composer knows nothing about,
 * and folding those in there would make an ordinary message send carry three
 * fields it never uses. Attachments go through the same picker functions the
 * thread composer uses (`lib/attachments`) and the same streamed upload
 * shape (`uploadWallFile`, mirroring `uploadAttachment`) — the "existing
 * upload path" the acceptance criteria ask for — but the sheet and its state
 * are entirely its own.
 *
 * Staged files are uploaded one at a time on submit, not as they are picked:
 * picking costs nothing, and the submit button's disabled state has a single
 * honest meaning — the request has actually started.
 */

type StagedAttachment = { id: string; local: PickedAttachment }

type WallComposeSheetProps = {
  visible: boolean
  onClose: () => void
  organizations: Organization[]
  onCreate: (input: WallPostCreateInput) => Promise<ApiResult<WallPost>>
}

export function WallComposeSheet({ visible, onClose, organizations, onCreate }: WallComposeSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Its own window on Android, so its own inset provider — see `WallPostEditSheet`. */}
      <SafeAreaProvider>
        {/* Keyed on `visible`, so a Cancel that left a half-typed draft does not greet the next open. */}
        <ComposeSheet
          key={String(visible)}
          organizations={organizations}
          onClose={onClose}
          onCreate={onCreate}
        />
      </SafeAreaProvider>
    </Modal>
  )
}

function AttachmentPreview({ staged, onRemove }: { staged: StagedAttachment; onRemove: () => void }) {
  const { local } = staged
  const Icon = local.kind === 'document' ? FileText : ImageIcon

  return (
    <View className="flex-row items-center gap-2.5 rounded-2xl border border-line/70 bg-bg p-2.5 pr-9">
      <View className="size-10 items-center justify-center rounded-xl bg-primary-soft">
        <Icon color={colors.primary} size={18} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="meta" className="font-semibold text-ink" numberOfLines={1}>
          {local.name}
        </Text>
        <Text variant="label" className="mt-0.5 font-normal text-muted">
          {local.kind === 'image' ? 'Image' : local.kind === 'video' ? 'Video' : 'Document'}
          {formatBytes(local.size) ? ` · ${formatBytes(local.size)}` : ''}
        </Text>
      </View>
      <TactilePressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${local.name}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={onRemove}
        className="absolute right-2 top-2 size-5 items-center justify-center rounded-full bg-line/80"
      >
        <X color={colors.inkSoft} size={12} />
      </TactilePressable>
    </View>
  )
}

function ComposeSheet({
  organizations,
  onClose,
  onCreate,
}: {
  organizations: Organization[]
  onClose: () => void
  onCreate: (input: WallPostCreateInput) => Promise<ApiResult<WallPost>>
}) {
  const insets = useSafeAreaInsets()
  const needsChoice = wallComposeNeedsOrganizationChoice(organizations.length)

  const [organizationId, setOrganizationId] = useState<string | null>(
    wallComposeDefaultOrganization(organizations),
  )
  /*
   * `pickingKind` above is an attachment picker's kind; this is the Post's, and
   * the two are deliberately named apart — the older one was here first and
   * renaming it would touch every picker call for a field it has nothing to do
   * with.
   */
  const [postKind, setPostKind] = useState<WallPostKind>('community')
  const [title, setTitle] = useState('')
  /**
   * The deadline and the chip that set it, held together.
   *
   * Which chip is lit used to be derived — the stored date compared against
   * `Date.now()` plus each choice's offset, within a minute — which read the
   * clock during render and so answered differently on renders the person did
   * nothing to cause. A minute after the tap the gap exceeded the tolerance and
   * the chip quietly went dark while the deadline it set was still there.
   * Recording the label at the tap is the same answer at any later moment, and
   * one piece of state means the two cannot disagree.
   */
  const [deadline, setDeadline] = useState<{ at: Date; label: string } | null>(null)
  const [body, setBody] = useState('')
  const [staged, setStaged] = useState<StagedAttachment[]>([])
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pickingKind, setPickingKind] = useState<'photo' | 'camera' | 'document' | null>(null)

  const [organizationError, setOrganizationError] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [endsAtError, setEndsAtError] = useState<string | null>(null)

  /*
   * A kind that cannot carry a deadline drops the one already chosen, rather
   * than holding it back to refuse the submit: the field goes away with the
   * kind, and a value behind a field nobody can see is a refusal about
   * something invisible.
   */
  function chooseKind(next: WallPostKind) {
    setPostKind(next)
    setTitleError(null)
    setEndsAtError(null)
    if (!wallKindAllowsDeadline(next)) setDeadline(null)
  }

  function removeStaged(id: string) {
    setStaged(current => current.filter(item => item.id !== id));
  }

  async function attach(kind: 'photo' | 'camera' | 'document') {
    if (pickingKind || staged.length >= WALL_POST_ATTACHMENT_MAX) return
    setPickingKind(kind)
    try {
      const outcome =
        kind === 'photo' ? await pickFromLibrary() : kind === 'camera' ? await capturePhoto() : await pickDocument()
      if (outcome.status !== 'picked') return

      const rejection = rejectUploadReason(outcome.attachment)
      if (rejection) {
        setAttachmentError(rejection)
        return
      }

      setStaged(current => [
        ...current,
        { id: `${outcome.attachment.uri}-${Date.now()}`, local: outcome.attachment },
      ])
      setAttachmentError(null)
    } finally {
      setPickingKind(null)
    }
  }

  async function submit() {
    const errors = wallComposeErrors({
      hasOrganization: organizationId !== null,
      kind: postKind,
      title,
      endsAt: deadline ? deadline.at.getTime() : null,
      now: Date.now(),
      attachmentKinds: staged.map(item => item.local.kind),
      linkLabel,
      linkUrl,
    })
    setOrganizationError(errors.organization)
    setAttachmentError(errors.attachment)
    setLinkError(errors.link)
    setTitleError(errors.title)
    setEndsAtError(errors.endsAt)
    if (hasWallComposeError(errors) || !organizationId) return

    setSubmitting(true)

    const attachments: WallPostAttachment[] = []
    for (const item of staged) {
      const uploaded = await uploadWallFile(organizationId, item.local)
      if (!uploaded.ok) {
        setSubmitting(false)
        setAttachmentError(wallActionRefusal(uploaded.failure) ?? 'That file could not be sent.')
        return
      }
      attachments.push(uploaded.value)
    }

    const trimmedBody = body.trim()
    const trimmedLabel = linkLabel.trim()
    const trimmedUrl = linkUrl.trim()

    const result = await onCreate({
      organizationId,
      kind: postKind,
      title: title.trim() || undefined,
      endsAt: deadline ? deadline.at.toISOString() : undefined,
      body: trimmedBody || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
      link: trimmedLabel && trimmedUrl ? { label: trimmedLabel, url: trimmedUrl } : undefined,
    })

    setSubmitting(false)
    if (result.ok) {
      onClose()
      return
    }
    setAttachmentError(wallActionRefusal(result.failure) ?? 'That could not be posted.')
  }

  const canAttachMore = staged.length < WALL_POST_ATTACHMENT_MAX && pickingKind === null

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
      <View className="flex-1 justify-end bg-black/40">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          className="max-h-[86%] gap-3 rounded-t-3xl border-t border-line/80 bg-surface px-4 pt-3"
          style={{ paddingBottom: screenBottomPad(insets.bottom, 16) }}
        >
          <View className="h-1 w-10 self-center rounded-full bg-line" />
          <Text variant="title" className="text-ink">
            New post
          </Text>
          <Text variant="meta" className="-mt-2 text-muted">
            Everyone in the organization you choose can see this on their Wall.
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" className="max-h-full">
            <View className="gap-4 pb-2">
              {needsChoice ? (
                <View className="gap-1.5">
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Organization
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {organizations.map(organization => {
                      const selected = organization.id === organizationId
                      return (
                        <TactilePressable
                          key={organization.id}
                          accessibilityRole="radio"
                          accessibilityLabel={organization.name}
                          accessibilityState={{ checked: selected }}
                          disabled={submitting}
                          onPress={() => {
                            setOrganizationId(organization.id)
                            setOrganizationError(null)
                          }}
                          className={cn(
                            'min-h-11 justify-center rounded-full border px-3.5',
                            selected
                              ? 'border-transparent bg-primary shadow-sm shadow-primary/25'
                              : 'border-line/80 bg-line/35',
                          )}
                        >
                          <Text variant="label" className={selected ? 'text-primary-foreground' : 'text-ink-soft'}>
                            {organization.name}
                          </Text>
                        </TactilePressable>
                      )
                    })}
                  </View>
                  {organizationError ? (
                    <Text variant="label" accessibilityLiveRegion="polite" className="text-danger">
                      {organizationError}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/*
                What the Post is, first: it decides whether a title is required
                and whether a deadline may be set at all, so asking for it after
                those two would be asking somebody to fill in fields that might
                then vanish.
              */}
              <View className="gap-1.5">
                <Text variant="label" className="font-semibold text-ink-soft">
                  Kind
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {wallPostKinds.map(option => {
                    const selected = option === postKind
                    return (
                      <TactilePressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityLabel={wallKindLabel(option)}
                        accessibilityState={{ selected }}
                        disabled={submitting}
                        onPress={() => chooseKind(option)}
                        className={cn(
                          'min-h-11 flex-row items-center justify-center gap-1.5 rounded-full border px-3.5',
                          selected ? 'border-transparent bg-primary' : 'border-line/80 bg-line/35',
                        )}
                      >
                        <View
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: selected
                              ? colors.primaryForeground
                              : wallKindColor(option),
                          }}
                        />
                        <Text
                          variant="label"
                          className={
                            selected ? 'font-semibold text-primary-foreground' : 'text-ink-soft'
                          }
                        >
                          {wallKindLabel(option)}
                        </Text>
                      </TactilePressable>
                    )
                  })}
                </View>
              </View>

              {/*
                The headline. Offered for every kind and required for all but
                `community` — a remark needs no name, and everything else
                announces something that does.
              */}
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Title{wallKindNeedsTitle(postKind) ? '' : ' (optional)'}
                  </Text>
                  <Text variant="meta" className="tabular-nums text-muted">
                    {title.length}/{WALL_POST_TITLE_MAX}
                  </Text>
                </View>
                <TextInput
                  value={title}
                  onChangeText={value => {
                    setTitle(value)
                    if (titleError) setTitleError(null)
                  }}
                  maxLength={WALL_POST_TITLE_MAX}
                  placeholder="What is this about?"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Post title"
                  editable={!submitting}
                  className="min-h-12 rounded-xl border border-line/70 bg-bg px-3 py-2.5 text-base text-ink"
                />
                {titleError ? (
                  <Text variant="label" accessibilityLiveRegion="polite" className="text-danger">
                    {titleError}
                  </Text>
                ) : null}
              </View>

              {/*
                A deadline, and only where one means something. A Post nothing
                happens to cannot end, so the field is absent rather than
                disabled for the three kinds the API refuses one on.
              */}
              {wallKindAllowsDeadline(postKind) ? (
                <View className="gap-1.5">
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Ends (optional)
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {WALL_DEADLINE_CHOICES.map(choice => {
                      const selected = deadline?.label === choice.label
                      return (
                        <TactilePressable
                          key={choice.label}
                          accessibilityRole="radio"
                          accessibilityLabel={`Ends in ${choice.label}`}
                          accessibilityState={{ selected }}
                          disabled={submitting}
                          onPress={() => {
                            setDeadline({ at: new Date(Date.now() + choice.ms), label: choice.label })
                            setEndsAtError(null)
                          }}
                          className={cn(
                            'min-h-11 justify-center rounded-full border px-3.5',
                            selected
                              ? 'border-transparent bg-primary'
                              : 'border-line/80 bg-line/35',
                          )}
                        >
                          <Text
                            variant="label"
                            className={
                              selected ? 'font-semibold text-primary-foreground' : 'text-ink-soft'
                            }
                          >
                            {choice.label}
                          </Text>
                        </TactilePressable>
                      )
                    })}
                    {deadline ? (
                      <TactilePressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear the end date"
                        disabled={submitting}
                        onPress={() => {
                          setDeadline(null)
                          setEndsAtError(null)
                        }}
                        className="min-h-11 flex-row items-center justify-center gap-1 rounded-full border border-line/80 bg-line/35 px-3.5"
                      >
                        <X color={colors.muted} size={14} />
                        <Text variant="label" className="text-ink-soft">
                          No end date
                        </Text>
                      </TactilePressable>
                    ) : null}
                  </View>
                  {endsAtError ? (
                    <Text variant="label" accessibilityLiveRegion="polite" className="text-danger">
                      {endsAtError}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Post
                  </Text>
                  <Text variant="meta" className="tabular-nums text-muted">
                    {body.length}/{WALL_POST_BODY_MAX}
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
                  editable={!submitting}
                  className="min-h-28 rounded-xl border border-line/70 bg-bg px-3 py-2.5 text-base text-ink"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>

              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Attachments
                  </Text>
                  <Text variant="meta" className="text-muted">
                    At least one image is required
                  </Text>
                </View>

                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canAttachMore}
                    onPress={() => void attach('photo')}
                  >
                    {pickingKind === 'photo' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <ImageIcon color={colors.primary} size={16} />
                    )}
                    <Text>Library</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canAttachMore}
                    onPress={() => void attach('camera')}
                  >
                    {pickingKind === 'camera' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Camera color={colors.primary} size={16} />
                    )}
                    <Text>Camera</Text>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canAttachMore}
                    onPress={() => void attach('document')}
                  >
                    {pickingKind === 'document' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <FileText color={colors.primary} size={16} />
                    )}
                    <Text>File</Text>
                  </Button>
                </View>

                {attachmentError ? (
                  <Text variant="label" accessibilityLiveRegion="polite" className="text-danger">
                    {attachmentError}
                  </Text>
                ) : null}

                {staged.length > 0 ? (
                  <View className="gap-2 pt-1">
                    {staged.map(item => (
                      <AttachmentPreview key={item.id} staged={item} onRemove={() => removeStaged(item.id)} />
                    ))}
                  </View>
                ) : null}
              </View>

              <View className="gap-1.5">
                <View className="flex-row items-center gap-1.5">
                  <LinkIcon color={colors.inkSoft} size={14} />
                  <Text variant="label" className="font-semibold text-ink-soft">
                    Link button
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <Input
                    value={linkLabel}
                    onChangeText={value => {
                      setLinkLabel(value)
                      setLinkError(null)
                    }}
                    placeholder="Label"
                    maxLength={WALL_POST_LINK_LABEL_MAX}
                    editable={!submitting}
                    className="flex-1"
                  />
                  <Input
                    value={linkUrl}
                    onChangeText={value => {
                      setLinkUrl(value)
                      setLinkError(null)
                    }}
                    placeholder="https://example.com"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting}
                    className="flex-[1.4]"
                  />
                </View>
                {linkError ? (
                  <Text variant="label" accessibilityLiveRegion="polite" className="text-danger">
                    {linkError}
                  </Text>
                ) : null}
              </View>
            </View>
          </ScrollView>

          <View className="flex-row justify-end gap-2 pt-1">
            <Button variant="outline" disabled={submitting} onPress={onClose}>
              <Text>Cancel</Text>
            </Button>
            <Button disabled={submitting} accessibilityState={{ disabled: submitting, busy: submitting }} onPress={() => void submit()}>
              {submitting ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : null}
              <Text>Post</Text>
            </Button>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
