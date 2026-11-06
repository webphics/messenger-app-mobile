import type { AttachmentKind, AttachmentView } from '@/lib/types'

/**
 * What an attachment has to be before it is worth uploading.
 *
 * The API decides this — `conversations.upload.ts` filters on MIME type and
 * caps the body at fifteen megabytes — and it decides it again after a device
 * has spent a minute pushing a file up. So the rules are mirrored here to refuse
 * before the upload rather than after it, exactly as the web client's
 * `upload.utils.ts` mirrors them. The server remains the authority; this only
 * saves the round trip and gives the refusal a sentence a person can act on.
 *
 * Pure, and free of both React and the network: what a picker produced is a URI
 * and a name, and everything below is a function of those two.
 */

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024)

/**
 * The API's allowlist, by the extension a device file carries.
 *
 * Extension rather than a reported MIME type because neither picker reliably
 * gives one: `expo-image-picker` reports a kind, and `expo-document-picker`'s
 * `mimeType` comes from the OS provider and is `application/octet-stream` often
 * enough to matter. The extension is what the file is actually named, on both
 * platforms, and it is what the API's own fallback consults when an object
 * store recorded no type.
 *
 * `image/svg+xml` is absent on purpose, on both sides: an SVG is a script
 * container and these files are served back from the API's own origin.
 * `.heic` is absent because the API does not accept it — Expo's picker hands
 * back a JPEG on both platforms, so this refuses the case where it did not.
 */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  caf: 'audio/mp4',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  // `.webm` is both an audio and a video container, and the API takes either.
  // Video is the honest guess: the recorder writes `.m4a`, so a `.webm` reaching
  // here came from the library or the file provider, where it is a clip.
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
}

/** The lower-cased extension of a name or a URI, without its dot. Empty when there is none. */
export function fileExtension(nameOrUri: string): string {
  const path = nameOrUri.split(/[?#]/)[0] ?? ''
  const segment = path.substring(path.lastIndexOf('/') + 1)
  const dot = segment.lastIndexOf('.')
  return dot <= 0 ? '' : segment.slice(dot + 1).toLowerCase()
}

/**
 * The MIME type to declare for a file this device is about to send.
 *
 * Null is "the API will not take this", not "we could not tell": an unknown
 * extension is a type outside the allowlist, and the refusal below says so.
 * The name is consulted before the URI because a document picker's cache copy is
 * named by the OS and the name it reports is the one the person chose.
 */
export function uploadMimeType(attachment: Pick<AttachmentView, 'uri' | 'name'>): string | null {
  for (const candidate of [attachment.name, attachment.uri]) {
    const extension = fileExtension(candidate ?? '')
    const mime = extension === '' ? undefined : MIME_BY_EXTENSION[extension]
    if (mime) return mime
  }
  return null
}

export const UNSUPPORTED_TYPE_MESSAGE =
  'That file type is not allowed. Send images, audio, video, PDFs, Office documents, or zip archives.'

/**
 * Why this attachment cannot be uploaded, or null when it can be.
 *
 * Size is only checked where the platform reported one — a recorder reports
 * none, and refusing a voice note for a size nobody measured would be inventing
 * a verdict. The API's own limit catches what this cannot see, as a `413`.
 */
export function rejectUploadReason(attachment: AttachmentView): string | null {
  if (attachment.size != null && attachment.size > MAX_UPLOAD_BYTES) {
    const name = attachment.name.trim()
    const subject = name === '' ? 'That file' : `“${name}”`
    // Non-breaking, so the number and its unit never break across lines.
    return `${subject} is larger than the ${MAX_UPLOAD_MB} MB limit.`
  }

  if (!uploadMimeType(attachment)) return UNSUPPORTED_TYPE_MESSAGE

  return null
}

/**
 * Why a message cannot be sent again, naming the staged files that have gone.
 *
 * Beside the other two refusals rather than beside the check that finds them:
 * this is the same kind of sentence `rejectUploadReason` writes — an attachment
 * the API is not going to receive, said in words somebody can act on — and it is
 * pure, where the check has to read a disk. Which files have gone is
 * `missingStagedFiles` in `lib/staged-file`, and why any of them can go is
 * explained there.
 *
 * Named where every missing file has a name, because "a file is missing" on a
 * message carrying three of them is not something a person can act on, and what
 * they can do about it — attach it again — needs to know which. Where any of
 * them is nameless the sentence names none of them: a list missing one of its
 * subjects reads as a complete list, and somebody acting on it would replace the
 * wrong file.
 */
export function missingFilesMessage(missing: readonly Pick<AttachmentView, 'name'>[]): string {
  const names = missing.map((attachment) => attachment.name.trim()).filter(Boolean)
  const one = missing.length === 1

  const subject =
    names.length === missing.length
      ? `${names.map((name) => `“${name}”`).join(', ')} ${one ? 'is' : 'are'}`
      : one
        ? 'The file on this message is'
        : 'The files on this message are'

  return `${subject} no longer on this device. Attach ${one ? 'it' : 'them'} again to send this message.`
}

/**
 * Whether this URL still points at the device that produced it.
 *
 * What separates an attachment that has to be uploaded from one that already
 * has been. Everything the API stores is either an origin-free path
 * (`/uploads/chat/…`) or an absolute `http(s)` URL that an object store signed;
 * everything a picker or a recorder produces is `file:`, `content:`, `ph:` or
 * `assets-library:`. So the question is answerable from the string alone, which
 * is what lets a retry re-read a message's own attachments and upload only the
 * ones that never made it.
 */
export function isDeviceUri(url: string): boolean {
  const value = url.trim()
  if (value === '') return false
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  if (!scheme) return false
  return scheme !== 'http' && scheme !== 'https'
}

/**
 * Whether a URL the API sent can name a file the API stores: an origin-free
 * path (`/uploads/…`) or an absolute `http(s)` URL.
 *
 * The inverse of `isDeviceUri` for data that came off the network. A sender
 * writes an attachment's URL, so a `file:` or `content:` one arriving in a
 * message is somebody naming a file on *this* phone (the message database,
 * another app's content), and opening it would hand that file to the share
 * sheet. Those are dropped at the parse rather than trusted as already local.
 */
export function isServerFileUrl(url: string): boolean {
  const value = url.trim()
  if (value === '' || value.startsWith('//')) return false
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  // No scheme is a path `resolveAttachmentUrl` joins onto the API's own origin.
  if (!scheme) return true
  return scheme === 'http' || scheme === 'https'
}

/**
 * The `messageType` a send carries, from what it carries.
 *
 * The API's enum is `text | media | voice`, and `voice` is not a synonym for
 * "has audio": it is what a thread reads to draw a voice note rather than a file
 * row, so it belongs only to a message that is one voice note and nothing else.
 * A voice note sent beside a photo is media, like everything else with more than
 * one thing in it.
 */
export function sendMessageType(
  kinds: readonly AttachmentKind[],
): 'text' | 'media' | 'voice' {
  if (kinds.length === 0) return 'text'
  if (kinds.length === 1 && kinds[0] === 'audio') return 'voice'
  return 'media'
}
