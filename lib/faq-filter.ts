import type { FaqItem } from '@/lib/types'

export function filterFaq(items: FaqItem[], query: string): FaqItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return items.filter(
    (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q),
  )
}
