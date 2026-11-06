import { onNoteJump, requestNoteJump, takeNoteJump } from '@/lib/note-jump'

describe('note jump', () => {
  afterEach(() => {
    takeNoteJump('conv-1')
    takeNoteJump('conv-2')
  })

  test('is taken once, by the conversation it names', () => {
    requestNoteJump({ conversationId: 'conv-1', messageId: 'msg-1' })
    expect(takeNoteJump('conv-2')).toBeNull()
    expect(takeNoteJump('conv-1')).toBe('msg-1')
    expect(takeNoteJump('conv-1')).toBeNull()
  })

  test('the latest request wins', () => {
    requestNoteJump({ conversationId: 'conv-1', messageId: 'msg-1' })
    requestNoteJump({ conversationId: 'conv-1', messageId: 'msg-2' })
    expect(takeNoteJump('conv-1')).toBe('msg-2')
  })

  test('tells a mounted thread, and stops once unsubscribed', () => {
    const heard = jest.fn()
    const off = onNoteJump(heard)
    requestNoteJump({ conversationId: 'conv-1', messageId: 'msg-1' })
    off()
    requestNoteJump({ conversationId: 'conv-1', messageId: 'msg-2' })
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
