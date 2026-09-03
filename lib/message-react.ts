import type { MessageReaction } from '@/lib/types'

export const REACT_EMOJIS = ['❤️', '😆', '😮', '😢', '😡', '👎'] as const

/**
 * The reactions on one message, gathered per emoji for the chip row.
 *
 * The API sends them one per person — `{ emoji, userId }` — because that is what
 * it stores. A bubble draws one chip per emoji with a count, so the grouping
 * happens here rather than in the component, and the order the emoji first
 * appeared in is kept so a chip row does not reshuffle as reactions arrive.
 */
export type ReactionGroup = { emoji: string; userIds: string[] }

export function groupReactions(reactions: MessageReaction[] | undefined): ReactionGroup[] {
  const groups: ReactionGroup[] = []
  for (const reaction of reactions ?? []) {
    const existing = groups.find((group) => group.emoji === reaction.emoji)
    if (existing) {
      if (!existing.userIds.includes(reaction.userId)) existing.userIds.push(reaction.userId)
      continue
    }
    groups.push({ emoji: reaction.emoji, userIds: [reaction.userId] })
  }
  return groups
}

/** One reaction per user per message — picking another emoji replaces the last. */
export function toggleReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  userId: string,
): MessageReaction[] {
  const held = reactions ?? []
  const hadSame = held.some(
    (reaction) => reaction.emoji === emoji && reaction.userId === userId,
  )
  const withoutMine = held.filter((reaction) => reaction.userId !== userId)

  return hadSame ? withoutMine : [...withoutMine, { emoji, userId }]
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
  if (args.outgoing) {
    return args.quotedIsMe
      ? 'You replied to yourself'
      : `You replied to ${args.quotedName}`
  }
  const target = args.quotedIsMe ? 'you' : args.quotedName
  return `${args.senderName ?? 'They'} replied to ${target}`
}
