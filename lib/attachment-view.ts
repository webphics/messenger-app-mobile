import { API_BASE_URL } from '@/lib/api-config'
import type {
  AttachmentKind,
  AttachmentView,
  MessageAttachment,
  WallPostAttachment,
} from '@/lib/types'

/**
 * The API's attachment shape, rendered.
 *
 * A bubble asks four things an attachment payload does not answer directly: what
 * kind of thing it is, where to fetch it from, how long it runs in milliseconds,
 * and what to call it. The payload carries a MIME type, a URL that may be a
 * path rather than an address, seconds, and a file name that may be null.
 *
 * Kept pure — the base URL is an argument with a default rather than a read —
 * so every branch is a table row.
 */

const KIND_BY_PREFIX: [string, AttachmentKind][] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
]

/**
 * What kind of attachment a MIME type describes.
 *
 * Anything that is not audio, image or video is a document — including an empty
 * or unrecognised type, because a row that cannot be classified still has to
 * render as something openable rather than disappear.
 */
export function attachmentKindFromType(type: string): AttachmentKind {
  const normalised = type.trim().toLowerCase()
  for (const [prefix, kind] of KIND_BY_PREFIX) {
    if (normalised.startsWith(prefix)) return kind
  }
  return 'document'
}

/**
 * An absolute URL for something the API stored.
 *
 * The upload endpoint answers with a path on some deployments and a full URL on
 * others (an object store signs its own). A path has to be joined to the API
 * origin, because a device has no notion of "the API" to resolve it against.
 */
export function resolveAttachmentUrl(url: string, baseUrl: string = API_BASE_URL): string {
  const value = url.trim()
  if (value === '') return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`
}

/** The last path segment of a URL, for an attachment the API did not name. */
function fileNameFromUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? ''
  const segment = withoutQuery.split('/').filter(Boolean).pop()
  return segment && segment !== '' ? decodeURIComponent(segment) : 'Attachment'
}

export function toAttachmentView(
  attachment: MessageAttachment,
  baseUrl: string = API_BASE_URL,
): AttachmentView {
  const uri = resolveAttachmentUrl(attachment.url, baseUrl)
  const name = attachment.fileName?.trim()

  return {
    kind: attachmentKindFromType(attachment.type),
    uri,
    name: name && name !== '' ? name : fileNameFromUrl(uri),
    size: attachment.size,
    ...(attachment.durationSeconds == null
      ? {}
      : { durationMs: Math.round(attachment.durationSeconds * 1000) }),
    ...(attachment.waveform && attachment.waveform.length > 0
      ? { peaks: attachment.waveform }
      : {}),
  }
}

/**
 * Every attachment on a message, in the order the API sent them.
 *
 * Plural because the payload is. This client stages one attachment at a time, so
 * a message it sends carries one — but a message from the web client can carry
 * several, and a bubble that drew only the first would silently lose the rest.
 */
export function attachmentViews(
  attachments: MessageAttachment[],
  baseUrl: string = API_BASE_URL,
): AttachmentView[] {
  return attachments.map((attachment) => toAttachmentView(attachment, baseUrl))
}

/**
 * The one attachment that stands for a message where only one can.
 *
 * A quote strip and a preview line have room for a single label, and that label
 * is the first attachment. What a *bubble* draws is `attachmentViews` — all of
 * them — so this is not "the attachment", and the two call sites that want one
 * say which one they mean by asking here.
 */
export function primaryAttachmentView(
  attachments: MessageAttachment[],
  baseUrl: string = API_BASE_URL,
): AttachmentView | undefined {
  const first = attachments[0]
  return first ? toAttachmentView(first, baseUrl) : undefined
}

/**
 * The object the API stored, completed with what only this device ever knew.
 *
 * The upload endpoint received a file, so it reports a file: a type, a URL, a
 * name and a size. Three things about the attachment are not properties of the
 * file and do not survive it.
 *
 * A voice note's duration and its bar levels were measured by the recorder while
 * it was recording, and nothing on the server can recover them from the audio.
 *
 * And the name: the API names its objects randomly, because an uploaded name is
 * attacker-supplied, and echoes back whatever the multipart part happened to be
 * called — for a photo, the picker's cache filename, which means nothing to
 * anyone. The name somebody chose is the one to show. The URL is the identity;
 * this is only the label.
 *
 * The third way round, beside `toAttachmentView` and `toMessageAttachment`, and
 * here with them because the three are one conversion between two shapes and
 * splitting them across modules is how they drift apart.
 */
export function storedAttachment(
  stored: MessageAttachment,
  local: AttachmentView,
): MessageAttachment {
  const name = local.name.trim()

  return {
    ...stored,
    fileName: name === '' ? stored.fileName : name,
    durationSeconds: local.durationMs == null ? null : local.durationMs / 1000,
    waveform: local.peaks && local.peaks.length > 0 ? local.peaks : null,
  }
}

const TYPE_BY_KIND: Record<AttachmentKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: 'application/octet-stream',
}

/**
 * The reverse: something captured on this device, in the shape a message holds.
 *
 * The picker reports a kind rather than a MIME type, so the type here is the
 * wildcard for that kind — enough for `attachmentKindFromType` to read it back
 * as what it was, which is all any local round trip needs.
 *
 * Still used, and no longer only locally: the bubble a send puts on screen holds
 * the device URI while the upload is out, so the photo is visible from the
 * moment it is sent rather than from the moment the server has it. The API's
 * answer replaces the whole attachment with the real file and the real type.
 */
export function toMessageAttachment(view: AttachmentView): MessageAttachment {
  return {
    type: TYPE_BY_KIND[view.kind],
    url: view.uri,
    fileName: view.name,
    size: view.size,
    durationSeconds: view.durationMs == null ? null : view.durationMs / 1000,
    waveform: view.peaks ?? null,
  }
}

/**
 * A Post's attachment, in the shape this app already knows how to draw.
 *
 * A Post carries the API's own three-way kind rather than a MIME type, so there
 * is nothing to classify — but everything downstream of a rendered attachment
 * (the document opener, the video player, the byte count) speaks
 * `AttachmentView`, and a second shape beside it would be a second set of those.
 * The URL is made absolute here for the same reason a Message's is: a device has
 * no notion of "the API" to resolve `/uploads/...` against.
 *
 * `audio` is not among the kinds a Post can carry. A voice note is something one
 * person sends another; a Wall has no such thing.
 */
export function toWallAttachmentView(
  attachment: WallPostAttachment,
  baseUrl: string = API_BASE_URL,
): AttachmentView {
  const uri = resolveAttachmentUrl(attachment.url, baseUrl)
  const name = attachment.fileName?.trim()

  return {
    kind: attachment.kind,
    uri,
    name: name && name !== '' ? name : fileNameFromUrl(uri),
    size: attachment.size,
  }
}
