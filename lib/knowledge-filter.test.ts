import { filterKnowledge } from '@/lib/knowledge-filter'
import type { KnowledgeArticle } from '@/lib/types'

const ITEMS: KnowledgeArticle[] = [
  {
    id: 'a',
    title: 'Password reset script',
    body: 'Send a reset link from Messages.',
    tags: ['password', 'access'],
  },
  {
    id: 'b',
    title: 'Billing update script',
    body: 'Last four digits of the invoice.',
    tags: ['billing'],
  },
]

describe('filterKnowledge', () => {
  test('empty query returns no rows', () => {
    expect(filterKnowledge(ITEMS, '   ')).toEqual([])
  })

  test('matches title, body, or tag', () => {
    expect(filterKnowledge(ITEMS, 'password').map((i) => i.id)).toEqual(['a'])
    expect(filterKnowledge(ITEMS, 'invoice').map((i) => i.id)).toEqual(['b'])
    expect(filterKnowledge(ITEMS, 'access').map((i) => i.id)).toEqual(['a'])
  })
})
