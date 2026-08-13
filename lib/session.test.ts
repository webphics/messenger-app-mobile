import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  blobAfterLogin,
  blobAfterRoleChange,
  blobAfterSignOut,
  getSession,
  hydrateSession,
  isLoggedIn,
  loginSession,
  parseSessionBlob,
  SESSION_KEY,
  setSessionMemory,
  setSessionRole,
  signOutSession,
} from '@/lib/session'

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}))

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>

describe('parseSessionBlob', () => {
  test('null or garbage → logged out contact', () => {
    expect(parseSessionBlob(null)).toEqual({ email: null, role: 'contact' })
    expect(parseSessionBlob('{')).toEqual({ email: null, role: 'contact' })
    expect(parseSessionBlob('{"email":1,"role":"wizard"}')).toEqual({
      email: null,
      role: 'contact',
    })
  })

  test('valid blob', () => {
    expect(
      parseSessionBlob(JSON.stringify({ email: 'a@b.co', role: 'agent' })),
    ).toEqual({ email: 'a@b.co', role: 'agent' })
  })

  test('empty email string → null email, keep role', () => {
    expect(
      parseSessionBlob(JSON.stringify({ email: '  ', role: 'admin' })),
    ).toEqual({ email: null, role: 'admin' })
  })
})

describe('transitions', () => {
  test('login keeps existing role', () => {
    expect(
      blobAfterLogin({ email: null, role: 'agent' }, 'luis@example.com'),
    ).toEqual({ email: 'luis@example.com', role: 'agent' })
  })

  test('login with default contact', () => {
    expect(
      blobAfterLogin({ email: null, role: 'contact' }, 'luis@example.com'),
    ).toEqual({ email: 'luis@example.com', role: 'contact' })
  })

  test('sign out clears email keeps role', () => {
    expect(
      blobAfterSignOut({ email: 'a@b.co', role: 'admin' }),
    ).toEqual({ email: null, role: 'admin' })
  })

  test('role change keeps email', () => {
    expect(
      blobAfterRoleChange({ email: 'a@b.co', role: 'contact' }, 'agent'),
    ).toEqual({ email: 'a@b.co', role: 'agent' })
  })

  test('isLoggedIn', () => {
    expect(isLoggedIn({ email: null, role: 'contact' })).toBe(false)
    expect(isLoggedIn({ email: 'a@b.co', role: 'contact' })).toBe(true)
  })
})

describe('memory', () => {
  test('set/get', () => {
    setSessionMemory({ email: 'a@b.co', role: 'admin' })
    expect(getSession()).toEqual({ email: 'a@b.co', role: 'admin' })
    setSessionMemory({ email: null, role: 'contact' })
  })
})

describe('persist', () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    storage.getItem.mockReset()
    storage.setItem.mockReset()
    storage.getItem.mockImplementation(async (key) => store[key] ?? null)
    storage.setItem.mockImplementation(async (key, value) => {
      store[key] = String(value)
    })
    setSessionMemory({ email: null, role: 'contact' })
  })

  test('hydrate missing key', async () => {
    const blob = await hydrateSession()
    expect(blob).toEqual({ email: null, role: 'contact' })
    expect(getSession()).toEqual(blob)
  })

  test('hydrate native-module miss keeps memory default', async () => {
    storage.getItem.mockRejectedValueOnce(
      new Error('Native module is null, cannot access legacy storage'),
    )
    const blob = await hydrateSession()
    expect(blob).toEqual({ email: null, role: 'contact' })
  })

  test('login then sign out keeps role', async () => {
    await hydrateSession()
    await setSessionRole('agent')
    const logged = await loginSession('luis@example.com')
    expect(logged).toEqual({ email: 'luis@example.com', role: 'agent' })
    const out = await signOutSession()
    expect(out).toEqual({ email: null, role: 'agent' })
    expect(storage.setItem).toHaveBeenCalledWith(
      SESSION_KEY,
      JSON.stringify({ email: null, role: 'agent' }),
    )
  })

  test('loginSession hydrates stored role first', async () => {
    store[SESSION_KEY] = JSON.stringify({ email: null, role: 'admin' })
    setSessionMemory({ email: null, role: 'contact' })
    const logged = await loginSession('luis@example.com')
    expect(logged).toEqual({ email: 'luis@example.com', role: 'admin' })
  })

  test('signOutSession hydrates stored role first', async () => {
    store[SESSION_KEY] = JSON.stringify({ email: 'a@b.co', role: 'agent' })
    setSessionMemory({ email: null, role: 'contact' })
    const out = await signOutSession()
    expect(out).toEqual({ email: null, role: 'agent' })
  })

  test('setSessionRole hydrates stored email first', async () => {
    store[SESSION_KEY] = JSON.stringify({ email: 'a@b.co', role: 'contact' })
    setSessionMemory({ email: null, role: 'contact' })
    const blob = await setSessionRole('agent')
    expect(blob).toEqual({ email: 'a@b.co', role: 'agent' })
  })
})
