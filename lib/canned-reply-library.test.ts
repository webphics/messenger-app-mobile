import {
  CANNED_REPLY_BODY_MAX,
  CANNED_REPLY_TITLE_MAX,
  cannedReplyDraftProblem,
  cannedReplyEmptyState,
  insertCannedReply,
  quickCreateTitle,
  sortCannedReplies,
  usageLabel,
  visibleCannedReplies,
} from '@/lib/canned-reply-library'
import type { CannedReply } from '@/lib/types'

function reply(over: Partial<CannedReply> = {}): CannedReply {
  return {
    id: 'r1',
    scope: 'organization',
    organizationId: 'org1',
    owner: null,
    title: 'Refund policy',
    body: 'Refunds are available within 30 days.',
    useCount: 0,
    archived: false,
    ...over,
  }
}

const active = reply({ id: 'a', title: 'Opening hours', body: 'We are open 9 to 5.' })
const archived = reply({ id: 'b', title: 'Old promo', body: 'Half price this week.', archived: true })

describe('visibleCannedReplies', () => {
  it('hides archived rows unless asked for', () => {
    expect(visibleCannedReplies([active, archived], { showArchived: false, search: '' })).toEqual([
      active,
    ])
    expect(visibleCannedReplies([active, archived], { showArchived: true, search: '' })).toEqual([
      active,
      archived,
    ])
  })

  it('searches the title and the body, ignoring case and outer spaces', () => {
    const options = { showArchived: true, search: '  PROMO ' }
    expect(visibleCannedReplies([active, archived], options)).toEqual([archived])
    expect(
      visibleCannedReplies([active, archived], { showArchived: true, search: 'open 9' }),
    ).toEqual([active])
  })
})

describe('cannedReplyEmptyState', () => {
  const base = { showArchived: false, search: '', organizationName: null }

  it('is no-match when a search empties a list that has rows', () => {
    expect(cannedReplyEmptyState([active], { ...base, search: 'zzz' }).kind).toBe('no-match')
  })

  it('prefers the archived hint over no-match when the search is over nothing active', () => {
    expect(cannedReplyEmptyState([archived], { ...base, search: 'zzz' }).kind).toBe(
      'archived-hidden',
    )
  })
})

describe('cannedReplyDraftProblem', () => {
  const draft = { organizationId: 'org1', title: 'Hours', body: 'Nine to five.' }

  it('measures the limits after trimming', () => {
    expect(
      cannedReplyDraftProblem({ ...draft, title: ` ${'a'.repeat(CANNED_REPLY_TITLE_MAX)} ` }),
    ).toBeNull()
    expect(
      cannedReplyDraftProblem({ ...draft, title: 'a'.repeat(CANNED_REPLY_TITLE_MAX + 1) }),
    ).not.toBeNull()
    expect(
      cannedReplyDraftProblem({ ...draft, body: 'a'.repeat(CANNED_REPLY_BODY_MAX + 1) }),
    ).not.toBeNull()
  })
})

describe('a personal draft', () => {
  it('needs no organization when told so', () => {
    const draft = { organizationId: null, title: 'Hours', body: 'Nine to five.' }
    expect(cannedReplyDraftProblem(draft)).not.toBeNull()
    expect(cannedReplyDraftProblem({ ...draft, requiresOrganization: false })).toBeNull()
  })
})

describe('sortCannedReplies', () => {
  it('puts the most used first, ties by title', () => {
    const rows = [
      reply({ id: 'a', title: 'Alpha', useCount: 1 }),
      reply({ id: 'g', title: 'Gamma', useCount: 5 }),
      reply({ id: 'b', title: 'beta', useCount: 5 }),
    ]
    expect(sortCannedReplies(rows).map((row) => row.id)).toEqual(['b', 'g', 'a'])
  })
})

test('usageLabel says how often', () => {
  expect(usageLabel(0)).toBe('Not used yet')
  expect(usageLabel(1)).toBe('Used once')
  expect(usageLabel(9)).toBe('Used 9 times')
})

test('quickCreateTitle trims and caps at the title limit', () => {
  expect(quickCreateTitle('  refund  ')).toBe('refund')
  expect(quickCreateTitle('x'.repeat(80))).toHaveLength(CANNED_REPLY_TITLE_MAX)
})

describe('insertCannedReply', () => {
  it('replaces a selection, whichever way round it was made', () => {
    const draft = 'Hi NAME, thanks'
    expect(insertCannedReply(draft, { start: 3, end: 7 }, 'Sam').text).toBe('Hi Sam, thanks')
    expect(insertCannedReply(draft, { start: 7, end: 3 }, 'Sam').text).toBe('Hi Sam, thanks')
  })

  it('clamps a selection left over from a longer draft', () => {
    expect(insertCannedReply('abc', { start: 10, end: 12 }, 'X')).toEqual({
      text: 'abcX',
      caret: 4,
    })
  })
})
