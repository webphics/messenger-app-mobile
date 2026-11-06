import { useCallback, useEffect, useRef, useState } from 'react'

import { refusalSentence } from '@/lib/api-result'
import {
  attachLabel,
  createNote,
  deleteNote as deleteNoteRequest,
  detachLabel,
  listLabels,
  listNotes,
  updateNote,
} from '@/lib/conversation-api'
import {
  refusalStalesNotes,
  replaceNote,
  withNoteDeleted,
  withNoteEdited,
} from '@/lib/note-view'
import { getSessionUser } from '@/lib/session'
import type { Conversation, ConversationNote, Label } from '@/lib/types'
import { useConversationWriteRefused } from '@/lib/use-conversation-write-refused'

/**
 * What a thread carries besides its messages: the labels on it, and the notes
 * staff have written about it.
 *
 * Two fetches and five mutations (attach, detach, and add, edit or delete a
 * note), held together because they are one screen and
 * share its lifetime. Which of them are *allowed* is not decided here. The API
 * says so on the conversation's `access.actions`, `detailsView` in
 * `lib/conversation-access` reads it, and the caller passes the answer in as
 * `wantsLabels` (`manageLabels`) and `wantsNotes` (`readNotes`). A hook that
 * asked anyway would turn a rule the API states plainly into a 403 on screen.
 *
 * A label change answers with the whole conversation, which goes into the shared
 * list through `onUpdated` — so the chip appears here and the inbox row behind
 * gains it in the same update, exactly as an Engage does.
 *
 * A refused label change or note goes to `useConversationWriteRefused`, which
 * fetches the conversation again when the refusal says this copy is stale (a
 * revoked label Capability arrives as `missing_capability`), so the controls
 * this screen drew from the old `access` go away.
 */

export type NotesState =
  /** The API offers this viewer no notes here (`readNotes` off). */
  | { status: 'unavailable' }
  | { status: 'loading' }
  /**
   * Distinct from an empty list, and deliberately: "No notes yet" is a claim
   * about the conversation, and making it while the fetch has failed tells an
   * Agent there is nothing to read on a thread that may have several notes on
   * it — which is exactly when they most need to know they are not seeing
   * everything.
   */
  | { status: 'failed' }
  | { status: 'ready'; notes: ConversationNote[] }

/**
 * The organization's labels, and whether they arrived.
 *
 * Three answers rather than a list, for the reason `NotesState` has three: a
 * failed fetch leaves nothing to offer, and an Add control that simply does not
 * appear is indistinguishable from an organization that has defined no labels.
 * One of those is worth a retry and the other is not.
 */
export type LabelsState =
  /** The API offers this viewer no label editing here (`manageLabels` off). */
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'failed' }
  /** Every label in the organization, archived ones included. */
  | { status: 'ready'; labels: Label[] }

export type ConversationDetails = {
  /**
   * Which of them are worth *offering* on this thread is `offerableLabels`,
   * which needs the conversation and so belongs where the conversation is.
   */
  labels: LabelsState
  reloadLabels: () => void
  /** The label id with a request out for it, so its chip can say it is working. */
  labelBusy: string | null
  labelError: string | null
  attach: (labelId: string) => void
  detach: (labelId: string) => void
  notes: NotesState
  reloadNotes: () => void
  addNote: (text: string) => void
  addingNote: boolean
  noteError: string | null
  /**
   * Rewrite a note, shown at once and put back if the API refuses. Answers the
   * refusal to show, or null when it landed.
   */
  editNote: (noteId: string, text: string) => Promise<string | null>
  /**
   * Delete a note, leaving its tombstone at once and restoring the note if the
   * API refuses. Answers the refusal to show, or null when it landed.
   */
  deleteNote: (noteId: string) => Promise<string | null>
}

export function useConversationDetails({
  conversationId,
  wantsLabels,
  wantsNotes,
  onUpdated,
}: {
  conversationId: string | null
  wantsLabels: boolean
  wantsNotes: boolean
  onUpdated: (conversation: Conversation) => void
}): ConversationDetails {
  const [labels, setLabels] = useState<LabelsState>({ status: 'unavailable' })
  const [labelBusy, setLabelBusy] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [notes, setNotes] = useState<NotesState>({ status: 'unavailable' })
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const writeRefused = useConversationWriteRefused()

  /**
   * Which thread the answers coming back belong to. A screen left before its
   * notes arrive must not have them appear on the next one.
   */
  const onScreen = useRef<string | null>(conversationId)

  /** Held so the callbacks can read it without being rebuilt by every render. */
  const notify = useRef(onUpdated)
  useEffect(() => {
    notify.current = onUpdated
  }, [onUpdated])

  useEffect(() => {
    onScreen.current = conversationId
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
    setLabelBusy(null)
    setLabelError(null)
    setNoteError(null)
    return () => {
      onScreen.current = null
    }
  }, [conversationId])

  const loadLabels = useCallback(() => {
    setLabels({ status: 'loading' })
    void (async () => {
      const result = await listLabels()
      setLabels(
        result.ok ? { status: 'ready', labels: result.value } : { status: 'failed' },
      )
    })()
  }, [])

  useEffect(() => {
    if (!wantsLabels) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
      setLabels({ status: 'unavailable' })
      return
    }
    loadLabels()
  }, [wantsLabels, loadLabels])

  const reloadLabels = useCallback(() => {
    if (wantsLabels) loadLabels()
  }, [wantsLabels, loadLabels])

  const loadNotes = useCallback(
    (id: string) => {
      setNotes({ status: 'loading' })
      void (async () => {
        const result = await listNotes(id)
        if (onScreen.current !== id) return
        setNotes(result.ok ? { status: 'ready', notes: result.value } : { status: 'failed' })
      })()
    },
    [],
  )

  useEffect(() => {
    if (!conversationId || !wantsNotes) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- state is reset for a new key here, ahead of the read it starts; a generation guard drops late answers. Moving it out of the effect would change when the reset renders.
      setNotes({ status: 'unavailable' })
      return
    }
    loadNotes(conversationId)
  }, [conversationId, wantsNotes, loadNotes])

  const reloadNotes = useCallback(() => {
    if (conversationId && wantsNotes) loadNotes(conversationId)
  }, [conversationId, wantsNotes, loadNotes])

  const changeLabel = useCallback(
    (labelId: string, change: 'attach' | 'detach') => {
      const id = conversationId
      if (!id || labelBusy) return

      setLabelBusy(labelId)
      setLabelError(null)

      void (async () => {
        const result =
          change === 'attach'
            ? await attachLabel(id, labelId)
            : await detachLabel(id, labelId)

        if (!result.ok) void writeRefused(id, result.failure)
        if (onScreen.current !== id) return
        setLabelBusy(null)
        if (result.ok) {
          notify.current(result.value)
          return
        }
        setLabelError(
          refusalSentence(
            result.failure,
            change === 'attach' ? 'The label could not be added.' : 'The label could not be removed.',
          ),
        )
      })()
    },
    [conversationId, labelBusy, writeRefused],
  )

  const attach = useCallback(
    (labelId: string) => changeLabel(labelId, 'attach'),
    [changeLabel],
  )
  const detach = useCallback(
    (labelId: string) => changeLabel(labelId, 'detach'),
    [changeLabel],
  )

  /**
   * Write a note.
   *
   * Appended to what is held rather than refetched: the API answers with the
   * note it stored, and a second round trip to learn what this client already
   * has would only make the note appear later than it needs to.
   */
  const addNote = useCallback(
    (text: string) => {
      const id = conversationId
      const trimmed = text.trim()
      if (!id || trimmed === '' || addingNote) return

      setAddingNote(true)
      setNoteError(null)

      void (async () => {
        const result = await createNote(id, trimmed)
        if (!result.ok) void writeRefused(id, result.failure)
        if (onScreen.current !== id) return
        setAddingNote(false)

        if (!result.ok) {
          setNoteError(refusalSentence(result.failure, 'The note could not be saved.'))
          return
        }
        setNotes((held) =>
          held.status === 'ready'
            ? { status: 'ready', notes: [...held.notes, result.value] }
            : { status: 'ready', notes: [result.value] },
        )
      })()
    },
    [addingNote, conversationId, writeRefused],
  )

  /** The ready list as it stands, read by the two writes below for their rollback copy. */
  const heldNotes = useRef<NotesState>(notes)
  useEffect(() => {
    heldNotes.current = notes
  }, [notes])

  /**
   * One edit or delete: the change on screen first, then the request, then the
   * API's own copy of the note, or the held copy back with the reason.
   * A refusal that says the list is out of date (`note_deleted`,
   * `note_not_found`) reads the notes again; one that says the conversation
   * copy is stale goes to `useConversationWriteRefused`, as every write does.
   */
  const changeNote = useCallback(
    async (
      noteId: string,
      optimistic: (note: ConversationNote) => ConversationNote,
      request: (id: string) => ReturnType<typeof updateNote>,
      fallback: string,
    ): Promise<string | null> => {
      const id = conversationId
      const held = heldNotes.current
      if (!id || held.status !== 'ready') return fallback
      const before = held.notes.find((note) => note.id === noteId)
      if (!before) return fallback

      setNotes((current) =>
        current.status === 'ready'
          ? { status: 'ready', notes: replaceNote(current.notes, optimistic(before)) }
          : current,
      )

      const result = await request(id)
      if (!result.ok) void writeRefused(id, result.failure)
      if (onScreen.current !== id) return null

      if (result.ok) {
        setNotes((current) =>
          current.status === 'ready'
            ? { status: 'ready', notes: replaceNote(current.notes, result.value) }
            : current,
        )
        return null
      }

      setNotes((current) =>
        current.status === 'ready'
          ? { status: 'ready', notes: replaceNote(current.notes, before) }
          : current,
      )
      if (result.failure.kind === 'refused' && refusalStalesNotes(result.failure.code)) {
        loadNotes(id)
      }
      return refusalSentence(result.failure, fallback) ?? fallback
    },
    [conversationId, loadNotes, writeRefused],
  )

  const editNote = useCallback(
    (noteId: string, text: string) => {
      const trimmed = text.trim()
      return changeNote(
        noteId,
        (note) => withNoteEdited(note, trimmed, new Date().toISOString()),
        (id) => updateNote(id, noteId, trimmed),
        'The note could not be changed.',
      )
    },
    [changeNote],
  )

  const deleteNote = useCallback(
    (noteId: string) => {
      const viewer = getSessionUser()
      return changeNote(
        noteId,
        (note) =>
          withNoteDeleted(
            note,
            viewer ? { id: viewer.id, name: viewer.name } : null,
            new Date().toISOString(),
          ),
        (id) => deleteNoteRequest(id, noteId),
        'The note could not be deleted.',
      )
    },
    [changeNote],
  )

  return {
    labels,
    reloadLabels,
    labelBusy,
    labelError,
    attach,
    detach,
    notes,
    reloadNotes,
    addNote,
    addingNote,
    noteError,
    editNote,
    deleteNote,
  }
}
