import { JUMP_MAX_PAGES, jumpStep } from '@/lib/thread-jump'
import type { ThreadRow } from '@/lib/thread-rows'
import type { Message } from '@/lib/types'

const message = { id: 'x' } as Message
const STANCE = { side: 'start', variant: 'incoming', isMine: false } as const

const ROWS: ThreadRow[] = [
  { type: 'message', id: 'm3', message, stance: STANCE, endsRun: true },
  { type: 'day', id: 'day-m2', label: 'Today' },
  { type: 'system', id: 'm2', message },
  { type: 'message', id: 'm1', message, stance: STANCE, endsRun: true },
]

const IDLE = { pagesLoaded: 0, loadingOlder: false, canLoadOlder: true }

describe('jumpStep', () => {
  test('scrolls to a message that is a row', () => {
    expect(jumpStep(ROWS, 'm1', IDLE)).toEqual({ kind: 'scroll', index: 3 })
  })

  test('a system notice or a day divider with that id is not the original', () => {
    expect(jumpStep(ROWS, 'm2', IDLE)).toEqual({ kind: 'load' })
    expect(jumpStep(ROWS, 'day-m2', IDLE)).toEqual({ kind: 'load' })
  })

  test('waits while a page is already loading', () => {
    expect(jumpStep(ROWS, 'old', { ...IDLE, loadingOlder: true })).toEqual({ kind: 'wait' })
  })

  test('gives up at the start of the thread', () => {
    expect(jumpStep(ROWS, 'old', { ...IDLE, canLoadOlder: false })).toEqual({ kind: 'give-up' })
  })

  test('gives up after walking back as far as it will', () => {
    expect(jumpStep(ROWS, 'old', { ...IDLE, pagesLoaded: JUMP_MAX_PAGES })).toEqual({
      kind: 'give-up',
    })
    expect(jumpStep(ROWS, 'old', { ...IDLE, pagesLoaded: JUMP_MAX_PAGES - 1 })).toEqual({
      kind: 'load',
    })
  })

  test('finds it the moment it arrives, however far it walked', () => {
    expect(jumpStep(ROWS, 'm1', { ...IDLE, pagesLoaded: JUMP_MAX_PAGES })).toEqual({
      kind: 'scroll',
      index: 3,
    })
  })
})
