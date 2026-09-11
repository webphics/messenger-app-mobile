import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApiFailure, ApiResult } from '@/lib/api-result'
import { failureNotice } from '@/lib/conversation-failure'
import {
  inviteToOrganizations,
  listOrganizations,
  removeMembership,
} from '@/lib/org-api'
import {
  banUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  resetUserTwoFactor,
  revokeUserSessions,
  setUserRole,
  unbanUser,
} from '@/lib/user-api'
import type { ManagedUser, OrganizationSummary, UserRole } from '@/lib/types'

/**
 * The Admin user directory, loaded, and every action on a row.
 *
 * One hook rather than one per action, because they are one screen and share
 * its shape: each is a request about a single person, each disables that
 * person's row while it is out, and each ends by either replacing that row or
 * saying what the API refused. Spreading eight of those across eight hooks
 * would be eight copies of the same three pieces of state.
 *
 * Two kinds of answer come back. Most routes answer with the whole user, so
 * the row is replaced in place and the directory never refetches; the rest —
 * a session revocation, a two-factor reset, a password reset — answer with a
 * count nobody reads, so what follows them is a reload of that row's page,
 * because the session count on it has just changed.
 *
 * The search is debounced and sent to the API rather than applied here: the
 * user table is the one list in this app that a phone has no business
 * narrowing for itself.
 */

const SEARCH_DEBOUNCE_MS = 300

export type UserDirectory =
  | { status: 'loading' }
  | { status: 'failed'; title: string; hint: string }
  | { status: 'ready'; users: ManagedUser[] }

/** What every action on a row reports back, in the words a screen prints. */
function refusal(failure: ApiFailure, fallback: string): string | null {
  if (failure.kind === 'refused') return failure.message
  if (failure.kind === 'unreachable') return 'No connection. Try again.'
  if (failure.kind === 'unauthorised') return null
  return fallback
}

export type UserDirectoryView = {
  directory: UserDirectory
  /** What the search field holds, which is ahead of what has been asked for. */
  query: string
  setQuery: (query: string) => void
  roleFilter: UserRole | 'all'
  setRoleFilter: (role: UserRole | 'all') => void
  bannedOnly: boolean
  setBannedOnly: (bannedOnly: boolean) => void
  /** Every organization, for the invite control and the create sheet. */
  organizations: OrganizationSummary[]
  reload: () => void
  refreshing: boolean
  refresh: () => void
  /** Whose row has a request out, so it can say it is working. */
  busyId: string | null
  /** Whose row was refused, and what the API said. */
  refusal: { id: string; message: string } | null
  changeRole: (user: ManagedUser, role: UserRole) => void
  ban: (user: ManagedUser, reason?: string) => void
  unban: (user: ManagedUser) => void
  revokeSessions: (user: ManagedUser) => void
  resetTwoFactor: (user: ManagedUser) => void
  resetPassword: (user: ManagedUser, password: string) => void
  invite: (user: ManagedUser, organizationIds: string[]) => void
  /** Take somebody out of one organization. Immediate, unlike putting them in. */
  removeFromOrganization: (user: ManagedUser, organizationId: string) => void
  remove: (user: ManagedUser) => void
  /** Put a freshly created account at the top, without refetching the page. */
  add: (user: ManagedUser) => void
}

export function useUserDirectory(): UserDirectoryView {
  const [directory, setDirectory] = useState<UserDirectory>({ status: 'loading' })
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [bannedOnly, setBannedOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refusalState, setRefusal] = useState<{ id: string; message: string } | null>(null)

  /** Which load the answer coming back belongs to. A filter changed mid-flight wins. */
  const generation = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const filter = useMemo(
    () => ({
      search: debounced,
      roles: roleFilter === 'all' ? undefined : [roleFilter],
      isBanned: bannedOnly ? true : undefined,
    }),
    [bannedOnly, debounced, roleFilter],
  )

  const load = useCallback(() => {
    const mine = (generation.current += 1)
    void listUsers(filter).then((result) => {
      if (generation.current !== mine) return
      setRefreshing(false)
      if (result.ok) {
        setDirectory({ status: 'ready', users: result.value })
        return
      }
      const notice = failureNotice(result.failure, 'Could not load the directory')
      setDirectory({ status: 'failed', title: notice.title, hint: notice.hint })
    })
  }, [filter])

  useEffect(() => {
    load()
    return () => {
      generation.current += 1
    }
  }, [load])

  /**
   * The organizations, once. They are what the invite control and the create
   * sheet offer, they change far less often than the directory does, and
   * fetching them with every keystroke's worth of search would be a second
   * request nothing on screen had changed for.
   */
  useEffect(() => {
    let live = true
    void listOrganizations().then((result) => {
      if (live && result.ok) setOrganizations(result.value)
    })
    return () => {
      live = false
    }
  }, [])

  const reload = useCallback(() => {
    setDirectory({ status: 'loading' })
    load()
  }, [load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const replace = useCallback((user: ManagedUser) => {
    setDirectory((held) =>
      held.status === 'ready'
        ? {
            status: 'ready',
            users: held.users.map((row) => (row.id === user.id ? user : row)),
          }
        : held,
    )
  }, [])

  const add = useCallback((user: ManagedUser) => {
    setDirectory((held) =>
      held.status === 'ready'
        ? { status: 'ready', users: [user, ...held.users] }
        : { status: 'ready', users: [user] },
    )
  }, [])

  const drop = useCallback((id: string) => {
    setDirectory((held) =>
      held.status === 'ready'
        ? { status: 'ready', users: held.users.filter((row) => row.id !== id) }
        : held,
    )
  }, [])

  /**
   * One action, carried out.
   *
   * `settle` is what to do with a success, and it is the whole difference
   * between the eight: replacing the row, dropping it, or reloading because
   * the answer said nothing worth folding in.
   */
  const run = useCallback(
    <T>(
      user: ManagedUser,
      request: () => Promise<ApiResult<T>>,
      fallback: string,
      settle: (value: T) => void,
    ) => {
      if (busyId) return
      setBusyId(user.id)
      setRefusal(null)

      void request().then((result) => {
        setBusyId(null)
        if (!result.ok) {
          const message = refusal(result.failure, fallback)
          if (message) setRefusal({ id: user.id, message })
          return
        }
        settle(result.value)
      })
    },
    [busyId],
  )

  const changeRole = useCallback(
    (user: ManagedUser, role: UserRole) =>
      run(user, () => setUserRole(user.id, role), 'The role could not be changed.', replace),
    [replace, run],
  )

  const ban = useCallback(
    (user: ManagedUser, reason?: string) =>
      run(user, () => banUser(user.id, reason), 'The account could not be banned.', replace),
    [replace, run],
  )

  const unban = useCallback(
    (user: ManagedUser) =>
      run(user, () => unbanUser(user.id), 'The ban could not be lifted.', replace),
    [replace, run],
  )

  const revokeSessions = useCallback(
    (user: ManagedUser) =>
      run(
        user,
        () => revokeUserSessions(user.id),
        'The sessions could not be revoked.',
        // The count on the row has just changed and the answer did not carry
        // the row, so this is the one case worth a refetch.
        () => load(),
      ),
    [load, run],
  )

  const resetTwoFactor = useCallback(
    (user: ManagedUser) =>
      run(
        user,
        () => resetUserTwoFactor(user.id),
        'Two-factor could not be reset.',
        () => load(),
      ),
    [load, run],
  )

  const resetPassword = useCallback(
    (user: ManagedUser, password: string) =>
      run(
        user,
        () => resetUserPassword(user.id, password),
        'The password could not be set.',
        () => load(),
      ),
    [load, run],
  )

  const invite = useCallback(
    (user: ManagedUser, organizationIds: string[]) =>
      run(
        user,
        () => inviteToOrganizations(user.id, organizationIds),
        'The invitation could not be sent.',
        // The pending list on the row has grown, and the invite answer names
        // organizations rather than carrying the user.
        () => load(),
      ),
    [load, run],
  )

  const removeFromOrganization = useCallback(
    (user: ManagedUser, organizationId: string) =>
      run(
        user,
        () => removeMembership(user.id, organizationId),
        'The membership could not be removed.',
        () => load(),
      ),
    [load, run],
  )

  const remove = useCallback(
    (user: ManagedUser) =>
      run(user, () => deleteUser(user.id), 'The account could not be deleted.', () =>
        drop(user.id),
      ),
    [drop, run],
  )

  return {
    directory,
    query,
    setQuery,
    roleFilter,
    setRoleFilter,
    bannedOnly,
    setBannedOnly,
    organizations,
    reload,
    refreshing,
    refresh,
    busyId,
    refusal: refusalState,
    changeRole,
    ban,
    unban,
    revokeSessions,
    resetTwoFactor,
    resetPassword,
    invite,
    removeFromOrganization,
    remove,
    add,
  }
}
