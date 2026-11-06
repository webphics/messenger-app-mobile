import {
  deleteConfirmationText,
  deleteRefusalMeansGone,
  deletionSnapshot,
  messageDeleteRefusal,
  withRestoredMessage,
} from '@/lib/message-delete'
import { emptyThread, withoutMessages, type ThreadState } from '@/lib/thread-state'
import type { StaffMessage } from '@/lib/types'

/**
 * A delete from this phone: the snapshot read before the removal, the removal
 * `message.deleted` already uses, and the restore a refusal runs.
 */

function message(id: string, createdAt: string, overrides: Partial<StaffMessage> = {}): StaffMessage {
  return {
    id,
    body: id,
    messageType: 'text',
    createdAt,
    editedAt: null,
    editableUntil: null,
    replyTo: null,
    reactions: [],
    attachments: [],
    receiptStatus: 'sent',
    sender: { id: 'agent-1', name: 'Jonah Reed', role: 'agent' },
    ...overrides,
  }
}

const QUOTE = { id: 'm1', preview: 'm1' }

function thread(): ThreadState {
  return {
    ...emptyThread(),
    messages: [
      message('m1', '2026-11-06T10:00:00.000Z'),
      message('m2', '2026-11-06T10:01:00.000Z', { replyTo: QUOTE }),
      message('m3', '2026-11-06T10:02:00.000Z'),
    ],
  }
}

describe('deletionSnapshot', () => {
  test('holds the message and every quote of it', () => {
    const snapshot = deletionSnapshot(thread(), 'm1')
    expect(snapshot?.message.id).toBe('m1')
    expect([...(snapshot?.quotes ?? new Map()).entries()]).toEqual([['m2', QUOTE]])
  })

  test('is null for a message the thread does not hold', () => {
    expect(deletionSnapshot(thread(), 'gone')).toBeNull()
  })
})

describe('withRestoredMessage', () => {
  test('a refused delete puts the message and its quote back where they were', () => {
    const before = thread()
    const snapshot = deletionSnapshot(before, 'm1')!
    const removed = withoutMessages(before, ['m1'])

    expect(removed.messages.map((item) => item.id)).toEqual(['m2', 'm3'])
    expect(removed.messages[0].replyTo).toBeNull()
    expect(withRestoredMessage(removed, snapshot).messages).toEqual(before.messages)
  })

  test('keeps what landed on a reply while the request was out', () => {
    const before = thread()
    const snapshot = deletionSnapshot(before, 'm1')!
    const removed = withoutMessages(before, ['m1'])
    const reacted: ThreadState = {
      ...removed,
      messages: removed.messages.map((item) =>
        item.id === 'm2' ? { ...item, receiptStatus: 'read' as const } : item,
      ),
    }

    const restored = withRestoredMessage(reacted, snapshot)
    expect(restored.messages.find((item) => item.id === 'm2')).toMatchObject({
      receiptStatus: 'read',
      replyTo: QUOTE,
    })
  })

  test('answers the same state when a page already brought everything back', () => {
    const before = thread()
    const snapshot = deletionSnapshot(before, 'm1')!
    expect(withRestoredMessage(before, snapshot)).toBe(before)
  })

  test('does not overwrite a newer copy a page put back first', () => {
    const before = thread()
    const snapshot = deletionSnapshot(before, 'm1')!
    const newer = message('m1', '2026-11-06T10:00:00.000Z', { body: 'edited' })
    const paged: ThreadState = {
      ...before,
      messages: [newer, ...withoutMessages(before, ['m1']).messages],
    }

    const restored = withRestoredMessage(paged, snapshot)
    expect(restored.messages.find((item) => item.id === 'm1')?.body).toBe('edited')
    expect(restored.messages.find((item) => item.id === 'm2')?.replyTo).toEqual(QUOTE)
  })
})

describe('deleteRefusalMeansGone', () => {
  test.each([
    ['message_not_found', true],
    ['message_not_deletable', false],
    ['forbidden', false],
  ])('a refusal with %s means the message is already gone: %s', (code, gone) => {
    expect(deleteRefusalMeansGone({ kind: 'refused', message: 'Refused.', code })).toBe(gone)
  })

  test('a failure that never reached the API says nothing about the message', () => {
    expect(deleteRefusalMeansGone({ kind: 'unreachable' })).toBe(false)
  })
})

describe('messageDeleteRefusal', () => {
  test.each([
    [{ kind: 'refused' as const, message: 'System notices cannot be deleted.', code: 'message_not_deletable' }, 'System notices cannot be deleted.'],
    [{ kind: 'unreachable' as const }, 'No connection. The message was not deleted.'],
    [{ kind: 'unauthorised' as const }, 'Sign in again to delete this message.'],
    [{ kind: 'malformed' as const }, 'Something went wrong. The message may not have been deleted.'],
  ])('%o reads as %s', (failure, sentence) => {
    expect(messageDeleteRefusal(failure)).toBe(sentence)
  })
})

describe('deleteConfirmationText', () => {
  test.each([
    ['a text message', [], 'This message will be deleted for everyone in this conversation. This can’t be undone.'],
    [
      'a message with attachments',
      [{ id: 'a1', url: 'https://example.test/a.jpg', mimeType: 'image/jpeg', name: 'a.jpg', size: 1 }],
      'This message and its attachments will be deleted for everyone in this conversation. This can’t be undone.',
    ],
  ])('%s', (_, attachments, sentence) => {
    expect(deleteConfirmationText({ attachments } as never)).toBe(sentence)
  })
})
