import {
  FileText,
  Mic,
  Plus,
  Send,
  Square,
  X,
} from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Alert, Image, Pressable, View } from 'react-native'
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
import { Waveform } from '@/components/chat/waveform'
import { Input } from '@/components/ui/input'
import { TactilePressable } from '@/components/ui/tactile-pressable'
import { Text } from '@/components/ui/text'
import {
  classifyPermissionOutcome,
  fileNameFromUri,
  formatBytes,
} from '@/lib/attachments'
import {
  attachmentKindLabel,
  downsamplePeaks,
  formatDurationMs,
  meteringToLevel,
  VOICE_NOTE_MAX_MS,
  VOICE_NOTE_PEAK_BARS,
} from '@/lib/message-attachment'
import { motion } from '@/lib/motion'
import { settleDownEnter } from '@/lib/motion-enter'
import { colors, screenBottomPad } from '@/lib/tokens'
import type { MessageAttachment } from '@/lib/types'

export type ComposerSendPayload = {
  body: string
  attachment?: MessageAttachment
}

export type ComposerReplyPreview = {
  name: string
  body: string
  thumbUri?: string
}

type ComposerProps = {
  value: string
  onChangeText: (text: string) => void
  onSend: (payload: ComposerSendPayload) => void
  replyTo?: ComposerReplyPreview | null
  onCancelReply?: () => void
  /** Overlap the thread already lifted the composer by; see lib/keyboard-inset.ts. */
  keyboardInset?: number
}

const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
}

/** In-chrome staging thumb (Meta-style nested preview). */
function StagedAttachmentChip({
  attachment,
  onClear,
}: {
  attachment: MessageAttachment
  onClear: () => void
}) {
  const isVisual =
    attachment.kind === 'image' || attachment.kind === 'video'

  return (
    <View className="relative mb-1.5 self-start">
      {isVisual ? (
        <Image
          source={{ uri: attachment.uri }}
          className="size-16 rounded-xl bg-line/40"
          resizeMode="cover"
          accessibilityLabel={attachment.name}
        />
      ) : (
        <View className="h-14 min-w-[7.5rem] max-w-[11rem] flex-row items-center gap-2 rounded-xl border border-line/70 bg-surface px-2.5">
          <View className="size-9 items-center justify-center rounded-lg bg-primary-soft">
            <FileText color={colors.primary} size={18} />
          </View>
          <View className="min-w-0 flex-1 pr-4">
            <Text variant="label" className="font-bold text-ink" numberOfLines={1}>
              {attachment.kind === 'audio'
                ? attachmentKindLabel('audio')
                : attachment.name}
            </Text>
            <Text variant="label" className="font-normal text-muted" numberOfLines={1}>
              {attachment.kind === 'audio'
                ? formatDurationMs(attachment.durationMs)
                : formatBytes(attachment.size) ??
                  attachmentKindLabel(attachment.kind)}
            </Text>
          </View>
        </View>
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

export function Composer({
  value,
  onChangeText,
  onSend,
  replyTo,
  onCancelReply,
  keyboardInset = 0,
}: ComposerProps) {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const [attachOpen, setAttachOpen] = useState(false)
  const [staged, setStaged] = useState<MessageAttachment | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [livePeaks, setLivePeaks] = useState<number[]>(() =>
    Array.from({ length: VOICE_NOTE_PEAK_BARS }, () => 0.12),
  )
  const levelsRef = useRef<number[]>([])
  const startedAtRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const recorder = useAudioRecorder(RECORD_OPTIONS)
  const recorderState = useAudioRecorderState(recorder, 120)

  const canSend = value.trim().length > 0 || staged != null
  const showMic = !recording && !staged && value.trim().length === 0
  const ready = useSharedValue(canSend || recording ? 1 : 0.92)
  const bottom = Math.max(0, screenBottomPad(insets.bottom) - keyboardInset)

  useEffect(() => {
    if (reduceMotion) {
      ready.value = canSend || recording ? 1 : 0.92
      return
    }
    ready.value = withSpring(canSend || recording ? 1 : 0.92, motion.springs.press)
  }, [canSend, ready, recording, reduceMotion])

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  // Live metering → rolling peaks while recording.
  useEffect(() => {
    if (!recording) return
    const level = meteringToLevel(recorderState.metering)
    levelsRef.current.push(level)
    setLivePeaks((prev) => {
      const next = prev.slice(1)
      next.push(level)
      return next
    })
  }, [recording, recorderState.metering])

  // Auto-stop at 20 minutes.
  useEffect(() => {
    if (!recording) return
    if (elapsedMs < VOICE_NOTE_MAX_MS) return
    void finishRecording()
  }, [elapsedMs, recording])

  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ready.value }],
    opacity: 0.4 + ready.value * 0.6,
  }))

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
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      })
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
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      })
    } catch {
      Alert.alert('Could not save voice note', 'Something went wrong finishing the recording.')
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
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      })
    } catch {
      // Discard path — nothing useful to surface.
    }
  }

  function handlePicked(attachment: MessageAttachment) {
    setStaged(attachment)
  }

  function handleSend() {
    if (recording) return
    const body = value.trim()
    if (!body && !staged) return
    onSend({ body, attachment: staged ?? undefined })
    onChangeText('')
    setStaged(null)
  }

  return (
    <View
      className="border-t border-line bg-surface"
      style={{ paddingBottom: bottom }}
    >
      {replyTo ? (
        <Animated.View
          entering={settleDownEnter(!!reduceMotion)}
          className="flex-row items-center gap-2 border-b border-line/40 px-4 py-2 bg-primary-soft/40"
        >
          <View className="w-1 self-stretch rounded-full bg-primary" />
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
            haptic="medium"
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
            onPress={() => setAttachOpen(true)}
            className="mb-0.5 size-11 items-center justify-center rounded-full bg-line/35 border border-line/80 active:scale-95"
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
            <Input
              value={value}
              onChangeText={onChangeText}
              placeholder={replyTo ? 'Write a reply…' : 'Type a message…'}
              accessibilityLabel="Message"
              multiline
              className="max-h-28 min-h-7 h-auto border-0 bg-transparent px-1 py-1 font-sans text-base text-ink"
            />
          </View>

          {showMic ? (
            <TactilePressable
              accessibilityRole="button"
              accessibilityLabel="Record voice note"
              onPress={() => void startRecording()}
              className="mb-0.5 size-11 items-center justify-center rounded-full bg-line/35 border border-line/80 active:scale-95"
            >
              <Mic color={colors.inkSoft} size={20} />
            </TactilePressable>
          ) : (
            <Animated.View style={sendStyle}>
              <TactilePressable
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!canSend}
                onPress={handleSend}
                className="mb-0.5 size-11 items-center justify-center rounded-full bg-primary shadow-sm shadow-primary/30 active:scale-95"
              >
                <Send color={colors.primaryForeground} size={17} />
              </TactilePressable>
            </Animated.View>
          )}
        </View>
      )}

      <AttachmentSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPicked={handlePicked}
        onInsertText={(text) => {
          if (!value.trim()) onChangeText(text)
          else onChangeText(`${value} ${text}`)
        }}
      />
    </View>
  )
}
