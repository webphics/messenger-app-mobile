import {
  FileText,
  Keyboard as KeyboardIcon,
  Mic,
  Plus,
  Send,
  Smile,
  Square,
  X,
} from '@/components/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  Image,
  Keyboard,
  Pressable,
  View,
  type TextInput,
} from 'react-native'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AttachmentSheet } from '@/components/chat/attachment-sheet'
import { ComplaintStrip } from '@/components/chat/complaint-strip'
import { EMOJI_PANEL_FALLBACK_HEIGHT, EmojiPanel } from '@/components/chat/emoji-panel'
import { SavedResponsePicker } from '@/components/chat/saved-response-picker'
import { VideoThumb } from '@/components/chat/video-thumb'
import { VoiceNotePlayer } from '@/components/chat/voice-note-player'
import { WallPostReferenceStrip } from '@/components/chat/wall-post-reference-card'
import { Waveform } from '@/components/chat/waveform'
import { Input } from '@/components/ui/input'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import {
  classifyPermissionOutcome,
  fileNameFromUri,
  formatBytes,
} from '@/lib/attachments'
import { insertCannedReply } from '@/lib/canned-reply-library'
import {
  downsamplePeaks,
  formatDurationMs,
  meteringToLevel,
  VOICE_NOTE_MAX_MS,
  VOICE_NOTE_PEAK_BARS,
} from '@/lib/message-attachment'
import { motion } from '@/lib/motion'
import { settleDownEnter } from '@/lib/motion-enter'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { AttachmentKind, AttachmentView, MessageWallPost } from '@/lib/types'

export type ComposerSendPayload = {
  body: string
  attachment?: AttachmentView
}

export type ComposerReplyPreview = {
  name: string
  body: string
  thumbUri?: string
  kind?: AttachmentKind
}

type ComposerProps = {
  value: string
  onChangeText: (text: string) => void
  /**
   * Where a written message goes. Answers whether it was taken: the composer
   * clears on `true` and holds everything on `false`, which is what lets a send
   * be refused without the person losing the file they picked and the caption
   * they wrote.
   */
  onSend: (payload: ComposerSendPayload) => boolean
  replyTo?: ComposerReplyPreview | null
  onCancelReply?: () => void
  /**
   * The Post waiting to go out with the next message (a Reply to a Post). It is
   * enough to send on its own, so the send control is offered with nothing typed.
   */
  wallPost?: MessageWallPost | null
  onRemoveWallPost?: () => void
  /** Overlap the thread already lifted the composer by; see lib/keyboard-inset.ts. */
  keyboardInset?: number
  /**
   * Whose saved responses the + sheet offers, or null for none. Staff only — the
   * API refuses a Customer's read — and only in a thread that belongs to an
   * organization, since a response is always one organization's.
   */
  /** `organizationId` null: a thread with no organization, offered personal responses only. */
  savedResponses?: { organizationId: string | null; canManage: boolean } | null
  /**
   * The organizations a Complaint may be about, given only to a Customer in their General
   * Support, where the + sheet offers to mark the next message as one. Absent everywhere else.
   */
  complaintOrganizations?: readonly { id: string; name: string }[] | null
  /** The next message's Complaint, while it is marked as one: what it is about (null: the app). */
  complaint?: { organizationId: string | null } | null
  onComplaintChange?: (complaint: { organizationId: string | null } | null) => void
}

const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
}

/** Recorder metering poll, and the cadence the live waveform samples it at. */
const METERING_POLL_MS = 120

/** In-chrome staging preview (Meta-style). Voice = player; document = file chip. */
function StagedAttachmentChip({
  attachment,
  onClear,
}: {
  attachment: AttachmentView
  onClear: () => void
}) {
  if (attachment.kind === 'audio') {
    return (
      <View className="mb-1.5 self-stretch">
        <VoiceNotePlayer
          attachment={attachment}
          compact
          onClear={onClear}
        />
      </View>
    )
  }

  if (attachment.kind === 'image' || attachment.kind === 'video') {
    return (
      <View className="relative mb-1.5 self-start">
        {attachment.kind === 'video' ? (
          <VideoThumb
            uri={attachment.uri}
            size={64}
            className="rounded-xl"
            accessibilityLabel={attachment.name || 'Video'}
          />
        ) : (
          <Image
            source={{ uri: attachment.uri }}
            className="size-16 rounded-xl bg-line/40"
            resizeMode="cover"
            accessibilityLabel={attachment.name || 'Photo'}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          hitSlop={8}
          onPress={onClear}
          className="absolute -right-1.5 -top-1.5 size-6 items-center justify-center rounded-full border border-line bg-surface shadow-sm"
        >
          <X color={colors.inkSoft} size={14} />
        </Pressable>
      </View>
    )
  }

  return (
    <View className="relative mb-1.5 self-start">
      <View className="h-14 min-w-[7.5rem] max-w-[11rem] flex-row items-center gap-2 rounded-xl border border-line/70 bg-surface px-2.5">
        <View className="size-9 items-center justify-center rounded-lg bg-primary-soft">
          <FileText color={colors.primary} size={18} />
        </View>
        <View className="min-w-0 flex-1 pr-4">
          <Text variant="label" className="font-bold text-ink" numberOfLines={1}>
            {attachment.name}
          </Text>
          <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
            {formatBytes(attachment.size) ?? 'Document'}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        hitSlop={8}
        onPress={onClear}
        className="absolute -right-1.5 -top-1.5 size-6 items-center justify-center rounded-full border border-line bg-surface shadow-sm"
      >
        <X color={colors.inkSoft} size={14} />
      </Pressable>
    </View>
  )
}

export function Composer({
  value,
  onChangeText,
  onSend,
  replyTo,
  onCancelReply,
  wallPost = null,
  onRemoveWallPost,
  keyboardInset = 0,
  savedResponses = null,
  complaintOrganizations = null,
  complaint = null,
  onComplaintChange,
}: ComposerProps) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [attachOpen, setAttachOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** Set by the + sheet's Saved responses row; read once that sheet has closed. */
  const pickerAfterSheetRef = useRef(false)
  /**
   * Where the caret was last, so a saved response lands where the person was
   * typing. Kept in a ref: it changes on every keystroke and nothing draws it.
   */
  const selectionRef = useRef<{ start: number; end: number } | null>(null)
  const inputRef = useRef<TextInput>(null)
  // The latest draft and setter, for `insertEmoji` — see there.
  const valueRef = useRef(value)
  const onChangeTextRef = useRef(onChangeText)
  useEffect(() => {
    valueRef.current = value
    onChangeTextRef.current = onChangeText
  })
  /**
   * Whether the emoji panel stands where the keyboard was. Messenger's smiley:
   * one tap swaps the keyboard for the panel, the keyboard icon in its place —
   * or a tap on the field — swaps it back.
   */
  const [emojiOpen, setEmojiOpen] = useState(false)
  /** The keyboard's last height, so the panel replaces it without the thread jumping. */
  const [panelHeight, setPanelHeight] = useState(EMOJI_PANEL_FALLBACK_HEIGHT)
  const [staged, setStaged] = useState<AttachmentView | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [livePeaks, setLivePeaks] = useState<number[]>(() =>
    Array.from({ length: VOICE_NOTE_PEAK_BARS }, () => 0.12),
  )
  const levelsRef = useRef<number[]>([])
  const startedAtRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const recorder = useAudioRecorder(RECORD_OPTIONS)
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS)
  // Read through refs at teardown: the cleanup closure runs after the last
  // render, and both the mic and the audio session outlive this component.
  const recorderRef = useRef(recorder)
  recorderRef.current = recorder
  const heldAudioSessionRef = useRef(false)
  const meteringRef = useRef<number | null>(null)

  const canSend = value.trim().length > 0 || staged != null || wallPost != null
  const showMic = !recording && !staged && !wallPost && value.trim().length === 0
  const ready = useSharedValue(canSend || recording ? 1 : 0.92)
  // The keyboard covers the home indicator / nav bar, so once the thread has
  // lifted the composer by that much, its own safe-area gap is redundant.
  const bottom = Math.max(0, screenBottomPad(insets.bottom) - keyboardInset)

  useEffect(() => {
    if (reduceMotion) {
      ready.set(canSend || recording ? 1 : 0.92)
      return
    }
    ready.set(withSpring(canSend || recording ? 1 : 0.92, motion.springs.press))
  }, [canSend, ready, recording, reduceMotion])

  // Unmounting mid-recording (hardware back, tapping through to another thread)
  // does not stop the recorder or hand the audio session back on its own: the
  // mic stays hot, and `allowsRecording: true` keeps routing playback to the
  // earpiece on iOS for the rest of the app session.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (!heldAudioSessionRef.current) return
      heldAudioSessionRef.current = false
      const active = recorderRef.current
      void (async () => {
        try {
          if (active?.isRecording) await active.stop()
        } catch {
          // Native recorder may already be released — the mode restore below
          // is the part that has to happen either way.
        }
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          })
        } catch {
          // Nothing left to fall back to at teardown.
        }
      })()
    }
  }, [])

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', (event) => {
      const height = Math.round(event.endCoordinates.height)
      if (height > 0) setPanelHeight(height)
      // The keyboard came back by some other road than the toggle — a focus
      // from elsewhere — and two inputs cannot share the space.
      setEmojiOpen(false)
    })
    return () => sub.remove()
  }, [])

  // Back closes the panel before it leaves the thread, as it would a keyboard.
  useEffect(() => {
    if (!emojiOpen) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEmojiOpen(false)
      return true
    })
    return () => sub.remove()
  }, [emojiOpen])

  useEffect(() => {
    meteringRef.current = recorderState.metering ?? null
  }, [recorderState.metering])

  // Live metering → rolling peaks, sampled on our own tick rather than on
  // metering *change*: silence pins the dB reading to a floor value, so keying
  // off the value stops appending samples exactly where the strip should still
  // be scrolling — and the saved waveform ends up mostly filler bars.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      const level = meteringToLevel(meteringRef.current)
      levelsRef.current.push(level)
      setLivePeaks((prev) => {
        const next = prev.slice(1)
        next.push(level)
        return next
      })
    }, METERING_POLL_MS)
    return () => clearInterval(id)
  }, [recording])

  // `finishRecording` is redeclared every render and closes over `elapsedMs`,
  // so naming it in the dependencies below would say something untrue either
  // way: listed, the auto-stop re-subscribes on every tick for a function that
  // has not meaningfully changed; omitted, the effect holds whichever copy the
  // recording started with. The ref is the latest one, written in an effect
  // rather than during render, which is the only place a ref may be written.
  const finishRecordingRef = useRef(finishRecording)
  useEffect(() => {
    finishRecordingRef.current = finishRecording
  })

  // Auto-stop at 20 minutes.
  useEffect(() => {
    if (!recording) return
    if (elapsedMs < VOICE_NOTE_MAX_MS) return
    void finishRecordingRef.current()
  }, [elapsedMs, recording])

  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ready.get() }],
    opacity: 0.4 + ready.get() * 0.6,
  }))

  /**
   * Hand the audio session back to playback. Guarded so a composer that never
   * recorded does not stamp a global audio mode it never took.
   */
  async function restorePlaybackAudioMode() {
    if (!heldAudioSessionRef.current) return
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      })
      heldAudioSessionRef.current = false
    } catch {
      // Leave the flag set so teardown gets one more attempt; surfacing an
      // audio-session error mid-send helps nobody.
    }
  }

  function clearTicker() {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    startedAtRef.current = null
  }

  async function startRecording() {
    try {
      const permission = await requestRecordingPermissionsAsync()
      const outcome = classifyPermissionOutcome(permission)
      if (outcome === 'denied-settings') {
        Alert.alert(
          'Microphone access needed',
          'Enable microphone access in Settings to send a voice note.',
        )
        return
      }
      if (outcome !== 'proceed') return
      setEmojiOpen(false)
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      })
      heldAudioSessionRef.current = true
      levelsRef.current = []
      setLivePeaks(Array.from({ length: VOICE_NOTE_PEAK_BARS }, () => 0.12))
      setElapsedMs(0)
      await recorder.prepareToRecordAsync()
      recorder.record()
      startedAtRef.current = Date.now()
      setRecording(true)
      tickRef.current = setInterval(() => {
        if (startedAtRef.current == null) return
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 250)
    } catch {
      Alert.alert('Could not record', 'Something went wrong starting the voice note.')
      setRecording(false)
      clearTicker()
      await restorePlaybackAudioMode()
    }
  }

  async function finishRecording() {
    if (!recording && !recorder.isRecording) return
    const durationMs = Math.min(
      startedAtRef.current != null ? Date.now() - startedAtRef.current : elapsedMs,
      VOICE_NOTE_MAX_MS,
    )
    clearTicker()
    setRecording(false)
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) {
        Alert.alert('Could not save voice note', 'No recording was produced.')
        return
      }
      const peaks = downsamplePeaks(levelsRef.current, VOICE_NOTE_PEAK_BARS)
      setStaged({
        kind: 'audio',
        uri,
        name: fileNameFromUri(uri, 'voice-note.m4a'),
        size: null,
        durationMs,
        peaks,
      })
    } catch {
      Alert.alert('Could not save voice note', 'Something went wrong finishing the recording.')
    } finally {
      // Every exit runs this — including the no-URI early return and the throw,
      // which both used to leave the session stuck in recording mode.
      await restorePlaybackAudioMode()
    }
  }

  async function cancelRecording() {
    clearTicker()
    setRecording(false)
    setElapsedMs(0)
    levelsRef.current = []
    try {
      if (recorder.isRecording) {
        await recorder.stop()
      }
    } catch {
      // Discard path — nothing useful to surface.
    } finally {
      await restorePlaybackAudioMode()
    }
  }

  function handlePicked(attachment: AttachmentView) {
    setStaged(attachment)
  }

  function handleCloseAttach() {
    setAttachOpen(false)
    if (!pickerAfterSheetRef.current) return
    pickerAfterSheetRef.current = false
    setPickerOpen(true)
  }

  function handleInsertSavedResponse(body: string) {
    const next = insertCannedReply(value, selectionRef.current, body)
    onChangeText(next.text)
    selectionRef.current = { start: next.caret, end: next.caret }
    setPickerOpen(false)
  }

  function toggleEmoji() {
    if (emojiOpen) {
      // Focusing brings the keyboard back, and its show event closes the panel.
      // Closed here as well, for a field whose keyboard was already up.
      setEmojiOpen(false)
      inputRef.current?.focus()
      return
    }
    Keyboard.dismiss()
    setEmojiOpen(true)
  }

  /**
   * Puts an emoji where the caret was, replacing a selection the way typing does.
   *
   * Reads the draft through a ref and is itself stable: the emoji keyboard
   * memoises its grid forever and calls whichever handler it was first given, so
   * a handler closing over `value` would insert every emoji into the draft as it
   * stood when the panel opened — each tap replacing the last.
   */
  const insertEmoji = useCallback((emoji: string) => {
    const current = valueRef.current
    const caret = selectionRef.current ?? { start: current.length, end: current.length }
    const start = Math.min(caret.start, current.length)
    const end = Math.min(Math.max(caret.end, start), current.length)
    const next = current.slice(0, start) + emoji + current.slice(end)
    valueRef.current = next
    onChangeTextRef.current(next)
    selectionRef.current = { start: start + emoji.length, end: start + emoji.length }
  }, [])

  function handleSend() {
    if (recording) return
    const body = value.trim()
    if (!body && !staged && !wallPost) return

    // Cleared only once the message is on its way. A send refused before it
    // starts — a file over the limit, a type the API will not take — leaves the
    // draft exactly as it was, so the person can drop the file and keep what
    // they wrote rather than typing it again.
    if (!onSend({ body, attachment: staged ?? undefined })) return

    onChangeText('')
    setStaged(null)
  }

  return (
    <View
      className="border-t border-line bg-surface"
      style={{ paddingBottom: bottom }}
    >
      {wallPost ? (
        <Animated.View entering={settleDownEnter(!!reduceMotion)}>
          <WallPostReferenceStrip
            reference={wallPost}
            onRemove={() => onRemoveWallPost?.()}
          />
        </Animated.View>
      ) : null}

      {complaint && complaintOrganizations ? (
        <Animated.View entering={settleDownEnter(!!reduceMotion)}>
          <ComplaintStrip
            organizations={complaintOrganizations}
            organizationId={complaint.organizationId}
            onChange={(organizationId) => onComplaintChange?.({ organizationId })}
            onDismiss={() => onComplaintChange?.(null)}
          />
        </Animated.View>
      ) : null}

      {replyTo ? (
        <Animated.View
          entering={settleDownEnter(!!reduceMotion)}
          className="flex-row items-center gap-2 border-b border-line/40 px-4 py-2 bg-primary-soft/40"
        >
          <View className="w-1 self-stretch rounded-full bg-primary" />
          {replyTo.thumbUri ? (
            replyTo.kind === 'video' ? (
              <VideoThumb
                uri={replyTo.thumbUri}
                size={36}
                className="rounded-lg"
                accessibilityLabel="Replying to a video"
              />
            ) : (
              <Image
                source={{ uri: replyTo.thumbUri }}
                className="size-9 rounded-lg bg-line/40"
                resizeMode="cover"
                accessibilityLabel="Replying to a photo"
              />
            )
          ) : null}
          <View className="min-w-0 flex-1 pl-1">
            <Text variant="label" className="font-bold text-primary" numberOfLines={1}>
              Replying to {replyTo.name}
            </Text>
            <Text variant="label" className="font-normal text-ink-soft" numberOfLines={1}>
              {replyTo.body}
            </Text>
          </View>
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onCancelReply}
            className="size-8 items-center justify-center rounded-full bg-surface"
          >
            <X color={colors.muted} size={16} />
          </TactilePressable>
        </Animated.View>
      ) : null}

      {recording ? (
        <View className="flex-row items-center gap-2 px-3 py-2.5">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Cancel voice note"
            onPress={() => void cancelRecording()}
            className="mb-0.5 size-11 items-center justify-center rounded-full bg-line/35 border border-line/80"
          >
            <X color={colors.danger} size={18} />
          </TactilePressable>
          <View className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2 rounded-2xl border border-danger/30 bg-danger/5 px-3">
            <View className="size-2.5 shrink-0 rounded-full bg-danger" />
            <Waveform peaks={livePeaks} className="h-7 min-w-0 flex-1" />
            <Text
              variant="label"
              className="w-10 shrink-0 text-right font-semibold tabular-nums text-danger"
            >
              {formatDurationMs(elapsedMs)}
            </Text>
          </View>
          <TactilePressable
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            onPress={() => void finishRecording()}
            className="mb-0.5 size-11 items-center justify-center rounded-full bg-danger shadow-sm"
          >
            <Square color={colors.primaryForeground} size={16} />
          </TactilePressable>
        </View>
      ) : (
        <View className="flex-row items-end gap-2 px-3 py-2.5">
          <TactilePressable
            accessibilityRole="button"
            accessibilityLabel="Attach"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={() => {
              setEmojiOpen(false)
              setAttachOpen(true)
            }}
            className="mb-0.5 size-11 items-center justify-center rounded-full bg-line/35 border border-line/80"
          >
            <Plus color={colors.inkSoft} size={20} />
          </TactilePressable>

          <View className="min-h-11 min-w-0 flex-1 rounded-2xl border border-line/80 bg-line/35 px-3 py-2">
            {staged ? (
              <StagedAttachmentChip
                attachment={staged}
                onClear={() => setStaged(null)}
              />
            ) : null}
            <View className="flex-row items-end">
              <Input
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                onSelectionChange={(event) => {
                  selectionRef.current = event.nativeEvent.selection
                }}
                // A tap on the field while the panel is up asks for the keyboard.
                onFocus={() => setEmojiOpen(false)}
                placeholder={
                  wallPost
                    ? 'Add a message about this post…'
                    : replyTo
                      ? 'Write a reply…'
                      : 'Type a message…'
                }
                accessibilityLabel="Message"
                multiline
                className="max-h-28 min-h-7 h-auto min-w-0 flex-1 border-0 bg-transparent px-1 py-1 font-sans text-base text-ink"
              />
              {/* Inside the field, trailing, where Messenger keeps it. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={emojiOpen ? 'Show keyboard' : 'Emoji'}
                hitSlop={10}
                onPress={toggleEmoji}
                className="mb-0.5 ml-1 size-7 items-center justify-center rounded-full active:opacity-60"
              >
                {emojiOpen ? (
                  <KeyboardIcon color={colors.primary} size={20} />
                ) : (
                  <Smile color={colors.primary} size={21} />
                )}
              </Pressable>
            </View>
          </View>

          {showMic ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Record voice note"
              onPress={() => void startRecording()}
              className="mb-0.5 size-11 items-center justify-center rounded-full bg-line/35 border border-line/80"
            >
              <Mic color={colors.inkSoft} size={20} />
            </TactilePressable>
          ) : (
            <Animated.View style={sendStyle}>
              <TactilePressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!canSend}
                onPress={handleSend}
                className="mb-0.5 size-11 items-center justify-center rounded-full bg-primary shadow-sm shadow-primary/30"
              >
                <Send color={colors.primaryForeground} size={17} />
              </TactilePressable>
            </Animated.View>
          )}
        </View>
      )}

      {emojiOpen && !recording ? (
        <EmojiPanel height={panelHeight} onEmojiSelected={insertEmoji} />
      ) : null}

      <AttachmentSheet
        visible={attachOpen}
        onClose={handleCloseAttach}
        onPicked={handlePicked}
        onInsertText={(text) => {
          if (!value.trim()) onChangeText(text)
          else onChangeText(`${value} ${text}`)
        }}
        onOpenSavedResponses={
          savedResponses
            ? () => {
                pickerAfterSheetRef.current = true
              }
            : undefined
        }
        onStartComplaint={
          complaintOrganizations && !complaint
            ? () =>
                onComplaintChange?.({ organizationId: complaintOrganizations[0]?.id ?? null })
            : undefined
        }
      />

      {savedResponses ? (
        <SavedResponsePicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          organizationId={savedResponses.organizationId}
          canManage={savedResponses.canManage}
          onSelect={(reply) => handleInsertSavedResponse(reply.body)}
        />
      ) : null}
    </View>
  )
}
