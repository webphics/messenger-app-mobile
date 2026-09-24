import { isSupportAssignmentEnabled } from '@/lib/support-assignment'
import type { SessionUser } from '@/lib/types'

const AGENT: SessionUser = {
  id: 'agent-1',
  name: 'Jonah Reed',
  email: 'jonah@talo.test',
  role: 'agent',
  hasPassword: true,
  twoFactorEnabled: false,
  supportAssignmentEnabled: true,
}

describe('isSupportAssignmentEnabled', () => {
  test.each<[string, SessionUser | null | undefined, boolean]>([
    ['a session that says it is on', AGENT, true],
    ['a session that says it is off', { ...AGENT, supportAssignmentEnabled: false }, false],
    ['nobody signed in', null, false],
    ['nobody at all', undefined, false],
    // Typed as a boolean and parsed as one, but a kept or mocked person built
    // around the parse must still land on the Shared queue rather than on it.
    [
      'a person whose field is not a boolean',
      { ...AGENT, supportAssignmentEnabled: 'true' as unknown as boolean },
      false,
    ],
  ])('%s', (_label, user, expected) => {
    expect(isSupportAssignmentEnabled(user)).toBe(expected)
  })
})
