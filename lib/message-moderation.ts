import { isLocalId, isOutgoing, isSystemMessage } from '@/lib/thread-state'
import { isStaffMessage, type Message } from '@/lib/types'

/**
 * Whether a Message's long-press menu offers Report and Block.
 *
 * Report is offered on anything somebody else wrote that the API holds: never
 * on the reader's own, never on one this device is still carrying (it has no id
 * the API knows), and never on a System notice, which the product wrote rather
 * than a person.
 *
 * Block needs a person to block, so it is offered only where the Message names
 * its sender. A Customer's Support DM does not — the company speaks as one
 * voice there — so a Customer can report a reply in it but has nobody to block.
 */
export type MessageModeration = {
  report: boolean
  block: { id: string; name: string } | null
}

const NOTHING: MessageModeration = { report: false, block: null }

export function messageModeration(message: Message, viewerId: string): MessageModeration {
  if (isLocalId(message.id) || isSystemMessage(message) || isOutgoing(message, viewerId)) return NOTHING
  const sender = isStaffMessage(message) && message.sender.id !== '' ? message.sender : null
  return { report: true, block: sender ? { id: sender.id, name: sender.name } : null }
}
