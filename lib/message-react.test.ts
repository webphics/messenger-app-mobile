import { groupReactions, quotePreview, replyCaption, toggleReaction } from '@/lib/message-react'

describe('toggleReaction', () => {
  test('adds the first reaction', () => {
    expect(toggleReaction(undefined, '👍', 'u1')).toEqual([{ emoji: '👍', userId: 'u1' }])
  })

  test('joins an emoji someone else already used', () => {
    expect(toggleReaction([{ emoji: '👍', userId: 'u1' }], '👍', 'u2')).toEqual([
      { emoji: '👍', userId: 'u1' },
      { emoji: '👍', userId: 'u2' },
    ])
  })

  test('toggles off the same emoji', () => {
    expect(toggleReaction([{ emoji: '👍', userId: 'u1' }], '👍', 'u1')).toEqual([])
  })

  test('replaces a different emoji by the same person', () => {
    expect(
      toggleReaction(
        [
          { emoji: '👍', userId: 'u1' },
          { emoji: '👍', userId: 'u2' },
          { emoji: '❤️', userId: 'u3' },
        ],
        '❤️',
        'u1',
      ),
    ).toEqual([
      { emoji: '👍', userId: 'u2' },
      { emoji: '❤️', userId: 'u3' },
      { emoji: '❤️', userId: 'u1' },
    ])
  })
})

describe('groupReactions', () => {
  test('gathers one chip per emoji, in the order they first appeared', () => {
    expect(
      groupReactions([
        { emoji: '👍', userId: 'u1' },
        { emoji: '❤️', userId: 'u2' },
        { emoji: '👍', userId: 'u3' },
      ]),
    ).toEqual([
      { emoji: '👍', userIds: ['u1', 'u3'] },
      { emoji: '❤️', userIds: ['u2'] },
    ])
  })

  test('counts one person once, however many times the payload names them', () => {
    expect(
      groupReactions([
        { emoji: '👍', userId: 'u1' },
        { emoji: '👍', userId: 'u1' },
      ]),
    ).toEqual([{ emoji: '👍', userIds: ['u1'] }])
  })

  test('reads no reactions as no chips', () => {
    expect(groupReactions(undefined)).toEqual([])
  })
})

describe('replyCaption', () => {
  test('outgoing to someone else', () => {
    expect(
      replyCaption({ outgoing: true, quotedName: 'Evan', quotedIsMe: false }),
    ).toBe('You replied to Evan')
  })

  test('outgoing to yourself', () => {
    expect(
      replyCaption({ outgoing: true, quotedName: 'Me', quotedIsMe: true }),
    ).toBe('You replied to yourself')
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
