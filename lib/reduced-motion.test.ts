import { layoutAnimation } from '@/lib/reduced-motion'

describe('layoutAnimation', () => {
  const animation = { kind: 'fade-in' }

  test('returns undefined when reduced motion is on', () => {
    expect(layoutAnimation(true, animation)).toBeUndefined()
  })

  test('returns the animation when reduced motion is off', () => {
    expect(layoutAnimation(false, animation)).toBe(animation)
  })
})
