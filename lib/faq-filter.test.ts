import { filterFaq } from '@/lib/faq-filter'
import type { FaqItem } from '@/lib/types'

const ITEMS: FaqItem[] = [
  { id: 'a', question: 'How do I reset my password?', answer: 'Message Support.' },
  { id: 'b', question: 'What are Offers?', answer: 'In-app promos from Support.' },
]

describe('filterFaq', () => {
  test('empty query returns no rows', () => {
    expect(filterFaq(ITEMS, '   ')).toEqual([])
  })

  test('matches question or answer', () => {
    expect(filterFaq(ITEMS, 'password').map((i) => i.id)).toEqual(['a'])
    expect(filterFaq(ITEMS, 'promos').map((i) => i.id)).toEqual(['b'])
  })
})
