import * as Notifications from 'expo-notifications'

import {
  PUSH_PERMISSION_ASKED_FILE,
  addPushTapListener,
  ensurePushPermission,
  readPushToken,
  takeTappedConversation,
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

/** The tap listeners `expo-notifications` has been handed, and the ones taken back. */
const mockTapListeners: ((response: never) => void)[] = []
const mockRemoved: unknown[] = []

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
  getLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
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
function permission(
  status: 'granted' | 'denied' | 'undetermined',
  canAskAgain = true,
) {
  return {
    status,
    canAskAgain,
    granted: status === 'granted',
  } as Notifications.NotificationPermissionsStatus
}

beforeEach(() => {
  mockCalls.length = 0
  mockTapListeners.length = 0
  mockRemoved.length = 0
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
  notifications.getLastNotificationResponse.mockReturnValue(null)
  notifications.addNotificationResponseReceivedListener.mockImplementation(
    (listener) => {
      mockTapListeners.push(listener)
      return { remove: () => mockRemoved.push(listener) } as never
    },
  )
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

  it('does not re-request a permission already granted', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('granted'))

    expect(await ensurePushPermission('sign-in')).toBe('granted')
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('does not request one the platform will not draw a dialog for', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('denied', false))

    expect(await ensurePushPermission('sign-in')).toBe('denied')
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled()
  })

  /**
   * What the emulator caught. Android 13+ reports a never-asked permission as
   * `denied`, so this is the ordinary first ask rather than an edge case.
   */
  it('raises the dialog on the denied-but-askable state Android reports first', async () => {
    notifications.getPermissionsAsync.mockResolvedValue(permission('denied'))

    expect(await ensurePushPermission('sign-in')).toBe('granted')
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1)
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

/**
 * The tap.
 *
 * What is asserted here is the wiring — which call answers a cold start, which
 * one answers a tap while running, and that a subscription can be taken back.
 * *Which* conversation a payload names is `lib/push-rules`, table-tested next
 * door with no mocks, and is not re-tested through this.
 */
function tap(conversationPublicId: string | null, identifier = 'ntf_01') {
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      request: { identifier, content: { data: { conversationPublicId } } },
    },
  } as never
}

describe('takeTappedConversation', () => {
  it('answers the conversation the tap that started this launch named', () => {
    notifications.getLastNotificationResponse.mockReturnValue(tap('cnv_01'))

    expect(takeTappedConversation()).toBe('cnv_01')
  })

  it('answers null on a launch nobody tapped anything to start', () => {
    expect(takeTappedConversation()).toBeNull()
  })

  /**
   * A build with no native side answers nothing rather than throwing, and it has
   * to: this is read on the way into a cold start, and a throw here would be a
   * launch that never happens.
   */
  it('answers null rather than throwing when the platform cannot be read', () => {
    notifications.getLastNotificationResponse.mockImplementation(() => {
      throw new Error('no native module')
    })

    expect(takeTappedConversation()).toBeNull()
  })
})

describe('addPushTapListener', () => {
  it('hands on the conversation a tap while the app is running named', () => {
    const opened: string[] = []
    addPushTapListener((id) => opened.push(id))

    mockTapListeners[0](tap('cnv_02', 'ntf_02'))

    expect(opened).toEqual(['cnv_02'])
  })

  it('says nothing for a tap this build cannot read a conversation out of', () => {
    const opened: string[] = []
    addPushTapListener((id) => opened.push(id))

    mockTapListeners[0](tap(null, 'ntf_03'))

    expect(opened).toEqual([])
  })

  /**
   * The response that started a cold launch is available from both sides — the
   * read above, and a listener registered early enough to be handed it too. The
   * launch reads it and the listener may replay it, and a thread opened twice is
   * a thread somebody has to press Back through twice, so a tap is handed on
   * once whichever side reaches it first.
   */
  it('hands one tap on once, however many times the platform reports it', () => {
    notifications.getLastNotificationResponse.mockReturnValue(tap('cnv_04', 'ntf_04'))
    const opened: string[] = []
    addPushTapListener((id) => opened.push(id))

    expect(takeTappedConversation()).toBe('cnv_04')
    mockTapListeners[0](tap('cnv_04', 'ntf_04'))

    expect(opened).toEqual([])
  })

  /**
   * The drop above is spent on the one report it exists for. A notification
   * still in the shade can be tapped again, and that tap is a person asking for
   * the thread rather than the platform repeating itself.
   */
  it('opens the launch notification again when somebody taps it a second time', () => {
    notifications.getLastNotificationResponse.mockReturnValue(tap('cnv_07', 'ntf_07'))
    const opened: string[] = []
    addPushTapListener((id) => opened.push(id))

    takeTappedConversation()
    mockTapListeners[0](tap('cnv_07', 'ntf_07'))
    mockTapListeners[0](tap('cnv_07', 'ntf_07'))

    expect(opened).toEqual(['cnv_07'])
  })

  it('hands on a second tap on the same thread, which is a second notification', () => {
    const opened: string[] = []
    addPushTapListener((id) => opened.push(id))

    mockTapListeners[0](tap('cnv_05', 'ntf_05'))
    mockTapListeners[0](tap('cnv_05', 'ntf_06'))

    expect(opened).toEqual(['cnv_05', 'cnv_05'])
  })

  it('takes the subscription back when it is unsubscribed', () => {
    const stop = addPushTapListener(() => {})

    stop()

    expect(mockRemoved).toEqual(mockTapListeners)
  })

  /** A build with no native side subscribes to nothing and unsubscribes cleanly. */
  it('answers an unsubscribe that does nothing when it cannot subscribe', () => {
    notifications.addNotificationResponseReceivedListener.mockImplementation(() => {
      throw new Error('no native module')
    })

    expect(() => addPushTapListener(() => {})()).not.toThrow()
  })
})
