import {
  assignLabel,
  invitationSummary,
  placeableOnboardingCustomer,
  toggleOrganization,
} from '@/lib/onboarding-placement'
import type { Conversation } from '@/lib/types'

const LAST_MESSAGE = {
  lastMessageAt: null,
  lastMessagePreview: null,
  lastMessageMine: false,
  lastMessageReceiptStatus: null,
  lastMessageRead: true,
  unreadCount: null,
}

const CUSTOMER = { id: 'u1', name: 'Rahim' }

/**
 * A staff payload of a live onboarding thread: `organizationId: null` makes it the onboarding
 * thread, and `onboardingOpen: true` says its Customer still holds no membership.
 */
function onboarding(over: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    organizationId: null,
    onboardingOpen: true,
    type: 'support_dm',
    status: 'unassigned',
    title: null,
    description: null,
    avatarUrl: null,
    customer: CUSTOMER,
    assignedAgent: null,
    otherUser: null,
    members: [],
    labels: [],
    ...LAST_MESSAGE,
    ...over,
  } as Conversation
}

const ADMIN = { capabilities: ['manage_memberships'] as const }
const AGENT = { capabilities: ['message_customers'] as const }

describe('placeableOnboardingCustomer', () => {
  test('names the Customer of an onboarding thread to a viewer holding manage_memberships', () => {
    expect(placeableOnboardingCustomer(ADMIN, onboarding())).toEqual(CUSTOMER)
  })

  test('offers nothing to a viewer without manage_memberships, or to nobody', () => {
    expect(placeableOnboardingCustomer(AGENT, onboarding())).toBeNull()
    expect(placeableOnboardingCustomer(null, onboarding())).toBeNull()
  })

  test('offers nothing on a Support DM that belongs to an organization', () => {
    const placed = onboarding({ organizationId: 'org1', onboardingOpen: false })
    expect(placeableOnboardingCustomer(ADMIN, placed)).toBeNull()
  })

  test('does not trust onboardingOpen on a Support DM that belongs to an organization', () => {
    expect(placeableOnboardingCustomer(ADMIN, onboarding({ organizationId: 'org1' }))).toBeNull()
  })

  test('offers nothing on an onboarding thread whose Customer has since joined an organization', () => {
    expect(placeableOnboardingCustomer(ADMIN, onboarding({ onboardingOpen: false }))).toBeNull()
  })

  test('offers nothing when the payload does not say the onboarding thread is open', () => {
    const withoutField = onboarding() as Record<string, unknown>
    delete withoutField.onboardingOpen
    expect(placeableOnboardingCustomer(ADMIN, withoutField as Conversation)).toBeNull()
  })

  test('offers nothing on a conversation that is not a Support DM', () => {
    expect(placeableOnboardingCustomer(ADMIN, onboarding({ type: 'staff_dm' }))).toBeNull()
  })

  test("offers nothing on a Customer's own payload, which names no Customer", () => {
    const own = { id: 'c1', organizationId: null, type: 'support_dm', ...LAST_MESSAGE } as Conversation
    expect(placeableOnboardingCustomer(ADMIN, own)).toBeNull()
  })

  test('offers nothing without a conversation', () => {
    expect(placeableOnboardingCustomer(ADMIN, null)).toBeNull()
  })
})

describe('toggleOrganization', () => {
  test('adds an organization that was out, at the end', () => {
    expect(toggleOrganization(['a'], 'b')).toEqual(['a', 'b'])
  })

  test('removes an organization that was in', () => {
    expect(toggleOrganization(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('assignLabel', () => {
  test('names one invitation in the singular, several by count', () => {
    expect(assignLabel(0)).toBe('Send invitation')
    expect(assignLabel(1)).toBe('Send invitation')
    expect(assignLabel(3)).toBe('Invite to 3 organizations')
  })
})

describe('invitationSummary', () => {
  const org = (name: string) => ({ id: name, name })

  test('says who was invited where, and what was skipped', () => {
    expect(
      invitationSummary('Ada', {
        invited: [org('Tech Vanguard')],
        alreadyInvited: [org('North')],
        alreadyMembers: [],
      }),
    ).toBe('Invitation sent to Ada for Tech Vanguard; already invited to North')
  })

  test('says why nothing was sent when every organization was skipped', () => {
    expect(
      invitationSummary('Ada', {
        invited: [],
        alreadyInvited: [org('North')],
        alreadyMembers: [org('South')],
      }),
    ).toBe('Ada is already invited to North, and already in South')
    expect(invitationSummary('Ada', { invited: [], alreadyInvited: [], alreadyMembers: [] })).toBe(
      'Ada was not invited to any organization',
    )
  })
})
