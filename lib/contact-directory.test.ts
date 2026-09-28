import {
  contactChipLabel,
  contactChips,
  contactIntent,
  contactRowLabel,
  contactSubtitle,
  filterContacts,
  narrowContacts,
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
    ...overrides,
  }
}

const AGENT_WITH_STAFF_DM: StaffDmViewer = { role: 'agent', capabilities: ['staff_dm'] }
const AGENT_WITHOUT_STAFF_DM: StaffDmViewer = { role: 'agent', capabilities: [] }
const ADMIN_WITHOUT_STAFF_DM: StaffDmViewer = { role: 'admin', capabilities: [] }

const TALO = { id: 'org-1', name: 'Talo' }
const NORTHWIND = { id: 'org-2', name: 'Northwind' }

describe('contactIntent', () => {
  test('a row naming a thread opens it, whatever kind the row is', () => {
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

  test('a customer nobody has written to is not something a tap can fix', () => {
    expect(contactIntent(contact({ kind: 'customer', role: 'customer' }), null, AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'unavailable',
      reason: 'No support thread yet',
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
      organizations: [TALO, NORTHWIND],
    })
  })

  test('no shared organization means no staff DM can exist', () => {
    expect(contactIntent(contact(), [], AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'unavailable',
      reason: 'You share no organization',
    })
  })

  test('a directory that never answered leaves the binding to the API', () => {
    expect(contactIntent(contact(), null, AGENT_WITH_STAFF_DM)).toEqual({ kind: 'staff-dm', userId: 'user-1' })
  })

  test('an agent without staff_dm cannot start a DM with another agent', () => {
    expect(contactIntent(contact(), [TALO], AGENT_WITHOUT_STAFF_DM)).toEqual({
      kind: 'unavailable',
      reason: "You can't message other agents",
    })
  })

  test('an agent without staff_dm can still start a DM with an admin', () => {
    expect(contactIntent(contact({ role: 'admin' }), [TALO], AGENT_WITHOUT_STAFF_DM)).toEqual({
      kind: 'staff-dm',
      userId: 'user-1',
      organizationId: 'org-1',
    })
  })

  test('an admin without staff_dm can start a DM with an agent', () => {
    expect(contactIntent(contact(), [TALO], ADMIN_WITHOUT_STAFF_DM)).toEqual({
      kind: 'staff-dm',
      userId: 'user-1',
      organizationId: 'org-1',
    })
  })

  test('nobody signed in cannot start a staff DM', () => {
    expect(contactIntent(contact({ role: 'admin' }), [TALO], null)).toEqual({
      kind: 'unavailable',
      reason: "You can't message staff",
    })
  })

  test('without staff_dm an existing thread still opens', () => {
    expect(contactIntent(contact({ conversationId: 'conv-1' }), [TALO], AGENT_WITHOUT_STAFF_DM)).toEqual({
      kind: 'open',
      conversationId: 'conv-1',
    })
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
    // Absent, which is a third thing again: this person was not in the directory.
    expect(shared.get('c')).toBeUndefined()
  })
})

describe('reachableContacts', () => {
  test.each<[string, Contact, boolean]>([
    ['a Customer with a support thread', contact({ kind: 'customer', role: 'customer', conversationId: 'conv-1' }), true],
    ['a Customer with no support thread', contact({ kind: 'customer', role: 'customer' }), false],
    ['a colleague with no thread yet', contact(), true],
    ['a colleague with a thread', contact({ conversationId: 'conv-2' }), true],
    ['a company with no thread yet', contact({ kind: 'company', role: null, id: 'org-1' }), true],
    ['a company with a thread', contact({ kind: 'company', role: null, id: 'org-1', conversationId: 'conv-3' }), true],
  ])('%s: kept %s', (_label, row, kept) => {
    expect(reachableContacts([row])).toEqual(kept ? [row] : [])
  })

  test('keeps the order of what it keeps', () => {
    const first = contact({ id: 'a' })
    const dead = contact({ id: 'b', kind: 'customer', role: 'customer' })
    const last = contact({ id: 'c', kind: 'customer', role: 'customer', conversationId: 'conv-1' })
    expect(reachableContacts([first, dead, last])).toEqual([first, last])
  })
})

describe('filterContacts', () => {
  const people = [
    contact({ id: 'a', name: 'Jonah Reed', role: 'agent' }),
    contact({ id: 'b', name: 'Priya Raman', role: 'admin' }),
    contact({ id: 'c', name: 'Talo', kind: 'company', role: null }),
  ]

  test('an empty query keeps everyone, and the same array', () => {
    expect(filterContacts(people, '  ')).toBe(people)
  })

  test('a name matches case-insensitively', () => {
    expect(filterContacts(people, 'priya').map((row) => row.id)).toEqual(['b'])
  })

  test('a role matches, and a company falls back to its kind', () => {
    expect(filterContacts(people, 'admin').map((row) => row.id)).toEqual(['b'])
    expect(filterContacts(people, 'company').map((row) => row.id)).toEqual(['c'])
  })
})

describe('contactChips', () => {
  test('one kind is not a choice', () => {
    expect(contactChips([contact(), contact({ id: 'b' })])).toEqual([])
  })

  test('only the kinds actually present are offered, in a fixed order', () => {
    const rows = [
      contact({ id: 'a', kind: 'customer', role: 'customer' }),
      contact({ id: 'b', kind: 'staff' }),
    ]
    expect(contactChips(rows)).toEqual(['all', 'staff', 'customer'])
  })

  test('every chip has a label', () => {
    for (const chip of contactChips([
      contact({ id: 'a', kind: 'staff' }),
      contact({ id: 'b', kind: 'customer', role: 'customer' }),
      contact({ id: 'c', kind: 'company', role: null }),
    ])) {
      expect(contactChipLabel(chip)).not.toBe('')
    }
  })
})

describe('narrowContacts', () => {
  const rows = [contact({ id: 'a' }), contact({ id: 'b', kind: 'customer', role: 'customer' })]

  test('All keeps the array it was handed', () => {
    expect(narrowContacts(rows, 'all')).toBe(rows)
  })

  test('a kind keeps only that kind', () => {
    expect(narrowContacts(rows, 'customer').map((row) => row.id)).toEqual(['b'])
  })
})

describe('what a row says', () => {
  test('an unavailable row says why rather than what it is', () => {
    const row = contact({ kind: 'customer', role: 'customer' })
    const intent = contactIntent(row, null, AGENT_WITH_STAFF_DM)
    expect(contactSubtitle(row, intent)).toBe('No support thread yet')
    expect(contactRowLabel(row, intent)).toBe('Jonah Reed, unavailable: no support thread yet')
  })

  test('a row with a thread promises to open it, not to start one', () => {
    const row = contact({ conversationId: 'conv-1' })
    expect(contactRowLabel(row, contactIntent(row, null, AGENT_WITH_STAFF_DM))).toBe(
      'Open conversation with Jonah Reed',
    )
  })

  test('a row with a choice behind it says so', () => {
    const row = contact()
    const intent = contactIntent(row, [TALO, NORTHWIND], AGENT_WITH_STAFF_DM)
    expect(contactRowLabel(row, intent)).toBe('Message Jonah Reed, choose an organization')
  })

  test('a company reads as a company rather than as a missing role', () => {
    const row = contact({ kind: 'company', role: null })
    expect(contactSubtitle(row, contactIntent(row, null, AGENT_WITH_STAFF_DM))).toBe('Company')
  })
})

/**
 * A staff-kind row whose role this client could not read arrives with a null
 * role, and `getOrCreateStaffDm` refuses any target that is not an admin or an
 * agent, so offering the DM would be offering a request that always 404s.
 */
describe('a role this app does not route on', () => {
  test('a role the client has never heard of cannot be sent a staff DM', () => {
    const row = contact({ kind: 'staff', role: null })
    expect(contactIntent(row, [TALO], AGENT_WITH_STAFF_DM)).toEqual({
      kind: 'unavailable',
      reason: 'Not a staff account',
    })
  })

  test('a row whose role never arrived says nothing rather than guessing', () => {
    const row = contact({ kind: 'staff', role: null, conversationId: 'conv-1' })
    expect(contactSubtitle(row, contactIntent(row, null, AGENT_WITH_STAFF_DM))).toBe('')
  })
})
