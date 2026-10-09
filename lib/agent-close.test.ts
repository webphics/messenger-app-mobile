import { withoutAgentClose } from '@/lib/agent-close'

const ALL = { engage: true, takeOver: true, transfer: true, close: true, reopen: true }

test('takes Close from an Agent and leaves Reopen', () => {
  expect(withoutAgentClose(ALL, 'agent')).toEqual({ ...ALL, close: false })
})

test("leaves an Admin's actions alone", () => {
  expect(withoutAgentClose(ALL, 'admin')).toEqual(ALL)
})
