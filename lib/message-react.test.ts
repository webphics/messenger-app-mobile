import { groupReactions, toggleReaction } from '@/lib/message-react'

describe('toggleReaction', () => {
  test('toggles off the same emoji', () => {
    expect(toggleReaction([{ emoji: '👍', userId: 'u1' }], '👍', 'u1')).toEqual([])
  })

  test('replaces a different emoji by the same person', () => {
    expect(
      toggleReaction(
        [
          { emoji: '👍', userId: 'u1' },
          { emoji: '❤️', userId: 'u3' },
        ],
        '❤️',
        'u1',
      ),
    ).toEqual([
      { emoji: '❤️', userId: 'u3' },
      { emoji: '❤️', userId: 'u1' },
    ])
  })
})

test('groupReactions counts one person once, however many times the payload names them', () => {
  expect(
    groupReactions([
      { emoji: '👍', userId: 'u1' },
      { emoji: '👍', userId: 'u1' },
    ]),
  ).toEqual([{ emoji: '👍', userIds: ['u1'] }])
})
