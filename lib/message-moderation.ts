import { isCompanyPersona } from '@/lib/display'
import { isLocalId, isOutgoing, isSystemMessage } from '@/lib/thread-state'
import { isStaffMessage, type ConversationType, type Message } from '@/lib/types'

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
 * Nor does a Staff member a Customer is shown as the company in a group
 * (`company:…`): that id is an organization's, and `POST /blocks` takes a
 * person's.
 */
export type MessageModeration = {
  report: boolean
  block: { id: string; name: string } | null
}

const NOTHING: MessageModeration = { report: false, block: null }

/**
 * Whether a block reaches this kind of conversation. Not a Support DM: that
 * thread is the company and its customer, so the API leaves its history, live
 * Messages and notifications alone whoever blocked whom — and this client hides
 * nothing in one and offers no Block there either, so a block never looks like
 * it did something it did not.
 */
export function blocksApplyTo(conversationType: ConversationType): boolean {
  return conversationType !== 'support_dm'
}

export function messageModeration(
  message: Message,
  viewerId: string,
  conversationType: ConversationType,
): MessageModeration {
  if (isLocalId(message.id) || isSystemMessage(message) || isOutgoing(message, viewerId)) return NOTHING
  if (!blocksApplyTo(conversationType)) return { report: true, block: null }
  const sender =
    isStaffMessage(message) && message.sender.id !== '' && !isCompanyPersona(message.sender.id)
      ? message.sender
      : null
  return { report: true, block: sender ? { id: sender.id, name: sender.name } : null }
}
