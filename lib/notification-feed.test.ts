import {
  notificationDestination,
  notificationSections,
  unreadBadgeLabel,
  withAllRead,
  withArrived,
  withOlderPage,
  withRead,
  type DestinationContext,
} from '@/lib/notification-feed'
import type { AppNotification } from '@/lib/types'

function row(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'ntf_1',
    kind: 'message',
    title: 'Dana',
    body: 'Hello',
    conversationId: null,
    broadcastId: null,
    wallPostId: null,
    readAt: null,
    createdAt: '2026-10-11T09:00:00.000Z',
    ...overrides,
  }
}

const CUSTOMER: DestinationContext = { role: 'customer', announcementsId: null, opensBroadcasts: false }
const ADMIN: DestinationContext = { role: 'admin', announcementsId: null, opensBroadcasts: true }

describe('notificationDestination', () => {
  test('a message opens the thread it names', () => {
    expect(notificationDestination(row({ conversationId: 'cnv_1' }), CUSTOMER)).toEqual({
      kind: 'thread',
      conversationId: 'cnv_1',
    })
  })

  test('a kind this build has not been taught opens the thread it names, or nothing', () => {
    expect(
      notificationDestination(row({ kind: 'something_new', conversationId: 'cnv_9' }), CUSTOMER),
    ).toEqual({ kind: 'thread', conversationId: 'cnv_9' })
    expect(notificationDestination(row({ kind: 'something_new' }), CUSTOMER)).toBeNull()
  })

  test('a declined join request names nothing and goes nowhere', () => {
    expect(notificationDestination(row({ kind: 'group_join_request_declined' }), CUSTOMER)).toBeNull()
  })

  test('a broadcast opens the announcements thread when there is one', () => {
    expect(
      notificationDestination(row({ kind: 'broadcast', broadcastId: 'brd_1' }), {
        ...CUSTOMER,
        announcementsId: 'cnv_ann',
      }),
    ).toEqual({ kind: 'thread', conversationId: 'cnv_ann' })
  })

  test('a broadcast with no announcements thread is the Broadcasts screen for an Admin, or the inbox', () => {
    const broadcast = row({ kind: 'broadcast' })
    expect(notificationDestination(broadcast, ADMIN)).toEqual({ kind: 'broadcasts' })
    expect(notificationDestination(broadcast, { ...ADMIN, opensBroadcasts: false })).toEqual({
      kind: 'route',
      route: { screen: 'conversations' },
    })
    expect(notificationDestination(broadcast, CUSTOMER)).toEqual({
      kind: 'route',
      route: { screen: 'conversations' },
    })
  })

  test('a Post and a reaction on one open the Post', () => {
    for (const kind of ['wall_post', 'wall_post_reaction']) {
      expect(notificationDestination(row({ kind, wallPostId: 'pst_1' }), CUSTOMER)).toEqual({
        kind: 'route',
        route: { screen: 'wall-post', postId: 'pst_1' },
      })
      expect(notificationDestination(row({ kind }), CUSTOMER)).toBeNull()
    }
  })

  test('an invitation opens the General Support it names, or Settings', () => {
    const kind = 'organization_invitation'
    expect(notificationDestination(row({ kind, conversationId: 'cnv_gs' }), CUSTOMER)).toEqual({
      kind: 'thread',
      conversationId: 'cnv_gs',
    })
    expect(notificationDestination(row({ kind }), ADMIN)).toEqual({
      kind: 'route',
      route: { screen: 'invitations' },
    })
  })

  test('a new Customer opens their General Support, or the inbox', () => {
    const kind = 'customer_registered'
    expect(notificationDestination(row({ kind, conversationId: 'cnv_gs' }), ADMIN)).toEqual({
      kind: 'thread',
      conversationId: 'cnv_gs',
    })
    expect(notificationDestination(row({ kind }), ADMIN)).toEqual({
      kind: 'route',
      route: { screen: 'conversations' },
    })
  })

  test('a report opens the Admin’s review queue', () => {
    expect(notificationDestination(row({ kind: 'content_reported' }), ADMIN)).toEqual({
      kind: 'route',
      route: { screen: 'reports' },
    })
  })

  test('a Customer joining an organization opens the inbox', () => {
    expect(notificationDestination(row({ kind: 'customer_joined_organization' }), ADMIN)).toEqual({
      kind: 'route',
      route: { screen: 'conversations' },
    })
  })
})

describe('notificationSections', () => {
  // Local noon, so the test reads the same in every zone it runs in.
  const now = new Date(2026, 9, 11, 12).getTime()
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

  test('splits by the reader’s calendar day and keeps the order given', () => {
    const sections = notificationSections(
      [
        row({ id: 'a', createdAt: at(11, 11) }),
        row({ id: 'b', createdAt: at(11, 0) }),
        row({ id: 'c', createdAt: at(10, 23) }),
        row({ id: 'd', createdAt: at(2, 9) }),
      ],
      now,
    )
    expect(sections.map((section) => [section.title, section.data.map((n) => n.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Earlier', ['d']],
    ])
  })

  test('draws no heading over an empty bucket', () => {
    expect(notificationSections([row({ createdAt: at(1, 9) })], now).map((s) => s.key)).toEqual([
      'earlier',
    ])
    expect(notificationSections([], now)).toEqual([])
  })
})

describe('folding into the held feed', () => {
  test('an older page goes after, without repeating a row', () => {
    const held = [row({ id: 'a' }), row({ id: 'b' })]
    expect(withOlderPage(held, [row({ id: 'b' }), row({ id: 'c' })]).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  test('an arrival goes on top, and one already held is replaced in place', () => {
    const held = [row({ id: 'a' }), row({ id: 'b' })]
    expect(withArrived(held, row({ id: 'z' })).map((n) => n.id)).toEqual(['z', 'a', 'b'])

    const replaced = withArrived(held, row({ id: 'b', title: 'Edited' }))
    expect(replaced.map((n) => n.id)).toEqual(['a', 'b'])
    expect(replaced[1].title).toBe('Edited')
  })

  test('a read flips only unread rows it names, and keeps the list when nothing changed', () => {
    const earlier = '2026-10-10T08:00:00.000Z'
    const held = [row({ id: 'a' }), row({ id: 'b', readAt: earlier }), row({ id: 'c' })]
    const next = withRead(held, ['a', 'b'], '2026-10-11T10:00:00.000Z')
    expect(next.map((n) => n.readAt)).toEqual(['2026-10-11T10:00:00.000Z', earlier, null])

    expect(withRead(held, ['b', 'missing'], 'now')).toBe(held)
  })

  test('reading everything leaves nothing unread', () => {
    const next = withAllRead([row({ id: 'a' }), row({ id: 'b' })], 'now')
    expect(next.every((n) => n.readAt !== null)).toBe(true)
  })
})

describe('unreadBadgeLabel', () => {
  test('nothing at zero, the count up to ninety-nine, then 99+', () => {
    expect(unreadBadgeLabel(0)).toBeNull()
    expect(unreadBadgeLabel(-1)).toBeNull()
    expect(unreadBadgeLabel(7)).toBe('7')
    expect(unreadBadgeLabel(99)).toBe('99')
    expect(unreadBadgeLabel(100)).toBe('99+')
  })
})
