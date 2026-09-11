import { formatClockTime } from '@/lib/message-receipt-format'
import type { MessageReceipt, MessageReceipts, ReceiptStatus } from '@/lib/types'

/** The most recent of a set of receipts — when the last person got to it. */
function newest(entries: MessageReceipt[]): MessageReceipt | undefined {
  if (entries.length === 0) return undefined
  return entries.reduce((latest, entry) =>
    Date.parse(entry.at) > Date.parse(latest.at) ? entry : latest,
  )
}

/**
 * What the newest message in a thread says about itself.
 *
 * When it was *read*, rather than when it was sent — which is the fact somebody is actually looking
 * for, and the one `receiptStatus` cannot give: it reports that a message was read and never when.
 * This is the only message that says so unasked, so it is the only one worth a request; every other
 * message answers the question through Message info.
 *
 * It falls back to the send time rather than to nothing, in three cases that are all the same case:
 * an incoming message, whose receipts this viewer may not read; an outgoing one nobody has reached
 * yet; and the moment before the answer arrives. A message still has a fact worth stating in each,
 * and "Sent 9:03 AM" reads as the same kind of thing as "Seen 9:08 AM" — which keeps the line from
 * appearing and disappearing underneath somebody as a receipt lands.
 */
export function readStampLabel(input: {
  isMine: boolean
  status: ReceiptStatus
  createdAt: string
  receipts: MessageReceipts | null
}): string {
  const time = formatClockTime(input.createdAt)
  if (!input.isMine) return time

  const read = input.receipts ? newest(input.receipts.readBy) : undefined
  if (read) return `Seen ${formatClockTime(read.at)}`

  const delivered = input.receipts ? newest(input.receipts.deliveredTo) : undefined
  if (delivered) return `Delivered ${formatClockTime(delivered.at)}`

  return input.status === 'sent' ? `Sent ${time}` : time
}
