import { staffDmIntent } from '@/lib/staff-directory'
import type {
  Contact,
  ContactKind,
  Organization,
  StaffDirectoryUser,
  UserRole,
} from '@/lib/types'

/**
 * Reading the contact directory: who is in it, and what a tap on a name does.
 *
 * `GET /conversations/contacts` is the one endpoint that answers for all three
 * roles, and every row it sends already names the conversation that exists
 * between the two where one does. So most taps are a navigation and the rest
 * are a get-or-create — and which of the two, and with what, is the whole of
 * this module.
 *
 * Pure, and separate from the screen, because the interesting part is a table:
 * a company with no thread yet, a staff member the viewer shares one
 * organization with, a staff member they share several with, a Customer nobody
 * has ever written to. Each of those is a different sentence on the row and a
 * different request behind it, and none of them needs a running API to
 * demonstrate.
 */

/** What tapping a contact does next. */
export type ContactIntent =
  /** A thread already exists. Nothing to create; open it. */
  | { kind: 'open'; conversationId: string }
  /** A staff DM, bound to the one organization named or to whichever the API picks. */
  | { kind: 'staff-dm'; userId: string; organizationId?: string }
  /** Several shared organizations: the person picks which the DM belongs to. */
  | { kind: 'choose'; userId: string; organizations: Organization[] }
  /** A Customer's support thread with one company, created if it is their first. */
  | { kind: 'support'; organizationId: string }
  /** Nothing a tap can do, and why. */
  | { kind: 'unavailable'; reason: string }

/**
 * What the directory says about this staff member, where the directory has been
 * read.
 *
 * `GET /conversations/contacts` does not carry `sharedOrganizations` and
 * `GET /conversations/staff` does, so the People screen reads both and this is
 * how the second reaches the first. Null is *not* the same as an empty list:
 * null is the staff directory not having answered — which it never does for a
 * Customer, who is refused it — and an empty list is a pair who share no
 * organization and can hold no DM at all.
 */
export type SharedOrganizations = Organization[] | null

/**
 * `canStartStaffDm` is whether the viewer holds `staff_dm`, without which
 * `POST /conversations/staff` refuses them. A thread that already exists still
 * opens; only a new one is out of reach. Required, so a caller that forgets it
 * fails to compile rather than offering a DM the API would refuse.
 */
export function contactIntent(
  contact: Contact,
  shared: SharedOrganizations,
  canStartStaffDm: boolean,
): ContactIntent {
  // The API already resolved this, for every kind. A row that names a thread is
  // a row with nothing left to decide, and that includes a Customer — whose
  // support thread the viewer can open but could never create.
  if (contact.conversationId) {
    return { kind: 'open', conversationId: contact.conversationId }
  }

  if (contact.kind === 'company') {
    // A company row is one organization, and its id is the organization's.
    return { kind: 'support', organizationId: contact.id }
  }

  // `reachableContacts` keeps these off the screen; this answers for a caller
  // that did not narrow first, rather than offering a create nothing backs.
  if (contact.kind === 'customer') {
    return { kind: 'unavailable', reason: 'No support thread yet' }
  }

  /*
   * A staff-kind row whose role is not one of the two that can hold a DM.
   *
   * `getOrCreateStaffDm` refuses a target that is not an admin or an agent. It
   * answers `conversationNotFoundError`, which would reach somebody as a bare
   * "not found" about a person plainly in front of them. `toContact` calls
   * every non-Customer `staff`, so a role this client could not read arrives
   * here as null on a row that looks like a colleague, and is refused: this
   * client knows which roles the API accepts, and a role it has never heard of
   * is not one of them.
   */
  if (contact.role !== 'admin' && contact.role !== 'agent') {
    return { kind: 'unavailable', reason: 'Not a staff account' }
  }

  if (!canStartStaffDm) {
    return { kind: 'unavailable', reason: "You can't message staff" }
  }

  // Staff, with no thread yet. The organization a DM binds to is the staff
  // directory's answer, and the rules for reading it already exist — one binds
  // silently, several are a choice, none means no DM can exist. Reused rather
  // than restated so the two screens cannot drift.
  const intent = staffDmIntent({
    id: contact.id,
    name: contact.name,
    role: contact.role,
    sharedOrganizations: shared,
  })

  if (intent.kind === 'impossible') {
    return { kind: 'unavailable', reason: 'You share no organization' }
  }
  if (intent.kind === 'choose') {
    return { kind: 'choose', userId: contact.id, organizations: intent.organizations }
  }
  return intent.organizationId === undefined
    ? { kind: 'staff-dm', userId: contact.id }
    : { kind: 'staff-dm', userId: contact.id, organizationId: intent.organizationId }
}

/**
 * The shared organizations the staff directory reported for each person, by id.
 *
 * Built once per directory rather than searched per row: an Admin's contact
 * list is the whole user table, and a linear scan inside a `renderItem` is the
 * one place that cost lands on a scroll.
 */
export function sharedOrganizationsById(
  directory: StaffDirectoryUser[],
): ReadonlyMap<string, SharedOrganizations> {
  return new Map(directory.map((user) => [user.id, user.sharedOrganizations]))
}

/**
 * The rows a tap can do something with, which is every row but a Customer with
 * no support thread.
 *
 * Staff holding `message_customers` are sent those Customers too, with a null
 * `conversationId`. Starting a conversation with a Customer is web-only — this
 * client has no request for it — so such a row could only ever read
 * "unavailable". It is left out instead of drawn as a dead row. A Customer
 * viewer is never sent customer rows, so nothing of theirs is narrowed.
 */
export function reachableContacts(contacts: Contact[]): Contact[] {
  return contacts.filter(
    (contact) => contact.kind !== 'customer' || contact.conversationId !== null,
  )
}

/** The directory as the search field leaves it. Matches a name or a role. */
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase()
  if (!q) return contacts
  return contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(q) ||
      (contact.role ?? contact.kind).toLowerCase().includes(q),
  )
}

/** Which kinds a screen offers to narrow by, in the order they are offered. */
export type ContactChip = 'all' | ContactKind

/** Only the kinds actually present, so nobody is offered a filter that empties the list. */
export function contactChips(contacts: Contact[]): ContactChip[] {
  const present = new Set(contacts.map((contact) => contact.kind))
  const ordered: ContactKind[] = ['staff', 'customer', 'company']
  const kinds = ordered.filter((kind) => present.has(kind))
  // One kind is not a choice: a chip row offering "All" and the only thing
  // there is narrows nothing.
  return kinds.length > 1 ? ['all', ...kinds] : []
}

export function narrowContacts(contacts: Contact[], chip: ContactChip): Contact[] {
  return chip === 'all' ? contacts : contacts.filter((contact) => contact.kind === chip)
}

const CHIP_LABEL: Record<ContactChip, string> = {
  all: 'All',
  staff: 'Team',
  customer: 'Customers',
  company: 'Companies',
}

export function contactChipLabel(chip: ContactChip): string {
  return CHIP_LABEL[chip]
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  agent: 'Agent',
  customer: 'Customer',
}

/**
 * What to say under a name.
 *
 * The role where the row has one, and the kind where it does not — a company is
 * an organization rather than somebody, so "company" is the truest thing about
 * it. A row a tap cannot act on says why instead, because that is the more
 * useful of the two facts.
 *
 * Every role is spelled out rather than defaulted. This used to end
 * `: 'Customer'`, which meant a role the client did not recognise was labelled
 * as the one role it is least likely to be. A row that cannot say what
 * somebody is says nothing rather than guessing.
 */
export function contactSubtitle(contact: Contact, intent: ContactIntent): string {
  if (intent.kind === 'unavailable') return intent.reason
  if (contact.kind === 'company') return 'Company'
  return contact.role === null ? '' : ROLE_LABEL[contact.role]
}

/**
 * What the row's accessible name promises, which is what its tap does.
 *
 * Four different actions wear the same row — opening a thread, starting one,
 * opening the organizations to choose between, and nothing at all — and a
 * single "Message …" would be a promise two of them do not keep.
 */
export function contactRowLabel(contact: Contact, intent: ContactIntent): string {
  switch (intent.kind) {
    case 'open':
      return `Open conversation with ${contact.name}`
    case 'choose':
      return `Message ${contact.name}, choose an organization`
    case 'unavailable':
      return `${contact.name}, unavailable: ${intent.reason.toLowerCase()}`
    default:
      return `Message ${contact.name}`
  }
}
