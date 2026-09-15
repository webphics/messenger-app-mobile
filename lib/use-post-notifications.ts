import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import type { ApiFailure } from '@/lib/api-result'
import { listMyOrganizations } from '@/lib/conversation-api'
import { readNotificationSettings, setPostNotifications } from '@/lib/notification-api'
import {
  postNotificationsNotice,
  postNotificationsRefusal,
  type PostNotificationsNotice,
} from '@/lib/post-notifications-notice'
import {
  postNotificationCaveat,
  postNotificationRows,
  type PostNotificationRow,
} from '@/lib/post-notifications'
import { readNotificationStanding } from '@/lib/push-device'
import type { NotificationSettings, Organization } from '@/lib/types'

/**
 * The Post notification switches: which organizations may notify this person,
 * and what a tap on one does.
 *
 * Two reads make the card, because the switches are the join of two facts the
 * API keeps apart: the organizations somebody belongs to, and the ones they have
 * opted in to. Either failing is the card failing — a list of memberships with
 * no settings would draw every switch off, which is a claim rather than a gap.
 *
 * A tap is the three steps a send is and a reaction is: the switch moves first,
 * the request follows it, and a refusal or a dead network puts it back. What
 * comes back is the settings document as it now stands rather than the change
 * that was asked for, so an opt-in the API had already recorded and one it has
 * just written settle identically.
 *
 * Nothing is persisted. This is a standing answer kept by the API and read on a
 * screen somebody chose to open; there is no Store table, and a Session end has
 * nothing of its own to destroy.
 */

export type PostNotificationsView = {
  rows: PostNotificationRow[]
  /** What the card says over or beside the switches: `lib/post-notifications-notice`. */
  notice: PostNotificationsNotice
  /** What the phone cannot promise, whatever the switches say, or null. */
  caveat: string | null
  /** Which organization has a request out, or null. */
  busyId: string | null
  /** One sentence about a tap that did not take. */
  error: string | null
  toggle: (row: PostNotificationRow) => void
  reload: () => void
}

type Loaded = { organizations: Organization[]; settings: NotificationSettings }

export function usePostNotifications(): PostNotificationsView {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [caveat, setCaveat] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setFailure(null)
    void Promise.all([listMyOrganizations(), readNotificationSettings()]).then(
      ([organizations, settings]) => {
        if (!live.current) return
        setLoading(false)

        // The first failure of the two speaks, and the memberships are asked
        // first because a session that has ended will fail both and the card
        // should not have to choose between two sentences about it.
        if (!organizations.ok) return setFailure(organizations.failure)
        if (!settings.ok) return setFailure(settings.failure)

        setLoaded({ organizations: organizations.value, settings: settings.value })
      },
    )
  }, [])

  useEffect(() => load(), [load])

  /*
   * The permission, re-read whenever the app comes back to the foreground. The
   * answer changes out in the operating system's settings rather than in here —
   * which is exactly where `NotificationPermissionRow` sends people from this
   * same screen — so a person who turns notifications on and comes back finds
   * the caveat gone rather than a sentence that is no longer true.
   */
  useEffect(() => {
    const read = () => {
      void readNotificationStanding().then((standing) => {
        if (live.current) setCaveat(postNotificationCaveat(standing))
      })
    }

    read()
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read()
    })
    return () => subscription.remove()
  }, [])

  const toggle = useCallback(
    (row: PostNotificationRow) => {
      if (busyId) return
      const next = !row.on

      setBusyId(row.id)
      setError(null)
      // The switch first. What it is showing is what this person has just asked
      // for, and the request is how it becomes true.
      setLoaded((held) =>
        held ? { ...held, settings: withPost(held.settings, row.id, next) } : held,
      )

      void setPostNotifications(row.id, next).then((result) => {
        if (!live.current) return
        setBusyId(null)

        if (!result.ok) {
          // Back where it was. Nothing else on screen changes: the failure is
          // about this one switch and is said beside it.
          setLoaded((held) =>
            held ? { ...held, settings: withPost(held.settings, row.id, row.on) } : held,
          )
          setError(postNotificationsRefusal(result.failure))
          return
        }

        // The document as it now stands, rather than the change that was asked
        // for: the API is the one that knows what this person is opted in to.
        setLoaded((held) => (held ? { ...held, settings: result.value } : held))
      })
    },
    [busyId],
  )

  const rows = postNotificationRows(loaded?.organizations ?? [], loaded?.settings ?? null)

  return {
    rows,
    notice: postNotificationsNotice({ drawn: rows.length, loading, failure }),
    caveat,
    busyId,
    error,
    toggle,
    reload: load,
  }
}

/** The settings document with one organization's switch set, and nothing else touched. */
function withPost(
  settings: NotificationSettings,
  organizationId: string,
  on: boolean,
): NotificationSettings {
  const without = settings.postOrganizationIds.filter((id) => id !== organizationId)
  return {
    ...settings,
    postOrganizationIds: on ? [...without, organizationId] : without,
  }
}
