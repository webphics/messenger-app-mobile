import type { CannedReply } from '@/lib/types'

/**
 * What the admin's saved-responses screen draws, decided without drawing it.
 *
 * The screen holds the whole library, archived rows included, and narrows it
 * here. That is what lets the empty state tell an empty library from one whose
 * every response is archived: those are different facts and call for different
 * next steps, adding one or restoring one.
 */

/** The API's limits (`canned-replies.schema.ts`), measured after trimming as it does. */
export const CANNED_REPLY_TITLE_MAX = 60
export const CANNED_REPLY_BODY_MAX = 4000

function matches(reply: CannedReply, needle: string): boolean {
  if (!needle) return true
  return reply.title.toLowerCase().includes(needle) || reply.body.toLowerCase().includes(needle)
}

/** The rows the list draws: archived ones only when asked for, then the search. */
export function visibleCannedReplies(
  library: CannedReply[],
  options: { showArchived: boolean; search: string },
): CannedReply[] {
  const needle = options.search.trim().toLowerCase()
  return library.filter(
    (reply) => (options.showArchived || !reply.archived) && matches(reply, needle),
  )
}

export type CannedReplyEmptyState =
  /** There are rows to draw. */
  | { kind: 'none' }
  /** Nothing saved at all, archived or not. */
  | { kind: 'empty'; title: string; hint: string }
  /** Everything saved is archived, and archived rows are hidden. */
  | { kind: 'archived-hidden'; title: string; hint: string; archivedCount: number }
  /** The search matched nothing in what would otherwise be drawn. */
  | { kind: 'no-match'; title: string; hint: string }

/**
 * Which empty screen, if any. `organizationName` is the filter's, or null when
 * the list spans every organization.
 */
export function cannedReplyEmptyState(
  library: CannedReply[],
  options: { showArchived: boolean; search: string; organizationName: string | null },
): CannedReplyEmptyState {
  if (visibleCannedReplies(library, options).length > 0) return { kind: 'none' }

  const suffix = options.organizationName ? ` for ${options.organizationName}` : ''

  if (library.length === 0) {
    return {
      kind: 'empty',
      title: options.organizationName ? `No saved responses${suffix}` : 'No saved responses yet',
      hint: 'Write the answers your team sends most often, and agents can insert them with one tap.',
    }
  }

  const unarchived = library.filter((reply) => !reply.archived)
  if (!options.showArchived && unarchived.length === 0) {
    const archivedCount = library.length
    return {
      kind: 'archived-hidden',
      title: `No active saved responses${suffix}`,
      hint: `${
        archivedCount === 1 ? '1 archived response is' : `${archivedCount} archived responses are`
      } hidden. Agents can't insert archived responses until you restore them.`,
      archivedCount,
    }
  }

  return {
    kind: 'no-match',
    title: 'Nothing matches that search',
    hint: 'Try a word from the title or the text.',
  }
}

/**
 * A saved response spliced into the composer's draft, and where the caret goes.
 *
 * It replaces whatever is selected, or lands at the caret, the way the web
 * composer inserts one. Nothing is added around it: a response is the admin's
 * words exactly, and an Agent who wants a space or a line break before it has
 * the caret to put one. A draft whose caret this device never learned takes the
 * response at the end.
 */
export function insertCannedReply(
  draft: string,
  selection: { start: number; end: number } | null,
  body: string,
): { text: string; caret: number } {
  const clamp = (value: number) => Math.min(Math.max(value, 0), draft.length)
  const start = selection ? clamp(Math.min(selection.start, selection.end)) : draft.length
  const end = selection ? clamp(Math.max(selection.start, selection.end)) : draft.length
  return {
    text: draft.slice(0, start) + body + draft.slice(end),
    caret: start + body.length,
  }
}

/**
 * Most used first, then by title -- the order the API sends and the one a row
 * changed on this device has to rejoin. Never mutates `rows`.
 */
export function sortCannedReplies(rows: readonly CannedReply[]): CannedReply[] {
  return [...rows].sort(
    (a, b) =>
      b.useCount - a.useCount || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  )
}

/** "Used 3 times", "Used once", "Not used yet". */
export function usageLabel(count: number): string {
  if (count <= 0) return 'Not used yet'
  if (count === 1) return 'Used once'
  return `Used ${count} times`
}

/** A search typed into the picker, as the title of the response it is about to create. */
export function quickCreateTitle(search: string): string {
  return search.trim().slice(0, CANNED_REPLY_TITLE_MAX)
}

/**
 * The first thing wrong with a draft, or null. Checked on the trimmed values,
 * because that is what is sent and what the API measures. `organizationId` is
 * asked for only when `requiresOrganization`: a personal response has none, and
 * an edit never changes the organization it has.
 */
export function cannedReplyDraftProblem(draft: {
  organizationId: string | null
  title: string
  body: string
  requiresOrganization?: boolean
}): string | null {
  const title = draft.title.trim()
  const body = draft.body.trim()
  if ((draft.requiresOrganization ?? true) && !draft.organizationId) {
    return 'Pick the organization it belongs to.'
  }
  if (title === '') return 'Give it a title.'
  if (title.length > CANNED_REPLY_TITLE_MAX) {
    return `Keep the title to ${CANNED_REPLY_TITLE_MAX} characters.`
  }
  if (body === '') return 'Write the response text.'
  if (body.length > CANNED_REPLY_BODY_MAX) {
    return `Keep the response to ${CANNED_REPLY_BODY_MAX} characters.`
  }
  return null
}
