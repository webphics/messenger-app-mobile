import type { MessageStatus } from '@/lib/types'

export function messageStatusLabel(status: MessageStatus): string {
  switch (status) {
    case 'sending':
      return 'Sending'
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'read':
      return 'Read'
  }
}
