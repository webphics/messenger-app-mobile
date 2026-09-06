import * as Notifications from 'expo-notifications'

import {
  PUSH_PERMISSION_ASKED_FILE,
  ensurePushPermission,
  readPushToken,
} from '@/lib/push-device'

/**
 * `expo-notifications`, hand-written at the boundary this module owns — the way
 * `attachment-cache.test` hand-writes `expo-file-system` and
 * `conversation-store.test` hand-writes `expo-sqlite`. What is asserted here is
 * which calls went out against it and in what order; *whether* the dialog should
 * have been raised is `lib/push-rules`, table-tested next door with no mocks,
 * and is deliberately not re-tested through this.
 */
const mockCalls: string[] = []

/** The cache, small enough to read: one file's contents by name. */
const mockCache = new Map<string, string>()
let mockCacheReadFails = false
let mockCacheWriteFails = false

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 6 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}))

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    name: string
    constructor(directory: unknown, name: string) {
      this.name = `${String(directory)}${name}`
    }
    get exists() {
      if (mockCacheReadFails) throw new Error('cache unreadable')
      return mockCache.has(this.name)
    }
    write(text: string) {
      if (mockCacheWriteFails) throw new Error('cache unwritable')
      mockCache.set(this.name, text)
    }
  },
}))

const notifications = Notifications as jest.Mocked<typeof Notifications>

const ASKED_FILE = `file:///cache/${PUSH_PERMISSION_ASKED_FILE}`

/** Only the fields this module reads; the platform sends a good deal more. */
function permission(status: 'granted' | 'denied' | 'undetermined') {
  return { status, granted: status === 'granted' } as Notifications.NotificationPermissionsStatus
}

beforeEach(() => {
  mockCalls.length = 0
  mockCache.clear()
  mockCacheReadFails = false
  mockCacheWriteFails = false
  jest.clearAllMocks()

  notifications.setNotificationChannelAsync.mockImplementation(async () => {
    mockCalls.push('channel')
    return null
  })
  notifications.getExpoPushTokenAsync.mockImplementation(async () => {
    mockCalls.push('token')
    return { type: 'expo', data: 'ExponentPushToken[abc]' }
  })
  notifications.getPermissionsAsync.mockResolvedValue(permission('undetermined'))
  notifications.requestPermissionsAsync.mockResolvedValue(permission('granted'))
})

describe('readPushToken', () => {
  /**
   * Android will not draw a notification that names a channel which does not
   * exist, and a channel's importance is fixed at the moment it is created — so
   * the only place to create it is ahead of the registration that makes a
   * dispatch possible at all.
   */
  it('creates the Android channel before it reads a token', async () => {
    await readPushToken()

    expect(mockCalls).toEqual(['channel', 'token'])
  })

  it('answers the token this installation was issued', async () => {
    expect(await readPushToken()).toBe('ExponentPushToken[abc]')
  })

  /**
   * Reading a token is a request to Expo's servers, so a phone with no signal
   * fails here. Nothing about this app depends on it: the registration is
   * skipped and the next launch asks again.
   */
  it('answers null rather than throwing when the token cannot be read', async () => {
    notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('offline'))

    expect(await readPushToken()).toBeNull()
  })

  it('answers null rather than throwing when the channel cannot be created', async () => {
    notifications.setNotificationChannelAsync.mockRejectedValueOnce(new Error('no native module'))

    expect(await readPushToken()).toBeNull()
  })
})

describe('ensurePushPermission', () => {
  it('raises the dialog on a device that has never asked, and answers what came back', async () => {
    expect(await ensurePushPermission('sign-in')).toBe('granted')

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('records that this device has asked, so a later launch does not ask again', async () => {
    await ensurePushPermission('sign-in')

    expect(mockCache.has(ASKED_FILE)).toBe(true)
  })

  it('does not ask again on a device that already has', async () => {
    mockCache.set(ASKED_FILE, 'asked')

    expect(await ensurePushPermission('sign-in')).toBe('undetermined')
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it.each(['granted', 'denied'] as const)('does not re-request a permission already %s', async (status) => {
    notifications.getPermissionsAsync.mockResolvedValue(permission(status))

    expect(await ensurePushPermission('sign-in')).toBe(status)
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('records nothing when the dialog itself failed, so the ask is still owed', async () => {
    notifications.requestPermissionsAsync.mockRejectedValueOnce(new Error('no native module'))

    expect(await ensurePushPermission('sign-in')).toBe('undetermined')
    expect(mockCache.has(ASKED_FILE)).toBe(false)
  })

  it('answers undetermined rather than throwing when the platform cannot be read', async () => {
    notifications.getPermissionsAsync.mockRejectedValueOnce(new Error('no native module'))
    notifications.requestPermissionsAsync.mockRejectedValueOnce(new Error('no native module'))

    expect(await ensurePushPermission('sign-in')).toBe('undetermined')
  })

  /**
   * A storage that will not answer is indistinguishable from one that has never
   * been written to, which is the safe way round: it asks, rather than staying
   * silent for good on a device whose answer nobody can read.
   */
  it('treats a cache that cannot be read as a device that has not asked', async () => {
    mockCacheReadFails = true

    await ensurePushPermission('sign-in')

    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
  })

  it('does not fail when the record of the ask cannot be written', async () => {
    mockCacheWriteFails = true

    await expect(ensurePushPermission('sign-in')).resolves.toBe('granted')
  })
})
