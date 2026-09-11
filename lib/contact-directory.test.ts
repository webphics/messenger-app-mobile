import {
  contactChipLabel,
  contactChips,
  contactIntent,
  contactRowLabel,
  contactSubtitle,
  filterContacts,
  narrowContacts,
  sharedOrganizationsById,
} from '@/lib/contact-directory'
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

const TALO = { id: 'org-1', name: 'Talo' }
const NORTHWIND = { id: 'org-2', name: 'Northwind' }

describe('contactIntent', () => {
  test('a row naming a thread opens it, whatever kind the row is', () => {
    for (const kind of ['staff', 'customer', 'company'] as const) {
      expect(contactIntent(contact({ kind, conversationId: 'conv-1' }))).toEqual({
        kind: 'open',
        conversationId: 'conv-1',
      })
    }
  })

  test('a company with no thread is a support thread waiting to be created', () => {
    expect(contactIntent(contact({ kind: 'company', role: null, id: 'org-1' }))).toEqual({
      kind: 'support',
      organizationId: 'org-1',
    })
  })

  test('a customer nobody has written to is not something a tap can fix', () => {
    expect(contactIntent(contact({ kind: 'customer', role: 'customer' }))).toEqual({
      kind: 'unavailable',
      reason: 'No support thread yet',
    })
  })

  test('one shared organization binds the staff DM to it', () => {
    expect(contactIntent(contact(), [TALO])).toEqual({
      kind: 'staff-dm',
      userId: 'user-1',
      organizationId: 'org-1',
    })
  })

  test('several shared organizations are a choice, not a guess', () => {
    expect(contactIntent(contact(), [TALO, NORTHWIND])).toEqual({
      kind: 'choose',
      userId: 'user-1',
      organizations: [TALO, NORTHWIND],
    })
  })

  test('no shared organization means no staff DM can exist', () => {
    expect(contactIntent(contact(), [])).toEqual({
      kind: 'unavailable',
      reason: 'You share no organization',
    })
  })

  test('a directory that never answered leaves the binding to the API', () => {
    expect(contactIntent(contact(), null)).toEqual({ kind: 'staff-dm', userId: 'user-1' })
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
    const intent = contactIntent(row)
    expect(contactSubtitle(row, intent)).toBe('No support thread yet')
    expect(contactRowLabel(row, intent)).toBe('Jonah Reed, unavailable: no support thread yet')
  })

  test('a row with a thread promises to open it, not to start one', () => {
    const row = contact({ conversationId: 'conv-1' })
    expect(contactRowLabel(row, contactIntent(row))).toBe('Open conversation with Jonah Reed')
  })

  test('a row with a choice behind it says so', () => {
    const row = contact()
    const intent = contactIntent(row, [TALO, NORTHWIND])
    expect(contactRowLabel(row, intent)).toBe('Message Jonah Reed, choose an organization')
  })

  test('a company reads as a company rather than as a missing role', () => {
    const row = contact({ kind: 'company', role: null })
    expect(contactSubtitle(row, contactIntent(row))).toBe('Company')
  })
})
