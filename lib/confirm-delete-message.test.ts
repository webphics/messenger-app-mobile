import { Alert } from 'react-native'

import { confirmDeleteMessage } from '@/lib/confirm-delete-message'

type AlertButton = { text?: string; style?: string; onPress?: () => void }
type AlertOptions = { onDismiss?: () => void }

/** Driven the way `confirm-sign-out.test.ts` drives its dialog: by the button's label. */
function lastAlert(): { title: string; body: string; buttons: AlertButton[]; options: AlertOptions } {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1)
  return { title: call?.[0], body: call?.[1], buttons: call?.[2] ?? [], options: call?.[3] ?? {} }
}

function press(label: string): void {
  lastAlert().buttons.find((button) => button.text === label)?.onPress?.()
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('confirming resolves true, and Delete is the destructive button', async () => {
  const answer = confirmDeleteMessage({ attachments: [] })
  expect(lastAlert().title).toBe('Delete message?')
  expect(lastAlert().buttons.find((button) => button.text === 'Delete')?.style).toBe('destructive')
  press('Delete')
  await expect(answer).resolves.toBe(true)
})

test('cancelling resolves false', async () => {
  const answer = confirmDeleteMessage({ attachments: [] })
  press('Cancel')
  await expect(answer).resolves.toBe(false)
})

test('dismissing without pressing anything resolves false', async () => {
  const answer = confirmDeleteMessage({ attachments: [] })
  lastAlert().options.onDismiss?.()
  await expect(answer).resolves.toBe(false)
})

test('says the attachments go too when there are any', () => {
  void confirmDeleteMessage({ attachments: [{}] as never })
  expect(lastAlert().body).toContain('and its attachments')
})
