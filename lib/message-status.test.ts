import { messageStatusLabel } from '@/lib/message-status'

describe('messageStatusLabel', () => {
  test('names every receipt the API issues', () => {
    expect(messageStatusLabel('sent')).toBe('Sent')
    expect(messageStatusLabel('delivered')).toBe('Delivered')
    expect(messageStatusLabel('read')).toBe('Read')
  })
})
