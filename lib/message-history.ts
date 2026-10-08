import { isLocalId } from '@/lib/thread-state'
import type { Message, MessageHistory, MessageVersion } from '@/lib/types'

/**
 * Whether a message offers "Edit history": any edited message the server holds,
 * whoever sent it and whatever the thread allows. A message this device is still
 * carrying has no id the server would know, so there is no history to ask for.
 */
export function offersEditHistory(message: Pick<Message, 'id' | 'editedAt'>): boolean {
  return !isLocalId(message.id) && Boolean(message.editedAt)
}

export type MessageHistoryRow = MessageVersion & {
  label: 'Current version' | 'Original' | 'Earlier version'
}

/**
 * A message's history as the sheet draws it: newest first, so the wording in
 * the thread is the one at the top, each version labelled.
 *
 * The oldest version is "Original" only when the API recorded it. A message
 * edited before history was kept has lost what was first sent, and calling the
 * earliest wording this device was given the original would be a claim nobody
 * can back.
 */
export function messageHistoryRows(history: MessageHistory): MessageHistoryRow[] {
  const newestFirst = [...history.versions].reverse()
  return newestFirst.map((version, index) => ({
    ...version,
    label:
      index === 0
        ? 'Current version'
        : index === newestFirst.length - 1 && history.originalRecorded
          ? 'Original'
          : 'Earlier version',
  }))
}
