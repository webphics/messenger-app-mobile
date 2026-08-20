import { hubEyebrow, hubGreeting } from '@/lib/hub-chrome'

describe('hubEyebrow', () => {
  test('returns SUPPORT for contact', () => {
    expect(hubEyebrow('contact')).toBe('SUPPORT')
  })

  test('returns AGENT for agent', () => {
    expect(hubEyebrow('agent')).toBe('AGENT')
  })

  test('returns ADMIN for admin', () => {
    expect(hubEyebrow('admin')).toBe('ADMIN')
  })
})

describe('hubGreeting', () => {
  test('formats contact greeting copy', () => {
    expect(hubGreeting('contact', 'Alex')).toBe('How can we help, Alex? 👋')
  })

  test('formats agent greeting copy', () => {
    expect(hubGreeting('agent', 'Alex')).toBe('Ready when you are, Alex 👋')
  })

  test('formats admin greeting copy', () => {
    expect(hubGreeting('admin', 'Alex')).toBe('Welcome back, Alex 👋')
  })
})
