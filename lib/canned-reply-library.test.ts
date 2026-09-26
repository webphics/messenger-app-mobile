import {
  CANNED_REPLY_BODY_MAX,
  CANNED_REPLY_TITLE_MAX,
  cannedReplyDraftProblem,
  cannedReplyEmptyState,
  insertCannedReply,
  visibleCannedReplies,
} from '@/lib/canned-reply-library'
import type { CannedReply } from '@/lib/types'

function reply(over: Partial<CannedReply> = {}): CannedReply {
  return {
    id: 'r1',
    organizationId: 'org1',
    title: 'Refund policy',
    body: 'Refunds are available within 30 days.',
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

  it('is none when something is drawn', () => {
    expect(cannedReplyEmptyState([active], base)).toEqual({ kind: 'none' })
  })

  it('is empty for an empty library, named for a filtered organization', () => {
    expect(cannedReplyEmptyState([], base)).toMatchObject({
      kind: 'empty',
      title: 'No saved responses yet',
    })
    expect(cannedReplyEmptyState([], { ...base, organizationName: 'Acme' })).toMatchObject({
      kind: 'empty',
      title: 'No saved responses for Acme',
    })
  })

  it('says how many are hidden when everything is archived', () => {
    expect(cannedReplyEmptyState([archived], base)).toEqual({
      kind: 'archived-hidden',
      title: 'No active saved responses',
      hint: "1 archived response is hidden. Agents can't insert archived responses until you restore them.",
      archivedCount: 1,
    })
    const two = [archived, { ...archived, id: 'c' }]
    expect(cannedReplyEmptyState(two, { ...base, organizationName: 'Acme' })).toMatchObject({
      kind: 'archived-hidden',
      title: 'No active saved responses for Acme',
      archivedCount: 2,
    })
  })

  it('is empty rather than a hint once archived rows are shown and none remain', () => {
    expect(cannedReplyEmptyState([], { ...base, showArchived: true }).kind).toBe('empty')
  })

  it('is no-match when a search empties a list that has rows', () => {
    expect(cannedReplyEmptyState([active], { ...base, search: 'zzz' }).kind).toBe('no-match')
    expect(
      cannedReplyEmptyState([archived], { ...base, showArchived: true, search: 'zzz' }).kind,
    ).toBe('no-match')
  })

  it('prefers the archived hint over no-match when the search is over nothing active', () => {
    expect(cannedReplyEmptyState([archived], { ...base, search: 'zzz' }).kind).toBe(
      'archived-hidden',
    )
  })
})

describe('cannedReplyDraftProblem', () => {
  const draft = { organizationId: 'org1', title: 'Hours', body: 'Nine to five.' }

  it('accepts a complete draft', () => {
    expect(cannedReplyDraftProblem(draft)).toBeNull()
  })

  it('names the first missing field', () => {
    expect(cannedReplyDraftProblem({ ...draft, organizationId: null })).toBe(
      'Pick the organization it belongs to.',
    )
    expect(cannedReplyDraftProblem({ ...draft, title: '   ' })).toBe('Give it a title.')
    expect(cannedReplyDraftProblem({ ...draft, body: '\n\n' })).toBe('Write the response text.')
  })

  it('measures the limits after trimming', () => {
    expect(
      cannedReplyDraftProblem({ ...draft, title: ` ${'a'.repeat(CANNED_REPLY_TITLE_MAX)} ` }),
    ).toBeNull()
    expect(
      cannedReplyDraftProblem({ ...draft, title: 'a'.repeat(CANNED_REPLY_TITLE_MAX + 1) }),
    ).toBe(`Keep the title to ${CANNED_REPLY_TITLE_MAX} characters.`)
    expect(
      cannedReplyDraftProblem({ ...draft, body: 'a'.repeat(CANNED_REPLY_BODY_MAX + 1) }),
    ).toBe(`Keep the response to ${CANNED_REPLY_BODY_MAX} characters.`)
  })
})

describe('insertCannedReply', () => {
  it('fills an empty draft', () => {
    expect(insertCannedReply('', null, 'Hello.')).toEqual({ text: 'Hello.', caret: 6 })
  })

  it('lands at the caret', () => {
    expect(insertCannedReply('Hi  thanks', { start: 3, end: 3 }, 'there,')).toEqual({
      text: 'Hi there, thanks',
      caret: 9,
    })
  })

  it('replaces a selection, whichever way round it was made', () => {
    const draft = 'Hi NAME, thanks'
    expect(insertCannedReply(draft, { start: 3, end: 7 }, 'Sam').text).toBe('Hi Sam, thanks')
    expect(insertCannedReply(draft, { start: 7, end: 3 }, 'Sam').text).toBe('Hi Sam, thanks')
  })

  it('appends when the caret is unknown, adding nothing around the response', () => {
    expect(insertCannedReply('Sure.', null, 'Line one.\nLine two.')).toEqual({
      text: 'Sure.Line one.\nLine two.',
      caret: 24,
    })
  })

  it('clamps a selection left over from a longer draft', () => {
    expect(insertCannedReply('abc', { start: 10, end: 12 }, 'X')).toEqual({
      text: 'abcX',
      caret: 4,
    })
  })
})
