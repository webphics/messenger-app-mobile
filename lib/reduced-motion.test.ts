import { enteringAnimation } from '@/lib/reduced-motion'

describe('enteringAnimation', () => {
  const animation = { kind: 'fade-in' }

  test('returns undefined when reduced motion is on', () => {
    expect(enteringAnimation(true, animation)).toBeUndefined()
  })

  test('returns the animation when reduced motion is off', () => {
    expect(enteringAnimation(false, animation)).toBe(animation)
  })
})
