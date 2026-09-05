import { API_BASE_URL } from '@/lib/api-config'
import { attachmentViews } from '@/lib/attachment-view'
import { isSystemMessage } from '@/lib/thread-state'
import type { AttachmentView, Message } from '@/lib/types'

/**
 * Everything a conversation has carried, arranged for one screen.
 *
 * Pure, and separate from the screen, for the same reason `thread-rows` is: the
 * decisions are worth stating once and testing as a table — what counts as an
 * attachment, what order they come back in, which of them share a grid and which
 * get a row of their own.
 *
 * There is no endpoint behind this. The gallery reads the same pages the thread
 * reads, so a conversation's media is whatever its loaded messages carry, and
 * paging further back is what makes more of it appear. It mirrors the web
 * client's Shared in Chat pane, tab for tab, down to the link list — the two
 * clients are looking at the same messages and should find the same things in
 * them.
 */

/** Tiles across the photo-and-video grid. */
export const GALLERY_COLUMNS = 3

export type GalleryCategory = 'media' | 'docs' | 'voice' | 'links'

export const GALLERY_CATEGORIES: GalleryCategory[] = ['media', 'docs', 'voice', 'links']

const CATEGORY_LABEL: Record<GalleryCategory, string> = {
  media: 'Media',
  docs: 'Docs',
  voice: 'Voice',
  links: 'Links',
}

const CATEGORY_EMPTY: Record<GalleryCategory, string> = {
  media: 'No photos or videos shared yet',
  docs: 'No documents shared yet',
  voice: 'No voice notes yet',
  links: 'No links shared yet',
}

export function galleryCategoryLabel(category: GalleryCategory): string {
  return CATEGORY_LABEL[category]
}

export function galleryEmptyText(category: GalleryCategory): string {
  return CATEGORY_EMPTY[category]
}

export type GalleryItem = {
  /**
   * Unique per attachment rather than per message: a message may carry several,
   * and a list keyed by message id would drop all but one of them.
   */
  id: string
  attachment: AttachmentView
  /** The message it arrived on. */
  messageId: string
  /** When that message was sent. */
  sentAt: string
}

export type GalleryLink = {
  id: string
  url: string
  messageId: string
  sentAt: string
}

/** Everything a conversation has carried, split the way the tabs split it. */
export type GalleryContents = {
  media: GalleryItem[]
  docs: GalleryItem[]
  voice: GalleryItem[]
  links: GalleryLink[]
}

export type GalleryRow =
  /** One line of the grid: up to `GALLERY_COLUMNS` photos or videos. */
  | { type: 'tiles'; id: string; items: GalleryItem[] }
  /** A voice note or a document, which are as wide as the screen. */
  | { type: 'file'; id: string; item: GalleryItem }
  | { type: 'link'; id: string; link: GalleryLink }

/**
 * A bare URL in a message body.
 *
 * Deliberately the web client's own pattern, so the two clients list the same
 * links out of the same message rather than disagreeing about what one is. The
 * trailing punctuation trim is this client's: a URL at the end of a sentence
 * comes back with the full stop attached, and tapping that opens nothing.
 */
const URL_PATTERN = /https?:\/\/[^\s]+/g

function trimUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/, '')
}

/**
 * Everything a thread has carried, newest first, split by kind.
 *
 * Newest first because that is the order a gallery is read in — the photo
 * somebody is looking for is usually the one just sent — and it is the order the
 * thread itself already uses. Newest *message* first, that is: a message
 * carrying several keeps them in the order the API sent them, which is the order
 * its bubble drew them in.
 *
 * A system notice contributes nothing. It is the thread's record of an
 * assignment rather than something a person sent, so neither an attachment nor a
 * URL on one would be a thing anyone shared here.
 */
export function galleryContents(
  messages: Message[],
  baseUrl: string = API_BASE_URL,
): GalleryContents {
  const media: GalleryItem[] = []
  const docs: GalleryItem[] = []
  const voice: GalleryItem[] = []
  const links: GalleryLink[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (isSystemMessage(message)) continue

    /**
     * A message the recorder sent is a voice note whatever its files claim.
     *
     * The API names its objects from the multipart part, so a recording can come
     * back typed `application/octet-stream` and sort itself into Docs on kind
     * alone. The web client reads `messageType` here for the same reason, and the
     * two clients must not file one message under different tabs.
     */
    const recorded = message.messageType === 'voice'

    attachmentViews(message.attachments, baseUrl).forEach((attachment, index) => {
      const item: GalleryItem = {
        id: `${message.id}:${index}`,
        attachment,
        messageId: message.id,
        sentAt: message.createdAt,
      }
      if (recorded || attachment.kind === 'audio') voice.push(item)
      else if (attachment.kind === 'image' || attachment.kind === 'video') media.push(item)
      else docs.push(item)
    })

    const matched = message.body.match(URL_PATTERN) ?? []
    matched.forEach((raw, index) => {
      const url = trimUrl(raw)
      if (url === '') return
      links.push({
        id: `${message.id}:link:${index}`,
        url,
        messageId: message.id,
        sentAt: message.createdAt,
      })
    })
  }

  return { media, docs, voice, links }
}

/** How many things are under each tab, which is what the tabs count. */
export function galleryCount(
  contents: GalleryContents,
  category: GalleryCategory,
): number {
  return contents[category].length
}

/**
 * What one tab draws, in order.
 *
 * The four kinds do not share a shape: a photo and a video are both a square
 * that can be tiled, while a voice note is a player, a document is a name and a
 * link is a line of text — all three of which want the width of the screen.
 */
export function galleryRows(
  contents: GalleryContents,
  category: GalleryCategory,
  columns: number = GALLERY_COLUMNS,
): GalleryRow[] {
  if (category === 'links') {
    return contents.links.map((link) => ({ type: 'link', id: link.id, link }))
  }
  if (category !== 'media') {
    return contents[category].map((item) => ({ type: 'file', id: item.id, item }))
  }

  const perRow = Math.max(1, Math.floor(columns))
  const rows: GalleryRow[] = []
  for (let i = 0; i < contents.media.length; i += perRow) {
    const tiles = contents.media.slice(i, i + perRow)
    rows.push({ type: 'tiles', id: `tiles-${tiles[0]!.id}`, items: tiles })
  }
  return rows
}
