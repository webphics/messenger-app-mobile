import {
  LAUNCH_ANIMATION_ASPECT,
  launchAnimationSize,
} from '@/lib/launch-animation'

describe('launchAnimationSize', () => {
  test('takes 85% of a narrow screen', () => {
    expect(launchAnimationSize(320).width).toBeCloseTo(272)
  })

  test('caps at the max width on a wide screen', () => {
    expect(launchAnimationSize(1024).width).toBe(360)
  })

  test('honours a custom max width', () => {
    expect(launchAnimationSize(1024, 200).width).toBe(200)
  })

  test('derives height from the asset aspect ratio', () => {
    const { width, height } = launchAnimationSize(1024)
    expect(height).toBeCloseTo(width / LAUNCH_ANIMATION_ASPECT)
  })

  test('never returns a negative size', () => {
    expect(launchAnimationSize(0)).toEqual({ width: 0, height: 0 })
    expect(launchAnimationSize(-50)).toEqual({ width: 0, height: 0 })
  })
})
