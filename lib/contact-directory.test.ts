import {
  contactIntent,
  reachableContacts,
  sharedOrganizationsById,
} from '@/lib/contact-directory'
import type { StaffDmViewer } from '@/lib/rbac'
import type { Contact, StaffDirectoryUser } from '@/lib/types'

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'user-1',
    name: 'Jonah Reed',
    kind: 'staff',
    role: 'agent',
    conversationId: null,
    organizations: null,
    ...overrides,
  }
}

const AGENT_WITH_STAFF_DM: StaffDmViewer = { role: 'agent', capabilities: ['staff_dm'] }
const AGENT_WITHOUT_STAFF_DM: StaffDmViewer = { role: 'agent', capabilities: [] }

const TALO = { id: 'org-1', name: 'Talo' }
const NORTHWIND = { id: 'org-2', name: 'Northwind' }

describe('contactIntent', () => {
  test('a row naming a thread and no choice of organization opens it, whatever kind the row is', () => {
    for (const kind of ['staff', 'customer', 'company'] as const) {
      expect(contactIntent(contact({ kind, conversationId: 'conv-1' }), null, AGENT_WITH_STAFF_DM)).toEqual({
        kind: 'open',
        conversationId: 'conv-1',
      })
    }
  })

  test('a company with no thread is a support thread waiting to be created', () => {
    const company = contact({ kind: 'company', role: null, id: 'org-1' })
    expect(contactIntent(company, null, AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'support',
      organizationId: 'org-1',
    })
  })

  test('one shared organization binds the staff DM to it', () => {
    expect(contactIntent(contact(), [TALO], AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'staff-dm',
      userId: 'user-1',
      organizationId: 'org-1',
    })
  })

  test('several shared organizations are a choice, not a guess', () => {
    expect(contactIntent(contact(), [TALO, NORTHWIND], AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'choose',
      userId: 'user-1',
      with: 'staff-dm',
      organizations: [TALO, NORTHWIND],
    })
  })

  test('no shared organization means no staff DM can exist', () => {
    expect(contactIntent(contact(), [], AGENT_WITH_STAFF_DM).kind).toBe('unavailable')
  })

  test('an agent without staff_dm cannot start a DM with another agent, but can with an admin', () => {
    expect(contactIntent(contact(), [TALO], AGENT_WITHOUT_STAFF_DM).kind).toBe('unavailable')
    expect(contactIntent(contact({ role: 'admin' }), [TALO], AGENT_WITHOUT_STAFF_DM).kind).toBe(
      'staff-dm',
    )
  })

  test('nobody signed in cannot start a staff DM', () => {
    expect(contactIntent(contact({ role: 'admin' }), [TALO], null).kind).toBe('unavailable')
  })

  // getOrCreateStaffDm refuses any target that is not an admin or an agent, so offering it always 404s.
  test('a role the client has never heard of cannot be sent a staff DM', () => {
    expect(contactIntent(contact({ kind: 'staff', role: null }), [TALO], AGENT_WITH_STAFF_DM).kind).toBe(
      'unavailable',
    )
  })
})

describe("contactIntent, reading the row's own organizations", () => {
  const customer = (overrides: Partial<Contact> = {}) =>
    contact({ id: 'cust-1', kind: 'customer', role: 'customer', ...overrides })

  test("the row's organizations win over the staff directory", () => {
    expect(contactIntent(contact({ organizations: [TALO] }), [TALO, NORTHWIND], AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'staff-dm',
      userId: 'user-1',
      organizationId: 'org-1',
    })
    expect(contactIntent(contact({ organizations: [] }), [TALO], AGENT_WITH_STAFF_DM).kind).toBe('unavailable')
  })

  test('a staff member in several organizations is a choice even when a thread exists', () => {
    expect(
      contactIntent(
        contact({ conversationId: 'conv-1', organizations: [TALO, NORTHWIND] }),
        null,
        AGENT_WITH_STAFF_DM,
      ),
    ).toEqual({ kind: 'choose', userId: 'user-1', with: 'staff-dm', organizations: [TALO, NORTHWIND] })
  })

  test('a staff thread still opens when no new DM could be started in another organization', () => {
    expect(
      contactIntent(
        contact({ conversationId: 'conv-1', organizations: [TALO, NORTHWIND] }),
        null,
        AGENT_WITHOUT_STAFF_DM,
      ),
    ).toEqual({ kind: 'open', conversationId: 'conv-1' })
  })

  test('a staff thread in the one organization opens', () => {
    expect(
      contactIntent(contact({ conversationId: 'conv-1', organizations: [TALO] }), null, AGENT_WITH_STAFF_DM),
    ).toEqual({ kind: 'open', conversationId: 'conv-1' })
  })

  test('a customer in several organizations is a choice even when a thread exists', () => {
    for (const conversationId of [null, 'conv-1']) {
      expect(
        contactIntent(customer({ conversationId, organizations: [TALO, NORTHWIND] }), null, AGENT_WITH_STAFF_DM),
      ).toEqual({ kind: 'choose', userId: 'cust-1', with: 'customer', organizations: [TALO, NORTHWIND] })
    }
  })

  test('a customer in one organization opens its thread, or starts one there', () => {
    expect(
      contactIntent(customer({ conversationId: 'conv-1', organizations: [TALO] }), null, AGENT_WITH_STAFF_DM),
    ).toEqual({ kind: 'open', conversationId: 'conv-1' })
    expect(contactIntent(customer({ organizations: [TALO] }), null, AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'customer',
      customerId: 'cust-1',
      organizationId: 'org-1',
    })
  })

  test('a customer with no thread and no organizations named leaves the binding to the API', () => {
    expect(contactIntent(customer(), null, AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'customer',
      customerId: 'cust-1',
    })
  })

  test('an Admin messaging a customer is always asked, with General Support offered', () => {
    const ADMIN: StaffDmViewer = { role: 'admin', capabilities: [] }
    for (const conversationId of [null, 'conv-1']) {
      expect(contactIntent(customer({ conversationId, organizations: [TALO] }), null, ADMIN)).toEqual({
        kind: 'choose',
        userId: 'cust-1',
        with: 'customer',
        organizations: [TALO],
        generalSupport: true,
      })
    }
    expect(contactIntent(customer({ organizations: [] }), null, ADMIN)).toEqual({
      kind: 'choose',
      userId: 'cust-1',
      with: 'customer',
      organizations: [],
      generalSupport: true,
    })
  })

  test('an Agent is never offered General Support', () => {
    const intent = contactIntent(
      customer({ organizations: [TALO, NORTHWIND] }),
      null,
      AGENT_WITH_STAFF_DM,
    )
    expect(intent.kind === 'choose' && intent.generalSupport).toBeFalsy()
  })

  test('a customer sharing no organization cannot be started', () => {
    expect(contactIntent(customer({ organizations: [] }), null, AGENT_WITH_STAFF_DM).kind).toBe('unavailable')
  })

  test('a company row is one organization and never a choice', () => {
    const company = contact({ kind: 'company', role: null, id: 'org-1', organizations: [TALO] })
    expect(contactIntent(company, null, null)).toEqual({ kind: 'support', organizationId: 'org-1' })
  })
})

describe('sharedOrganizationsById', () => {
  test('an empty list and an unanswered directory stay different', () => {
    const directory: StaffDirectoryUser[] = [
      { id: 'a', name: 'A', role: 'agent', sharedOrganizations: [] },
      { id: 'b', name: 'B', role: 'admin', sharedOrganizations: null },
    ]
    const shared = sharedOrganizationsById(directory)
    expect(shared.get('a')).toEqual([])
    expect(shared.get('b')).toBeNull()
    expect(shared.get('c')).toBeUndefined()
  })
})

describe('reachableContacts', () => {
  test('drops a Customer with no thread and no organization to start one in, keeping the order of the rest', () => {
    const first = contact({ id: 'a' })
    const dead = contact({ id: 'b', kind: 'customer', role: 'customer', organizations: [] })
    const last = contact({ id: 'c', kind: 'customer', role: 'customer', conversationId: 'conv-1', organizations: [] })
    expect(reachableContacts([first, dead, last])).toEqual([first, last])
  })

  test('keeps a Customer with no thread yet, since one can be started', () => {
    const shared = contact({ id: 'b', kind: 'customer', role: 'customer', organizations: [TALO] })
    const unsaid = contact({ id: 'c', kind: 'customer', role: 'customer' })
    expect(reachableContacts([shared, unsaid])).toEqual([shared, unsaid])
  })
})
