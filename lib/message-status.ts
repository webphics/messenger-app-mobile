import type { ReceiptStatus } from '@/lib/types'

/**
 * What a receipt says, for a screen reader.
 *
 * Three states, not four: `sending` is gone with the mock. A message the API has
 * acknowledged is at least `sent`, and a message this device is still holding
 * has no receipt at all — optimistic send is #29's, and will bring its own way
 * of saying so rather than borrowing a receipt the server has not issued.
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
