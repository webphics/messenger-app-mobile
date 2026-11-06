import {
  noteActions,
  noteStatus,
  noteSubject,
  refusalStalesNotes,
  replaceNote,
  withNoteDeleted,
  withNoteEdited,
} from '@/lib/note-view'
import type { ConversationNote } from '@/lib/types'

const note = (overrides: Partial<ConversationNote> = {}): ConversationNote => ({
  id: 'note-1',
  text: 'Asked for a refund twice',
  author: { id: 'agent-1', name: 'Rizwan Manzoor' },
  messageId: null,
  createdAt: '2026-11-06T04:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  deletedBy: null,
  access: { edit: false, delete: false },
  ...overrides,
})

const DELETED = { deletedAt: '2026-11-06T05:00:00.000Z' }

describe('noteActions', () => {
  test.each<[string, Partial<ConversationNote>, ReturnType<typeof noteActions>]>([
    ['no access, no message', {}, { jump: false, edit: false, delete: false }],
    ['about a message', { messageId: 'msg-1' }, { jump: true, edit: false, delete: false }],
    ['author: edit and delete', { access: { edit: true, delete: true } }, { jump: false, edit: true, delete: true }],
    ['delete_any_note: delete only', { access: { edit: false, delete: true } }, { jump: false, edit: false, delete: true }],
    [
      'deleted note offers nothing, whatever access says',
      { ...DELETED, messageId: 'msg-1', access: { edit: true, delete: true } },
      { jump: false, edit: false, delete: false },
    ],
  ])('%s', (_label, overrides, expected) => {
    expect(noteActions(note(overrides))).toEqual(expected)
  })
})

describe('noteStatus', () => {
  test.each<[string, Partial<ConversationNote>, ReturnType<typeof noteStatus>]>([
    ['live', {}, { kind: 'live', edited: false }],
    ['edited', { editedAt: '2026-11-06T04:30:00.000Z' }, { kind: 'live', edited: true }],
    [
      'deleted, naming who',
      { ...DELETED, deletedBy: { id: 'admin-1', name: 'Tajbin Khan' } },
      { kind: 'deleted', summary: 'Note by Rizwan Manzoor, deleted by Tajbin Khan' },
    ],
    [
      'deleted, nobody named',
      DELETED,
      { kind: 'deleted', summary: 'Note by Rizwan Manzoor, deleted by a staff member' },
    ],
  ])('%s', (_label, overrides, expected) => {
    expect(noteStatus(note(overrides))).toEqual(expected)
  })
})

describe('noteSubject', () => {
  test.each([
    ['short text', 'Asked for a refund twice', 'note by Rizwan Manzoor, “Asked for a refund twice”'],
    [
      'long text is cut at forty characters',
      'This customer has written in about the same order four times now',
      'note by Rizwan Manzoor, “This customer has written in about the s…”',
    ],
    ['whitespace collapses', 'line one\n\nline   two', 'note by Rizwan Manzoor, “line one line two”'],
    ['a tombstone with no text', '', 'note by Rizwan Manzoor'],
  ])('%s', (_label, text, expected) => {
    expect(noteSubject(note({ text }))).toBe(expected)
  })
})

describe('optimistic changes', () => {
  test('an edit changes the text and marks it edited, keeping everything else', () => {
    const before = note({ access: { edit: true, delete: true } })
    expect(withNoteEdited(before, 'New words', '2026-11-06T06:00:00.000Z')).toEqual({
      ...before,
      text: 'New words',
      editedAt: '2026-11-06T06:00:00.000Z',
    })
  })

  test('a delete leaves a tombstone naming the viewer and offering nothing', () => {
    const after = withNoteDeleted(
      note({ access: { edit: true, delete: true } }),
      { id: 'admin-1', name: 'Tajbin Khan' },
      '2026-11-06T06:00:00.000Z',
    )
    expect(noteActions(after)).toEqual({ jump: false, edit: false, delete: false })
    expect(noteStatus(after)).toEqual({
      kind: 'deleted',
      summary: 'Note by Rizwan Manzoor, deleted by Tajbin Khan',
    })
  })

  test('replaceNote swaps only the note with the same id, in place', () => {
    const list = [note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c' })]
    const next = note({ id: 'b', text: 'changed' })
    expect(replaceNote(list, next).map((n) => [n.id, n.text])).toEqual([
      ['a', 'Asked for a refund twice'],
      ['b', 'changed'],
      ['c', 'Asked for a refund twice'],
    ])
  })
})

describe('refusalStalesNotes', () => {
  test.each([
    ['note_deleted', true],
    ['note_not_found', true],
    ['forbidden', false],
    [undefined, false],
  ])('%s → %s', (code, expected) => {
    expect(refusalStalesNotes(code)).toBe(expected)
  })
})
