import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createCustomInbox,
  deleteCustomInbox,
  listCustomInboxes,
  listOrganizations,
  updateCustomInbox,
} from '@/lib/org-api'
import { listMyOrganizations } from '@/lib/conversation-api'
import type { CustomInbox, Organization, UserRole } from '@/lib/types'

/**
 * The signed-in person's saved inboxes, and the organizations they may build
 * one out of.
 *
 * An inbox is a name and a set of organizations. It is not a second list: the
 * API already scoped `GET /conversations` by who is asking, so selecting one
 * narrows the rows already held — see `filterConversations`'s
 * `organizationIds`. That is why choosing an inbox costs no request and why a
 * phone with no signal can still switch between them.
 *
 * Which organizations may be named is the same rule the web client's manage
 * dialog uses: an Agent's own memberships, and for an Admin the whole list,
 * because an Admin's conversation scope is the whole list too. Asking an
 * Agent for `GET /organizations` would be a `403` nothing needs.
 *
 * Nothing here announces a failure. A saved inbox is a convenience over a
 * list that is already on screen, and an error strip above a working inbox
 * would be louder than what it is reporting; a fetch that failed leaves the
 * unified view, which is exactly what somebody with no inboxes has.
 */

export type CustomInboxesView = {
  inboxes: CustomInbox[]
  /** Which organizations a new inbox may name. */
  organizations: Organization[]
  /** The selected inbox, or null for the unified one. */
  selectedId: string | null
  select: (inboxId: string | null) => void
  /** The selected inbox's organizations, for `filterConversations`. */
  organizationIds: ReadonlySet<string> | null
  create: (name: string, organizationIds: string[]) => Promise<boolean>
  rename: (inbox: CustomInbox, name: string) => Promise<boolean>
  remove: (inbox: CustomInbox) => Promise<boolean>
  busy: boolean
}

export function useCustomInboxes(role: UserRole | null): CustomInboxesView {
  const [inboxes, setInboxes] = useState<CustomInbox[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const isStaff = role !== null && role !== 'customer'
  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!isStaff) return
    void listCustomInboxes().then((result) => {
      if (live.current && result.ok) setInboxes(result.value)
    })
  }, [isStaff])

  useEffect(() => {
    if (!isStaff) return
    const request = isAdmin
      ? listOrganizations().then((result) =>
          result.ok
            ? result.value.map((organization) => ({
                id: organization.id,
                name: organization.name,
              }))
            : null,
        )
      : listMyOrganizations().then((result) => (result.ok ? result.value : null))

    void request.then((value) => {
      if (live.current && value) setOrganizations(value)
    })
  }, [isAdmin, isStaff])

  /**
   * The selected inbox's organizations.
   *
   * Resolved from the list rather than held beside the selection, so an inbox
   * whose organizations were just edited narrows by the new set without the
   * selection being touched — and an id that no longer names an inbox falls
   * back to unified rather than to an empty screen.
   */
  const organizationIds = useMemo(() => {
    if (selectedId === null) return null
    const selected = inboxes.find((inbox) => inbox.id === selectedId)
    return selected ? new Set(selected.organizationIds) : null
  }, [inboxes, selectedId])

  const create = useCallback(async (name: string, organizationIds: string[]) => {
    setBusy(true)
    const result = await createCustomInbox(name, organizationIds)
    if (!live.current) return result.ok
    setBusy(false)
    if (result.ok) {
      setInboxes((held) => [...held, result.value])
      setSelectedId(result.value.id)
    }
    return result.ok
  }, [])

  const rename = useCallback(async (inbox: CustomInbox, name: string) => {
    setBusy(true)
    const result = await updateCustomInbox(inbox.id, { name })
    if (!live.current) return result.ok
    setBusy(false)
    if (result.ok) {
      const updated = result.value
      setInboxes((held) => held.map((row) => (row.id === updated.id ? updated : row)))
    }
    return result.ok
  }, [])

  const remove = useCallback(async (inbox: CustomInbox) => {
    setBusy(true)
    const result = await deleteCustomInbox(inbox.id)
    if (!live.current) return result.ok
    setBusy(false)
    if (result.ok) {
      setInboxes((held) => held.filter((row) => row.id !== inbox.id))
      // Selecting the inbox that has just gone would narrow to nothing.
      setSelectedId((current) => (current === inbox.id ? null : current))
    }
    return result.ok
  }, [])

  return {
    inboxes,
    organizations,
    selectedId,
    select: setSelectedId,
    organizationIds,
    create,
    rename,
    remove,
    busy,
  }
}
