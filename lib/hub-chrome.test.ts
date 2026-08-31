import { hubEyebrow, hubGreeting } from '@/lib/hub-chrome'

describe('hubEyebrow', () => {
  test('returns SUPPORT for customer', () => {
    expect(hubEyebrow('customer')).toBe('SUPPORT')
  })

  test('returns AGENT for agent', () => {
    expect(hubEyebrow('agent')).toBe('AGENT')
  })

  test('returns ADMIN for admin', () => {
    expect(hubEyebrow('admin')).toBe('ADMIN')
  })
})

describe('hubGreeting', () => {
  test('formats customer greeting copy', () => {
    expect(hubGreeting('customer', 'Alex')).toBe('How can we help, Alex? 👋')
  })

  test('formats agent greeting copy', () => {
    expect(hubGreeting('agent', 'Alex')).toBe('Ready when you are, Alex 👋')
  })

  test('formats admin greeting copy', () => {
    expect(hubGreeting('admin', 'Alex')).toBe('Welcome back, Alex 👋')
  })
})
