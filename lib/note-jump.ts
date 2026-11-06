/**
 * "Jump to message" from a note on Conversation details, handed to the thread.
 *
 * Details is pushed over the thread it describes, so the jump is a request left
 * for that thread and a step back to it. The thread is usually still mounted
 * underneath and hears it at once; one that mounts afterwards (details opened
 * with no thread behind it) takes it on mount. Either way it is taken once, and
 * only by the conversation it names. The scroll itself is the thread's existing
 * quote-jump (`jumpStep`), so a message that is not loaded is paged for and one
 * that has gone is said to have gone.
 */

export type NoteJump = { conversationId: string; messageId: string }

let pending: NoteJump | null = null
const listeners = new Set<() => void>()

export function requestNoteJump(jump: NoteJump): void {
  pending = jump
  for (const listener of listeners) listener()
}

/** The pending jump for this conversation, removed as it is read. */
export function takeNoteJump(conversationId: string): string | null {
  if (!pending || pending.conversationId !== conversationId) return null
  const { messageId } = pending
  pending = null
  return messageId
}

export function onNoteJump(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
