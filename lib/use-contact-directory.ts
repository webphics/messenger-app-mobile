import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createStaffDm,
  ensureSupportConversation,
  listContacts,
  listStaffDirectory,
} from '@/lib/conversation-api'
import { failureNotice } from '@/lib/conversation-failure'
import {
  contactIntent,
  filterContacts,
  sharedOrganizationsById,
  type ContactIntent,
  type SharedOrganizations,
} from '@/lib/contact-directory'
import { useConversationInbox } from '@/lib/conversation-inbox'
import type { Contact, UserRole } from '@/lib/types'

/**
 * The contact directory, loaded, and what a tap on one of its rows does.
 *
 * Shared by the two screens that read it — the People tab and the compose
 * sheet — because they are the same list with the same taps behind it and the
 * only difference is where the thread opens afterwards. Splitting them would
 * be two copies of the get-or-create rules, which is exactly the drift
 * `lib/contact-directory` exists to prevent.
 *
 * Two requests, not one. `GET /conversations/contacts` is the list and answers
 * for every role; `GET /conversations/staff` is what names the organizations a
 * pair share, which is what a staff DM binds to and which the contacts payload
 * does not carry. The second is staff-only — a Customer is refused it — and it
 * is allowed to fail on its own: a directory that never answered leaves the
 * binding to the API, which is a decision `contactIntent` already knows how to
 * take.
 */

const NO_CONTACTS: Contact[] = []
const NO_SHARED: ReadonlyMap<string, SharedOrganizations> = new Map()

export type ContactDirectory =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; contacts: Contact[] }

export type ContactDirectoryView = {
  directory: ContactDirectory
  /** Everything loaded, narrowed by the search field and nothing else. */
  contacts: Contact[]
  /** What a tap on this row would do, with the staff directory folded in. */
  intentFor: (contact: Contact) => ContactIntent
  query: string
  setQuery: (query: string) => void
  /** Visibly resets to loading first, unlike the load on mount. */
  retry: () => void
  refreshing: boolean
  refresh: () => void
  /**
   * Carry out what a tap means. Answers nothing; the outcome arrives as state,
   * and the thread that came of it is handed to `onOpen` by id.
   */
  start: (contact: Contact, organizationId?: string) => void
  /** Whose request is out, so a second tap cannot start a second one. */
  busyId: string | null
  /** Whose request was refused, and what the API said about it. */
  refusal: { id: string; message: string } | null
}

export function useContactDirectory(
  role: UserRole | null,
  onOpen: (conversationId: string) => void,
): ContactDirectoryView {
  const { addConversation } = useConversationInbox()
  const [directory, setDirectory] = useState<ContactDirectory>({ status: 'loading' })
  const [shared, setShared] = useState<ReadonlyMap<string, SharedOrganizations>>(NO_SHARED)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ id: string; message: string } | null>(null)

  /** Which load the answer coming back belongs to. A retry mid-flight wins. */
  const generation = useRef(0)
  const isStaff = role !== null && role !== 'customer'

  const load = useCallback(() => {
    const mine = (generation.current += 1)

    void Promise.all([
      listContacts(),
      // A Customer is refused this, so it is not asked for: a 403 nothing reads
      // is still a round trip on a phone's connection.
      isStaff ? listStaffDirectory() : Promise.resolve(null),
    ]).then(([contacts, staff]) => {
      if (generation.current !== mine) return
      setRefreshing(false)

      if (staff?.ok) setShared(sharedOrganizationsById(staff.value))

      if (contacts.ok) {
        setDirectory({ status: 'ready', contacts: contacts.value })
        return
      }
      const notice = failureNotice(contacts.failure, 'Could not load your contacts')
      setDirectory({ status: 'failed', title: notice.title, hint: notice.hint })
    })
  }, [isStaff])

  useEffect(() => {
    load()
    return () => {
      generation.current += 1
    }
  }, [load])

  const retry = useCallback(() => {
    setDirectory({ status: 'loading' })
    load()
  }, [load])

  /** Pull-to-refresh, which keeps what is on screen rather than blanking it. */
  const refresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const all = directory.status === 'ready' ? directory.contacts : NO_CONTACTS
  const contacts = useMemo(() => filterContacts(all, query), [all, query])

  const intentFor = useCallback(
    (contact: Contact) => contactIntent(contact, shared.get(contact.id) ?? null),
    [shared],
  )

  const start = useCallback(
    (contact: Contact, organizationId?: string) => {
      const intent = contactIntent(contact, shared.get(contact.id) ?? null)

      if (intent.kind === 'unavailable') return
      if (intent.kind === 'open') {
        // Nothing to create and nothing that can fail: the API already said
        // this thread exists, so the tap is a navigation.
        onOpen(intent.conversationId)
        return
      }

      setBusyId(contact.id)
      setRefusal(null)

      void (async () => {
        const result =
          intent.kind === 'support'
            ? await ensureSupportConversation(intent.organizationId)
            : intent.kind === 'choose'
              ? await createStaffDm(intent.userId, organizationId)
              : await createStaffDm(intent.userId, intent.organizationId)

        setBusyId(null)
        if (!result.ok) {
          setRefusal({ id: contact.id, message: failureNotice(result.failure).hint })
          return
        }

        // Straight into the shared list rather than through a refetch: the API
        // has just handed the row over, and the largest request in the app
        // between the tap and the thread is the thing this avoids.
        addConversation(result.value)
        onOpen(result.value.id)
      })()
    },
    [addConversation, onOpen, shared],
  )

  return {
    directory,
    contacts,
    intentFor,
    query,
    setQuery,
    retry,
    refreshing,
    refresh,
    start,
    busyId,
    refusal,
  }
}
