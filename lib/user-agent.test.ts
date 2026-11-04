import { appUserAgent, readAppUserAgent, type AppAgentDevice } from '@/lib/user-agent'

function device(overrides: Partial<AppAgentDevice> = {}): AppAgentDevice {
  return {
    version: '1.0.23',
    platform: 'android',
    osVersion: '14',
    model: 'Pixel 8',
    tablet: false,
    ...overrides,
  }
}

describe('appUserAgent', () => {
  test.each([
    ['an Android phone', device(), 'ChatRoute/1.0.23 (Android 14; Pixel 8)'],
    ['an Android phone with no model', device({ model: null }), 'ChatRoute/1.0.23 (Android 14)'],
    [
      'an iPhone',
      device({ platform: 'ios', osVersion: '18.1', model: null }),
      'ChatRoute/1.0.23 (iOS 18.1; iPhone)',
    ],
    [
      'an iPad',
      device({ platform: 'ios', osVersion: '18.1', model: null, tablet: true }),
      'ChatRoute/1.0.23 (iPadOS 18.1; iPad)',
    ],
  ])('names %s', (_label, input, expected) => {
    expect(appUserAgent(input)).toBe(expected)
  })

  test('keeps a model okhttp would refuse, or one that would break the brackets, out of the header', () => {
    const agent = appUserAgent(device({ model: 'Moto g (2024); Édition\n' }))

    expect(agent).toBe('ChatRoute/1.0.23 (Android 14; Moto g 2024 dition)')
    expect(agent).toMatch(/^[\x20-\x7e]+$/)
  })

  test('reads back as itself', () => {
    expect(readAppUserAgent(appUserAgent(device()))).toEqual({
      name: 'ChatRoute app - Android 14',
      kind: 'phone',
      model: 'Pixel 8',
    })
  })
})

describe('readAppUserAgent', () => {
  test.each([
    [
      'an Android phone',
      'ChatRoute/1.0.23 (Android 14; Pixel 8)',
      { name: 'ChatRoute app - Android 14', kind: 'phone', model: 'Pixel 8' },
    ],
    [
      'an iPhone, whose idiom is not a model',
      'ChatRoute/1.0.23 (iOS 18.1; iPhone)',
      { name: 'ChatRoute app - iOS 18.1', kind: 'phone', model: null },
    ],
    [
      'an iPad',
      'ChatRoute/1.0.23 (iPadOS 18.1; iPad)',
      { name: 'ChatRoute app - iPadOS 18.1', kind: 'tablet', model: null },
    ],
    [
      'an Android phone that named no model',
      'ChatRoute/1.0.23 (Android 14)',
      { name: 'ChatRoute app - Android 14', kind: 'phone', model: null },
    ],
    [
      'a build from before the app named itself, on Android',
      'okhttp/4.12.0',
      { name: 'ChatRoute app - Android', kind: null, model: null },
    ],
    [
      'a build from before the app named itself, on iOS',
      'ChatRoute/1 CFNetwork/1568.100.1 Darwin/24.0.0',
      { name: 'ChatRoute app - iOS', kind: null, model: null },
    ],
  ])('reads %s', (_label, agent, expected) => {
    expect(readAppUserAgent(agent)).toEqual(expected)
  })

  test.each([
    ['nothing', null],
    ['an empty string', '   '],
    [
      'Chrome on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    ],
    [
      'Chrome on Android',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Safari on an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    ],
  ])('leaves %s to the API', (_label, agent) => {
    expect(readAppUserAgent(agent)).toBeNull()
  })
})
