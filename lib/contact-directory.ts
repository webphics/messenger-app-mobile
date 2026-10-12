import { canHoldStaffDm, type StaffDmViewer } from '@/lib/rbac'
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
  /**
   * A Customer's support thread, from the staff side
   * (`POST /conversations/support/with-customer`): found or created, in the one
   * organization named or in whichever the API finds the two share.
   */
  | { kind: 'customer'; customerId: string; organizationId?: string }
  /**
   * Several organizations: the person picks which the conversation belongs to,
   * and `with` says which request the pick goes to. `generalSupport` is set for
   * an Admin choosing for a Customer, who is always asked, and may pick the
   * Customer's General Support instead of an organization.
   */
  | {
      kind: 'choose'
      userId: string
      with: 'staff-dm' | 'customer'
      organizations: Organization[]
      generalSupport?: true
    }
  /** A Customer's support thread with one company, created if it is their first. */
  | { kind: 'support'; organizationId: string }
  /** Nothing a tap can do, and why. */
  | { kind: 'unavailable'; reason: string }

/** What was picked from a `choose` intent: one organization, or General Support. */
export type ContactPick = { kind: 'organization'; id: string } | { kind: 'general-support' }

/**
 * What the staff directory says about this staff member, where the directory
 * has been read.
 *
 * Every contact row now carries its own `organizations`, and that is what a tap
 * reads. This is the fallback for a row that does not carry the field, from
 * `GET /conversations/staff`'s `sharedOrganizations`. Null is *not* the same as
 * an empty list: null is the staff directory not having answered — which it
 * never does for a Customer, who is refused it — and an empty list is a pair
 * who share no organization and can hold no DM at all.
 */
export type SharedOrganizations = Organization[] | null

/**
 * `viewer` is who is tapping, which `canHoldStaffDm` reads: `staff_dm` is
 * needed only for a DM between two agents, and without it
 * `POST /conversations/staff` refuses one. An Admin is always reachable, and an
 * Admin reaches anybody. A thread that already exists still opens; only a new
 * one is out of reach. Required, so a caller that forgets it fails to compile
 * rather than offering a DM the API would refuse.
 *
 * The organizations are the row's own (`GET /conversations/contacts`), and only
 * where the row carries none at all the staff directory's `shared`. With more
 * than one the person is asked which before anything opens, even when the row
 * names a thread: that thread is one organization's, and each of the others
 * holds its own. With exactly one, a new conversation is bound to it.
 */
export function contactIntent(
  contact: Contact,
  shared: SharedOrganizations,
  viewer: StaffDmViewer | null,
): ContactIntent {
  const organizations = contact.organizations ?? shared

  if (contact.kind === 'company') {
    if (contact.conversationId) return { kind: 'open', conversationId: contact.conversationId }
    // A company row is one organization, and its id is the organization's.
    return { kind: 'support', organizationId: contact.id }
  }

  if (contact.kind === 'customer') {
    // Staff are sent customer rows only while they hold `message_customers`, so
    // every one of these can be started; the API still judges the request.
    //
    // An Admin always picks where the chat happens, because besides each
    // organization's thread they may open the Customer's General Support, which
    // no Agent ever sees.
    if (viewer?.role === 'admin') {
      return {
        kind: 'choose',
        userId: contact.id,
        with: 'customer',
        organizations: organizations ?? [],
        generalSupport: true,
      }
    }
    if (organizations && organizations.length > 1) {
      return { kind: 'choose', userId: contact.id, with: 'customer', organizations }
    }
    if (contact.conversationId) return { kind: 'open', conversationId: contact.conversationId }
    if (organizations?.length === 0) {
      return { kind: 'unavailable', reason: 'You share no organization' }
    }
    const only = organizations?.[0]
    return only
      ? { kind: 'customer', customerId: contact.id, organizationId: only.id }
      : { kind: 'customer', customerId: contact.id }
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
   *
   * A thread the row already names still opens, here and below: only a new DM
   * is out of reach, so the choice of organization is too.
   */
  const role = contact.role === 'admin' || contact.role === 'agent' ? contact.role : null
  const canStart = role !== null && canHoldStaffDm(viewer, role)
  const choosing = canStart && organizations !== null && organizations.length > 1

  if (contact.conversationId && !choosing) {
    return { kind: 'open', conversationId: contact.conversationId }
  }

  if (role === null) {
    return { kind: 'unavailable', reason: 'Not a staff account' }
  }

  if (!canStart) {
    const reason =
      viewer?.role === 'agent' ? "You can't message other agents" : "You can't message staff"
    return { kind: 'unavailable', reason }
  }

  // The organization a DM binds to: one binds silently, several are a choice,
  // none means no DM can exist. `staffDmIntent` holds those rules for the staff
  // directory, and is reused rather than restated so the two screens cannot drift.
  const intent = staffDmIntent({
    id: contact.id,
    name: contact.name,
    role,
    sharedOrganizations: organizations,
  })

  if (intent.kind === 'impossible') {
    return { kind: 'unavailable', reason: 'You share no organization' }
  }
  if (intent.kind === 'choose') {
    return {
      kind: 'choose',
      userId: contact.id,
      with: 'staff-dm',
      organizations: intent.organizations,
    }
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
 * no support thread and no organization to start one in.
 *
 * Staff holding `message_customers` are sent Customers with a null
 * `conversationId` too, and `POST /conversations/support/with-customer` starts
 * one — but only in an organization the two share, so a Customer whose row
 * lists none could only ever read "unavailable". It is left out instead of
 * drawn as a dead row. A Customer viewer is never sent customer rows, so
 * nothing of theirs is narrowed.
 */
export function reachableContacts(contacts: Contact[]): Contact[] {
  return contacts.filter(
    (contact) =>
      contact.kind !== 'customer' ||
      contact.conversationId !== null ||
      contact.organizations?.length !== 0,
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
      return intent.generalSupport
        ? `Message ${contact.name}, choose an organization or General Support`
        : `Message ${contact.name}, choose an organization`
    case 'unavailable':
      return `${contact.name}, unavailable: ${intent.reason.toLowerCase()}`
    default:
      return `Message ${contact.name}`
  }
}
