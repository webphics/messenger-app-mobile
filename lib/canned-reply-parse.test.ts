import {
  parseCannedReplies,
  parseCannedReply,
  parseCannedReplyDeleted,
} from '@/lib/canned-reply-parse'

const row = {
  id: 'r1',
  organizationId: 'org1',
  title: 'Refund policy',
  body: 'Line one.\nLine two.',
  archived: false,
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
}

describe('parseCannedReply', () => {
  it('reads a row and keeps the body as written', () => {
    expect(parseCannedReply(row)).toEqual({
      id: 'r1',
      scope: 'organization',
      organizationId: 'org1',
      owner: null,
      title: 'Refund policy',
      body: 'Line one.\nLine two.',
      useCount: 0,
      archived: false,
    })
  })

  it('reads archived only from a literal true', () => {
    expect(parseCannedReply({ ...row, archived: true })?.archived).toBe(true)
    expect(parseCannedReply({ ...row, archived: 'true' })?.archived).toBe(false)
  })

  it.each(['id', 'organizationId', 'title', 'body'])('drops a row with no %s', (key) => {
    expect(parseCannedReply({ ...row, [key]: '' })).toBeNull()
  })

  it('drops something that is not a record', () => {
    expect(parseCannedReply(null)).toBeNull()
    expect(parseCannedReply([row])).toBeNull()
  })
})

describe('a personal response', () => {
  const personal = {
    ...row,
    scope: 'personal',
    organizationId: null,
    owner: { id: 'u1', name: 'Ray' },
    useCount: 4,
  }

  it('reads its owner and count, and no organization', () => {
    expect(parseCannedReply(personal)).toMatchObject({
      scope: 'personal',
      organizationId: null,
      owner: { id: 'u1', name: 'Ray' },
      useCount: 4,
    })
  })

  it('is dropped without an owner, as an organization one is without an organization', () => {
    expect(parseCannedReply({ ...personal, owner: null })).toBeNull()
    expect(parseCannedReply({ ...row, organizationId: null })).toBeNull()
  })

  it('reads a nonsense count as zero', () => {
    expect(parseCannedReply({ ...personal, useCount: -3 })?.useCount).toBe(0)
    expect(parseCannedReply({ ...personal, useCount: 'many' })?.useCount).toBe(0)
  })
})

describe('parseCannedReplies', () => {
  it('drops unreadable rows and keeps the rest', () => {
    expect(parseCannedReplies({ rows: [row, { id: 'broken' }] })).toHaveLength(1)
  })

  it('reads an empty library as an empty list', () => {
    expect(parseCannedReplies({ rows: [] })).toEqual([])
  })

  it('reads a body with no rows array as malformed, not empty', () => {
    expect(parseCannedReplies({})).toBeNull()
    expect(parseCannedReplies([row])).toBeNull()
  })
})

describe('parseCannedReplyDeleted', () => {
  it('reads the flag and nothing else', () => {
    expect(parseCannedReplyDeleted({ deleted: true })).toBe(true)
    expect(parseCannedReplyDeleted({ deleted: false })).toBe(false)
    expect(parseCannedReplyDeleted({})).toBeNull()
  })
})
