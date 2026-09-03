import { API_BASE_URL } from '@/lib/api-config'
import type { AttachmentKind, AttachmentView, MessageAttachment } from '@/lib/types'

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
 * The one attachment a bubble draws today.
 *
 * A message can carry several. Rendering all of them is #35's job — until then a
 * bubble draws the first and this is the single place that says so, rather than
 * `attachments[0]` appearing at every call site as if it were the whole truth.
 */
export function primaryAttachmentView(
  attachments: MessageAttachment[],
  baseUrl: string = API_BASE_URL,
): AttachmentView | undefined {
  const first = attachments[0]
  return first ? toAttachmentView(first, baseUrl) : undefined
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
 * as what it was, which is all any local round trip needs. Uploading gives the
 * server the real file and the real type in return (#35).
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
