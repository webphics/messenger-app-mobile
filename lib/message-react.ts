import type { MessageReaction } from '@/lib/types'

export const REACT_EMOJIS = ['❤️', '😆', '😮', '😢', '😡', '👎'] as const

/** One reaction per user per message — picking another emoji replaces the last. */
export function toggleReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  userId: string,
): MessageReaction[] {
  const hadSame = (reactions ?? []).some((r) => r.emoji === emoji && r.userIds.includes(userId))
  const next = (reactions ?? [])
    .map((r) => ({ emoji: r.emoji, userIds: r.userIds.filter((id) => id !== userId) }))
    .filter((r) => r.userIds.length > 0)

  if (hadSame) return next

  const i = next.findIndex((r) => r.emoji === emoji)
  if (i < 0) return [...next, { emoji, userIds: [userId] }]
  return next.map((r, j) => (j === i ? { ...r, userIds: [...r.userIds, userId] } : r))
}

export function quotePreview(body: string, max = 72): string {
  const t = body.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).trimEnd()}…`
}

export function replyCaption(args: {
  outgoing: boolean
  senderName?: string
  quotedName: string
  quotedIsMe: boolean
}): string {
  const target = args.quotedIsMe ? 'you' : args.quotedName
  if (args.outgoing) return `You replied to ${target}`
  return `${args.senderName ?? 'They'} replied to ${target}`
}
