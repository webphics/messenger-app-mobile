import type { ReceiptStatus } from '@/lib/types'

/**
 * What a receipt says, for a screen reader.
 *
 * Three states, not four: `sending` is gone with the mock. A message the API has
 * acknowledged is at least `sent`, and a message this device is still holding
 * has no receipt at all — it says so as a `DeliveryState` instead, which is
 * what a bubble shows in place of a receipt the server has not issued. See
 * `lib/conversation-state`.
 */
export function messageStatusLabel(status: ReceiptStatus): string {
  switch (status) {
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'read':
      return 'Read'
  }
}
