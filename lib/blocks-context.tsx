import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { ApiResult } from '@/lib/api-result'
import { useAuth } from '@/lib/auth-context'
import { blockPerson, listBlockedPeople, unblockPerson } from '@/lib/block-api'
import {
  blockedIdSet,
  withBlockedPerson,
  withoutBlockedPerson,
  type BlockedPerson,
} from '@/lib/blocked-people'

/**
 * Who the signed-in person has blocked, held above the navigator.
 *
 * Above it because three places read the same answer and must agree the moment
 * a block lands: the Wall drops the person's Posts, an open thread drops their
 * Messages, and Settings lists them. The API is the authority and enforces the
 * block on every read it answers; this is what takes down what this phone
 * already drew, and what drops a live Post the socket broadcasts to a whole
 * Organization room.
 *
 * Read once per signed-in person and again on a block or unblock. A read that
 * fails leaves the list as it was — an empty list is a claim that nobody is
 * blocked, and what the API filters it filters whatever this holds.
 */

type BlocksValue = {
  blocked: readonly BlockedPerson[]
  blockedIds: ReadonlySet<string>
  /** Whether the list has been read for this person at least once. */
  loaded: boolean
  /** Read the list again. Null when nobody is signed in or a newer read overtook this one. */
  reload: () => Promise<ApiResult<BlockedPerson[]> | null>
  block: (userId: string) => Promise<ApiResult<BlockedPerson>>
  unblock: (userId: string) => Promise<ApiResult<{ userId: string }>>
}

const NOBODY: ReadonlySet<string> = new Set()
const NO_ONE: readonly BlockedPerson[] = []

const BlocksContext = createContext<BlocksValue | null>(null)

export function BlocksProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.status === 'signed-in' ? state.user.id : null

  /** The list and whose it is, so one person's blocks never show for the next. */
  const [held, setHeld] = useState<{ owner: string | null; list: BlockedPerson[]; loaded: boolean }>({
    owner: null,
    list: [],
    loaded: false,
  })
  const mine = held.owner !== null && held.owner === userId
  const blocked = mine ? held.list : NO_ONE

  const owner = useRef(userId)
  useEffect(() => {
    owner.current = userId
  }, [userId])

  const generation = useRef(0)

  const reload = useCallback(async () => {
    const reader = owner.current
    if (!reader) return null
    const read = (generation.current += 1)
    const result = await listBlockedPeople()
    if (generation.current !== read || owner.current !== reader) return null
    if (result.ok) setHeld({ owner: reader, list: result.value, loaded: true })
    return result
  }, [])

  useEffect(() => {
    generation.current += 1
    if (userId) void reload()
  }, [reload, userId])

  const block = useCallback(async (target: string) => {
    const result = await blockPerson(target)
    if (result.ok) {
      // A read still in flight predates this block and would put the list back without it.
      generation.current += 1
      const person = result.value
      setHeld(current => ({
        owner: owner.current,
        list: withBlockedPerson(current.owner === owner.current ? current.list : [], person),
        loaded: true,
      }))
    }
    return result
  }, [])

  const unblock = useCallback(async (target: string) => {
    const result = await unblockPerson(target)
    if (result.ok) {
      generation.current += 1
      setHeld(current => ({
        owner: owner.current,
        list: withoutBlockedPerson(current.owner === owner.current ? current.list : [], target),
        loaded: current.loaded,
      }))
    }
    return result
  }, [])

  const blockedIds = useMemo(() => (blocked.length === 0 ? NOBODY : blockedIdSet(blocked)), [blocked])

  const value = useMemo(
    () => ({ blocked, blockedIds, loaded: mine && held.loaded, reload, block, unblock }),
    [blocked, blockedIds, mine, held.loaded, reload, block, unblock],
  )

  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>
}

export function useBlocks(): BlocksValue {
  const value = useContext(BlocksContext)
  if (!value) throw new Error('useBlocks must be used inside a BlocksProvider')
  return value
}

/**
 * Just the ids, for the hooks that filter by them. Answers nobody outside a
 * provider rather than throwing, so a hook a test renders bare still works.
 */
export function useBlockedIds(): ReadonlySet<string> {
  return useContext(BlocksContext)?.blockedIds ?? NOBODY
}
