import type { AttachmentKind, Message, MessageAttachment } from '@/lib/types'

export const VOICE_NOTE_MAX_MS = 20 * 60 * 1000
export const VOICE_NOTE_PEAK_BARS = 48

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice note',
  document: 'Document',
}

export function attachmentKindLabel(kind: AttachmentKind): string {
  return KIND_LABEL[kind]
}

/** Inbox / composer preview when body is empty or alongside a caption. */
export function messagePreviewText(
  message: Pick<Message, 'body' | 'attachment'>,
): string {
  const caption = message.body.replace(/\s+/g, ' ').trim()
  const attachment = message.attachment
  if (!attachment) return caption

  const label =
    attachment.kind === 'document' && attachment.name.trim().length > 0
      ? attachment.name.trim()
      : attachmentKindLabel(attachment.kind)

  if (!caption) return label
  return `${label} · ${caption}`
}

/** Quote strip text (Messenger-style label + optional caption). */
export function quoteAttachmentText(
  message: Pick<Message, 'body' | 'attachment'>,
  max = 72,
): string {
  const text = messagePreviewText(message)
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}…`
}

/** Convert recorder metering (dB, typically -160..0) to a 0..1 bar level. */
export function meteringToLevel(metering: number | null | undefined): number {
  if (metering == null || !Number.isFinite(metering)) return 0.18
  const clamped = Math.max(-50, Math.min(0, metering))
  return (clamped + 50) / 50
}

/** Collapse a stream of 0..1 samples into a fixed bar count (max per bucket). */
export function downsamplePeaks(
  levels: number[],
  barCount: number = VOICE_NOTE_PEAK_BARS,
): number[] {
  const n = Math.max(1, Math.floor(barCount))
  if (levels.length === 0) return Array.from({ length: n }, () => 0.12)

  if (levels.length <= n) {
    const out = levels.map((v) => clamp01(v))
    while (out.length < n) out.push(0.12)
    return out
  }

  const out: number[] = []
  const bucket = levels.length / n
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * bucket)
    const end = Math.floor((i + 1) * bucket)
    let max = 0
    for (let j = start; j < end; j++) {
      const v = levels[j] ?? 0
      if (v > max) max = v
    }
    out.push(clamp01(max))
  }
  return out
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function isImageOrVideo(
  attachment: MessageAttachment | undefined,
): attachment is MessageAttachment & { kind: 'image' | 'video' } {
  return attachment?.kind === 'image' || attachment?.kind === 'video'
}

/**
 * Meta-style quote chrome for a reply Message.
 * - fused-on-image: text-only reply to an image (bubble overlays the quoted photo)
 * - header-only: reply Attachment quoting image/video (caption only; no Photo/Video pill)
 * - standard: text/text or non-image quotes (caption + optional chip)
 */
export type QuoteLayoutMode = 'fused-on-image' | 'header-only' | 'standard'

export function quoteLayoutMode(
  quoted: Pick<Message, 'body' | 'attachment'>,
  reply: Pick<Message, 'body' | 'attachment'>,
): QuoteLayoutMode {
  const quotedKind = quoted.attachment?.kind
  if (
    reply.attachment &&
    (quotedKind === 'image' || quotedKind === 'video')
  ) {
    return 'header-only'
  }
  if (
    quotedKind === 'image' &&
    !reply.attachment &&
    reply.body.replace(/\s+/g, ' ').trim().length > 0
  ) {
    return 'fused-on-image'
  }
  return 'standard'
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
