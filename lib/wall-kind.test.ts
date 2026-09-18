import { wallDeadline, wallKindIsNamed, wallKindLabel } from '@/lib/wall-kind'
import { wallPostKinds, type WallPost } from '@/lib/types'

const NOW = Date.parse('2026-09-19T00:00:00.000Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function post(endsAt: string | null): WallPost {
  return {
    id: 'post-1',
    author: { id: 'user-1', name: 'Ada' },
    organizationId: 'org-1',
    kind: 'promotion',
    title: null,
    endsAt,
    pinnedAt: null,
    body: null,
    attachments: [],
    link: null,
    reactions: [],
    score: 0,
    upvoteCount: 0,
    viewCount: 0,
    isBookmarked: false,
    editedAt: null,
    createdAt: '2026-09-18T00:00:00.000Z',
  }
}

describe('what a kind is called', () => {
  it('has a label for every kind the API can send', () => {
    for (const kind of wallPostKinds) {
      expect(wallKindLabel(kind)).not.toBe('')
    }
  })

  it('calls an ad Sponsored, which is what it is to a reader', () => {
    expect(wallKindLabel('ad')).toBe('Sponsored')
  })

  /**
   * `community` is the default and what every Post written before kinds existed
   * reads as, so labelling it would put a chip on most of the Wall that tells a
   * reader nothing.
   */
  it('names the four that are not somebody talking, and not the one that is', () => {
    expect(wallKindIsNamed('community')).toBe(false)
    for (const kind of ['promotion', 'giveaway', 'news', 'ad'] as const) {
      expect(wallKindIsNamed(kind)).toBe(true)
    }
  })
})

describe('how long an offer has left', () => {
  it('is nothing at all for a Post with no deadline', () => {
    expect(wallDeadline(post(null), NOW)).toEqual({ state: 'none' })
  })

  it('reads days and hours while there is more than a day', () => {
    expect(wallDeadline(post(new Date(NOW + 3 * DAY + 4 * HOUR).toISOString()), NOW)).toEqual({
      state: 'live',
      label: '3d 4h left',
    })
  })

  it('drops to a clock inside the last day, zero-padded so it cannot jitter', () => {
    expect(wallDeadline(post(new Date(NOW + 2 * HOUR + 5 * MINUTE).toISOString()), NOW)).toEqual({
      state: 'live',
      label: '02:05 left',
    })
  })

  it('says ended the moment the deadline arrives, not after it', () => {
    expect(wallDeadline(post(new Date(NOW).toISOString()), NOW)).toEqual({ state: 'ended' })
    expect(wallDeadline(post(new Date(NOW - 1).toISOString()), NOW)).toEqual({ state: 'ended' })
  })

  /**
   * An unreadable date is not a deadline. Drawing "Ended" for one would be a
   * claim about an offer this client merely failed to parse.
   */
  it('says nothing about a date it could not read', () => {
    expect(wallDeadline(post('not a date'), NOW)).toEqual({ state: 'none' })
    expect(wallDeadline(post(''), NOW)).toEqual({ state: 'none' })
  })
})
