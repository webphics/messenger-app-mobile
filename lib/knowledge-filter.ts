import type { KnowledgeArticle } from '@/lib/types'

export function filterKnowledge(
  items: KnowledgeArticle[],
  query: string,
): KnowledgeArticle[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q)),
  )
}
