import { parseTypingUpdated } from '@/lib/realtime-events'
import {
  TYPING_HEARTBEAT_MS,
  distinctTypists,
  sameTypists,
  shouldSendTypingStart,
  typingLabel,
} from '@/lib/typing'

const CONVERSATION = '6f74c64f-445b-40fd-b264-e2adcbd77619'
const ANA = { id: 'u-ana', name: 'Ana' }
const BEN = { id: 'u-ben', name: 'Ben' }
const CAL = { id: 'u-cal', name: 'Cal' }

describe('parseTypingUpdated', () => {
  test('reads the payload the API sends a Customer in a Support DM', () => {
    expect(
      parseTypingUpdated({
        conversationId: CONVERSATION,
        typists: [{ id: CONVERSATION, name: 'Support' }],
      }),
    ).toEqual({ conversationId: CONVERSATION, typists: [{ id: CONVERSATION, name: 'Support' }] })
  })

  test('an empty list is a stop, not a malformed payload', () => {
    expect(parseTypingUpdated({ conversationId: CONVERSATION, typists: [] })).toEqual({
      conversationId: CONVERSATION,
      typists: [],
    })
  })

  test('drops an unreadable entry and keeps the rest', () => {
    expect(
      parseTypingUpdated({ conversationId: CONVERSATION, typists: [ANA, { id: 3 }, null] }),
    ).toEqual({ conversationId: CONVERSATION, typists: [ANA] })
  })

  test.each([
    ['no payload', null],
    ['no conversation', { typists: [] }],
    ['an empty conversation id', { conversationId: '', typists: [] }],
    ['no list', { conversationId: CONVERSATION }],
  ])('answers null for %s', (_, payload) => {
    expect(parseTypingUpdated(payload)).toBeNull()
  })
})

describe('shouldSendTypingStart', () => {
  test('the first keystroke always goes', () => {
    expect(shouldSendTypingStart(0, 1_000)).toBe(true)
  })

  test('keystrokes inside the heartbeat are held back', () => {
    expect(shouldSendTypingStart(10_000, 10_000 + TYPING_HEARTBEAT_MS - 1)).toBe(false)
  })

  test('a keystroke once the heartbeat has passed goes again', () => {
    expect(shouldSendTypingStart(10_000, 10_000 + TYPING_HEARTBEAT_MS)).toBe(true)
  })
})

describe('typingLabel', () => {
  test('a one-to-one thread is the dots alone', () => {
    expect(typingLabel([ANA], false)).toBeNull()
  })

  test('nobody typing says nothing', () => {
    expect(typingLabel([], true)).toBeNull()
  })

  test.each([
    [[ANA], 'Ana is typing'],
    [[ANA, BEN], 'Ana and Ben are typing'],
    [[ANA, BEN, CAL], 'Ana and 2 others are typing'],
  ])('a Group names who', (typists, label) => {
    expect(typingLabel(typists, true)).toBe(label)
  })

  test('two staff behind one company persona read as one', () => {
    const acme = { id: 'org-acme', name: 'Acme' }
    expect(typingLabel([acme, acme], true)).toBe('Acme is typing')
    expect(distinctTypists([acme, acme, ANA])).toEqual([acme, ANA])
  })
})

describe('sameTypists', () => {
  test('equal lists in the same order are the same', () => {
    expect(sameTypists([ANA, BEN], [{ ...ANA }, { ...BEN }])).toBe(true)
  })

  test('a renamed or reordered list is not', () => {
    expect(sameTypists([ANA], [{ ...ANA, name: 'Anna' }])).toBe(false)
    expect(sameTypists([ANA, BEN], [BEN, ANA])).toBe(false)
  })
})
