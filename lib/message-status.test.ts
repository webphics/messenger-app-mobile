import { messageStatusLabel } from '@/lib/message-status'

describe('messageStatusLabel', () => {
  test('maps every receipt state', () => {
    expect(messageStatusLabel('sending')).toBe('Sending')
    expect(messageStatusLabel('sent')).toBe('Sent')
    expect(messageStatusLabel('delivered')).toBe('Delivered')
    expect(messageStatusLabel('read')).toBe('Read')
  })
})
