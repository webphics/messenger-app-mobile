import type { ConversationNote } from '@/lib/types'

/**
 * What an internal note offers and how it reads, decided once and table-tested.
 *
 * Who may edit or delete is the API's ruling, sent as the note's `access`
 * (root ADR 0015). Nothing here re-derives it: this only adds what the payload
 * makes plain, that a deleted note offers nothing and that a note about no
 * message has nothing to jump to.
 */

export type NoteActionsView = { jump: boolean; edit: boolean; delete: boolean }

const NO_NOTE_ACTIONS: NoteActionsView = { jump: false, edit: false, delete: false }

export function noteActions(note: ConversationNote): NoteActionsView {
  if (note.deletedAt) return NO_NOTE_ACTIONS
  return {
    jump: note.messageId !== null,
    edit: note.access.edit,
    delete: note.access.delete,
  }
}

/**
 * How a note's state is said: a live note, maybe edited, or a tombstone naming
 * who deleted it. Web's wording, including its fallback for a payload that
 * names nobody.
 */
export type NoteStatus =
  | { kind: 'live'; edited: boolean }
  | { kind: 'deleted'; summary: string }

export function noteStatus(note: ConversationNote): NoteStatus {
  if (note.deletedAt) {
    const by = note.deletedBy?.name ?? 'a staff member'
    return { kind: 'deleted', summary: `Note by ${note.author.name}, deleted by ${by}` }
  }
  return { kind: 'live', edited: note.editedAt !== null }
}

/**
 * Which note a control acts on, for its accessible name: the author and the
 * opening words, so two notes by one person are still told apart.
 */
export function noteSubject(note: ConversationNote): string {
  const words = note.text.replace(/\s+/g, ' ').trim()
  const excerpt = words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words
  return excerpt ? `note by ${note.author.name}, “${excerpt}”` : `note by ${note.author.name}`
}

/** The list with one note swapped for another of the same id. */
export function replaceNote(
  notes: readonly ConversationNote[],
  next: ConversationNote,
): ConversationNote[] {
  return notes.map((note) => (note.id === next.id ? next : note))
}

/**
 * The note as an edit leaves it, shown before the API answers. The answer
 * replaces it; a refusal puts the held copy back.
 */
export function withNoteEdited(
  note: ConversationNote,
  text: string,
  at: string,
): ConversationNote {
  return { ...note, text, editedAt: at }
}

/**
 * The tombstone a delete leaves, shown before the API answers. It offers
 * nothing, as the API's own tombstone does.
 */
export function withNoteDeleted(
  note: ConversationNote,
  by: { id: string; name: string } | null,
  at: string,
): ConversationNote {
  return { ...note, deletedAt: at, deletedBy: by, access: { edit: false, delete: false } }
}

/**
 * Refusals that mean the held list is out of date: the note was deleted or
 * removed by somebody else. The notes are read again rather than guessed at.
 */
export function refusalStalesNotes(code: string | undefined): boolean {
  return code === 'note_deleted' || code === 'note_not_found'
}
