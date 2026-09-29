import { planEviction, type StoredThread } from '@/lib/store-eviction'

function thread(overrides: Partial<StoredThread> = {}): StoredThread {
  return { conversationId: 'conv-1', activityAt: 1, messageCount: 1, ...overrides }
}

/** `count` threads, newest first, each holding `messageCount` Messages. */
function threads(count: number, messageCount = 1): StoredThread[] {
  return Array.from({ length: count }, (_unused, index) =>
    thread({
      conversationId: `conv-${String(index).padStart(3, '0')}`,
      // Descending, so the first one made is the most recently active.
      activityAt: count - index,
      messageCount,
    }),
  )
}

describe('planEviction', () => {
  it.each([
    ['exactly twenty threads, which is a ceiling rather than a line to stay under', threads(20)],
    ['exactly fifty Messages in each of them', threads(20, 50)],
  ])('discards nothing with %s', (_name, stored) => {
    expect(planEviction(stored)).toEqual({ drop: [], shorten: [] })
  })

  it('drops the twenty-first thread and keeps the twenty before it', () => {
    const plan = planEviction(threads(21))

    expect(plan.drop).toEqual(['conv-020'])
    expect(plan.shorten).toEqual([])
  })

  it('shortens a retained thread holding a fifty-first Message', () => {
    const plan = planEviction(threads(1, 51))

    expect(plan.shorten).toEqual(['conv-000'])
    expect(plan.drop).toEqual([])
  })

  /**
   * Ordered by when the conversation was last active, which is what the row
   * carries — not by when its Messages were written, which would make a thread
   * whose history was scrolled through today look newer than the thread the last
   * message actually arrived in.
   */
  it('ranks by conversation activity rather than by the order it was handed', () => {
    const stored = [
      thread({ conversationId: 'stale', activityAt: 100, messageCount: 1 }),
      thread({ conversationId: 'busy', activityAt: 300, messageCount: 1 }),
      thread({ conversationId: 'middling', activityAt: 200, messageCount: 1 }),
    ]

    expect(planEviction(stored, { keepThreads: 2 }).drop).toEqual(['stale'])
  })

  /**
   * The plan names threads to take Messages from and nothing else. There is no
   * shape in it that could remove a Conversation row, whatever its activity: a
   * partial list is a list that lies about which conversations exist.
   */
  it('never names a thread that holds no Messages, however stale it is', () => {
    const stored = [
      ...threads(20, 10),
      thread({ conversationId: 'emptied', activityAt: 0, messageCount: 0 }),
    ]

    const plan = planEviction(stored)

    expect(plan.drop).toEqual([])
    expect(plan.shorten).toEqual([])
  })

  /**
   * The thread whose write ran this is the thread on screen: memory is still
   * holding its Messages and is about to write them again, so taking them now
   * would be a write that undoes itself. It is collected by the next write of
   * some other thread, which is what a person navigating away does.
   */
  it('never names the thread the write it followed was for', () => {
    const stored = [...threads(20, 10), thread({ conversationId: 'open', activityAt: 0, messageCount: 900 })]

    const plan = planEviction(stored, { spare: 'open' })

    expect(plan.drop).toEqual([])
    expect(plan.shorten).toEqual([])
  })

  /** Spared from being chosen, not from being counted: it still holds a place. */
  it('counts the spared thread against the threads kept', () => {
    const stored = [...threads(20, 1), thread({ conversationId: 'zzz-open', activityAt: 999 })]

    const plan = planEviction(stored, { spare: 'zzz-open' })

    expect(plan.drop).toEqual(['conv-019'])
  })
})
