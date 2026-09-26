import { useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth-context'
import { listMyOrganizations } from '@/lib/conversation-api'
import { listOrganizations } from '@/lib/org-api'
import { getWallContributorGrant } from '@/lib/wall-api'
import type { Organization } from '@/lib/types'

/**
 * Every organization the viewer may post to, for Compose's org picker and for
 * whether to show the compose control at all (#76).
 *
 * Mirrors `WallPolicy.assertCanPost` one role branch at a time — the same
 * shape the web client's `useComposableWallOrganizations` fetches, and for
 * the same reason: `/wall-contributors` is only for staff holding
 * `manage_wall_contributors` (`WallContributorsController`), so there is no self-service "am I a
 * Contributor anywhere" route. An Admin posts anywhere, whatever their own
 * memberships, so the source is every organization that exists
 * (`listOrganizations`, the Admin directory) rather than `/memberships/mine`,
 * which would wrongly answer "none" for an Admin belonging to nothing. An
 * Agent posts anywhere they are a member, no grant required, so the source is
 * `/memberships/mine` as-is. Anyone else needs an explicit grant per
 * organization, so this fans out one grant check per membership — a
 * refusal (the Admin-only route asked about oneself) reads the same as no
 * grant, which is the safe default for a control deciding whether to draw a
 * button that would otherwise send a request the API refuses anyway.
 */
export function useComposableWallOrganizations(): { organizations: Organization[]; loading: boolean } {
  const { state } = useAuth()
  const user = state.status === 'signed-in' ? state.user : null
  const isAdmin = user?.role === 'admin'
  const isAgent = user?.role === 'agent'

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setOrganizations([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const userId = user.id

    async function run() {
      if (isAdmin) {
        const result = await listOrganizations({ pageSize: 100 })
        if (cancelled) return
        setOrganizations(result.ok ? result.value.map(({ id, name }) => ({ id, name })) : [])
        setLoading(false)
        return
      }

      const memberships = await listMyOrganizations()
      if (cancelled) return
      if (!memberships.ok) {
        setOrganizations([])
        setLoading(false)
        return
      }

      if (isAgent) {
        setOrganizations(memberships.value)
        setLoading(false)
        return
      }

      const grants = await Promise.all(
        memberships.value.map(organization => getWallContributorGrant(organization.id, userId)),
      )
      if (cancelled) return
      setOrganizations(
        memberships.value.filter((_, index) => {
          const grant = grants[index]
          return grant !== undefined && grant.ok && grant.value.isContributor
        }),
      )
      setLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [user, isAdmin, isAgent])

  return { organizations, loading }
}
