import { quotePreview, replyCaption, toggleReaction } from '@/lib/message-react'

describe('toggleReaction', () => {
  test('adds the first reaction', () => {
    expect(toggleReaction(undefined, '👍', 'u1')).toEqual([{ emoji: '👍', userIds: ['u1'] }])
  })

  test('joins an existing emoji', () => {
    expect(toggleReaction([{ emoji: '👍', userIds: ['u1'] }], '👍', 'u2')).toEqual([
      { emoji: '👍', userIds: ['u1', 'u2'] },
    ])
  })

  test('toggles off the same emoji', () => {
    expect(toggleReaction([{ emoji: '👍', userIds: ['u1'] }], '👍', 'u1')).toEqual([])
  })

  test('replaces a different emoji for the same user', () => {
    expect(
      toggleReaction(
        [
          { emoji: '👍', userIds: ['u1', 'u2'] },
          { emoji: '❤️', userIds: ['u3'] },
        ],
        '❤️',
        'u1',
      ),
    ).toEqual([
      { emoji: '👍', userIds: ['u2'] },
      { emoji: '❤️', userIds: ['u3', 'u1'] },
    ])
  })
})

describe('replyCaption', () => {
  test('outgoing to someone else', () => {
    expect(
      replyCaption({ outgoing: true, quotedName: 'Evan', quotedIsMe: false }),
    ).toBe('You replied to Evan')
  })

  test('incoming reply to you', () => {
    expect(
      replyCaption({
        outgoing: false,
        senderName: 'Amina Okonkwo',
        quotedName: 'Luis',
        quotedIsMe: true,
      }),
    ).toBe('Amina Okonkwo replied to you')
  })
})

describe('quotePreview', () => {
  test('keeps short bodies', () => {
    expect(quotePreview('Got it')).toBe('Got it')
  })

  test('truncates long bodies', () => {
    const long = 'a'.repeat(90)
    const preview = quotePreview(long, 72)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBe(73)
  })
})
