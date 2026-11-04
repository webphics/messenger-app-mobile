import type { AccountSession } from '@/lib/types'
import { readAppUserAgent, type AppAgent } from '@/lib/user-agent'

/**
 * The sessions on this account, as the screen draws them.
 *
 * Pure and table-tested, beside `components/settings/account-sessions-screen`,
 * which owns the requests and the drawing, and `lib/account-session-api`, which
 * owns the paths. The same split as `lib/post-notifications`,
 * `lib/community-rows` and every other rows module here: nothing in this file
 * imports anything native, so the three rules the sessions screen turns on are a
 * table of cases rather than something only a running phone can demonstrate.
 *
 * The three rules, all from ticket 05 and
 * `docs/adr/ADR-0012-account-self-service-is-pushed-from-settings.md`:
 *
 * 1. Which row is the device in hand. The API marks it with `isCurrent`, and
 *    that is the only source: a phone comparing device names against its own
 *    would get it wrong the moment somebody signs in from a second phone of the
 *    same model.
 * 2. That row is marked as this device and carries no revoke. Revoking the
 *    session this app is holding is a sign-out, and a sign-out here also
 *    destroys the local Store through `lib/session-wipe`. Sign out already sits
 *    on the Settings screen one push above this one and says in as many words
 *    what it does. Two controls one screen apart doing the same thing, only one
 *    of which admits it signs you out, is a trap rather than a feature.
 * 3. Sign out everywhere else is offered only when there is more than one
 *    session, so it is never the only session on the account and never a
 *    control that would do nothing.
 *
 * What a row carries is what the screen draws and nothing it has to work out
 * for itself, with one deliberate exception: the time. `lastActiveAt` is an ISO
 * string rather than a sentence, because `formatRelativeTime` in `lib/display`
 * already turns one into the other and presentation of a date belongs with the
 * drawing. Everything else, including the accessible name of every control, is
 * decided here, so a screen reader is told which device a control would end
 * without a screen having to compose that sentence itself.
 *
 * `DELETE /sessions/:id` has no action here and never will. Root ADR 0008:
 * revoking ends access and leaves the record, while deleting erases the
 * evidence that a session existed at all, and the session list is close to the
 * only device-level trail this product keeps.
 */

/** A control, named twice: once for the eye and once for a screen reader. */
export type AccountSessionControl = {
  label: string
  accessibilityLabel: string
}

/**
 * The one control a row may offer, or none.
 *
 * A discriminated union rather than a nullable control so that the row for this
 * device is a case the type forces a caller to handle, rather than a null it
 * can forget about.
 */
export type AccountSessionAction = { kind: 'none' } | ({ kind: 'revoke' } & AccountSessionControl)

export type AccountSessionRow = {
  id: string
  /** The device, named. Never empty: an unreadable name still draws as something. */
  title: string
  /**
   * The line somebody recognises their own device by: what kind of device it
   * is and how it was signed in. Empty when the API knew neither, in which
   * case the time below is the whole of what the row can say.
   */
  detail: string
  /** When the session was last touched, ISO. The screen presents it. */
  lastActiveAt: string
  /** Whether this is the device the app is running on, per the API's `isCurrent`. */
  thisDevice: boolean
  action: AccountSessionAction
}

const UNKNOWN_DEVICE = 'Unknown device'

/**
 * What the API's `deviceType` is called in front of a person.
 *
 * Four values come out of the API's user-agent sniffing, and `unknown` is one
 * of them; it says nothing, so it contributes nothing to the line rather than
 * printing the word "Unknown" beside a name that may already say it.
 */
const DEVICE_TYPES: Record<string, string> = {
  desktop: 'Computer',
  mobile: 'Phone',
  tablet: 'Tablet',
}

/**
 * How the session was started, in this product's own words.
 *
 * `email` is the API's name for a password sign-in, which is not what anybody
 * reading a list of their own devices would call it. Anything this build does
 * not recognise is printed as it arrived rather than dropped: a provider added
 * to the API after this build shipped is still more use to a reader than
 * silence.
 */
const LOGIN_METHODS: Record<string, string> = {
  email: 'Signed in with a password',
  'magic-link': 'Signed in with a magic link',
  google: 'Signed in with Google',
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function deviceTitle(session: AccountSession, app: AppAgent | null): string {
  if (app) return app.name
  const name = text(session.deviceName)
  // The API answers `Unknown` for a session with no user agent at all, which is
  // a word rather than a device. It reads as a name until somebody notices it
  // is not one, so it becomes the phrase that says plainly there is nothing to
  // show.
  return name === '' || name.toLowerCase() === 'unknown' ? UNKNOWN_DEVICE : name
}

/** What this app calls the kinds of device it runs on. */
const APP_KINDS: Record<NonNullable<AppAgent['kind']>, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
}

function deviceDetail(session: AccountSession, app: AppAgent | null): string {
  // The API's `deviceType` is set aside entirely for this app's own sessions
  // rather than used as a fallback: what it made of `okhttp/4.12.0` is
  // `desktop`, and a session the app cannot place is better left unsaid than
  // called a computer.
  const kind = app
    ? (app.kind ? APP_KINDS[app.kind] : '')
    : (DEVICE_TYPES[text(session.deviceType).toLowerCase()] ?? '')
  const method = text(session.loginMethod)
  const how = method === '' ? '' : (LOGIN_METHODS[method] ?? `Signed in with ${method}`)
  return [kind, app?.model ?? '', how].filter((part) => part !== '').join(' · ')
}

/**
 * Which of these is the device in hand, or null when the API marked none.
 *
 * The small companion the screen calls so it does not read `isCurrent` off the
 * list itself, which would put rule 1 in two places. Null is a real answer and
 * not a defect: a list read while the session behind it is ending has no
 * current row in it, and every row then carries a revoke, which is correct,
 * because none of them is this device.
 */
export function currentAccountSessionId(sessions: readonly AccountSession[]): string | null {
  return sessions.find((session) => session.isCurrent)?.id ?? null
}

/**
 * Every session as a row, in the order the API answered.
 *
 * The current id is passed in rather than read off the list so that the rule
 * about which row is this device has exactly one input, and so a caller holding
 * the id from somewhere else, such as a list that has just had a row removed
 * from it, gets the same answer.
 */
export function accountSessionRows(
  sessions: readonly AccountSession[],
  currentId: string | null,
): AccountSessionRow[] {
  return sessions.map((session) => {
    // This app's own sessions are read off the raw user agent, because the
    // API's sniffing looks for an operating system and a browser and this app
    // is not a browser; see `lib/user-agent`. Every other session is named as
    // the API named it.
    const app = readAppUserAgent(session.userAgent)
    const title = deviceTitle(session, app)
    const thisDevice = currentId !== null && session.id === currentId

    return {
      id: session.id,
      title,
      detail: deviceDetail(session, app),
      // `updatedAt` is when the session was last touched and is the closer
      // answer to "when was this used"; `createdAt` is the fallback, because a
      // session nothing has refreshed yet has the two the same anyway.
      lastActiveAt: text(session.updatedAt) || text(session.createdAt),
      thisDevice,
      action: thisDevice
        ? // Rule 2. Not a disabled control either: a greyed-out End session
          // beside "This device" invites somebody to work out why it is there,
          // and the answer is that it should not be.
          { kind: 'none' }
        : {
            kind: 'revoke',
            label: 'End session',
            // Names the device, so ending one is unambiguous to a screen
            // reader reading a list of rows that otherwise differ only in a
            // time. Ticket 05's last acceptance criterion.
            accessibilityLabel: `End the session on ${title}`,
          },
    }
  })
}

/**
 * The one control that is not on a row, or null when it would do nothing.
 *
 * Rule 3, and it takes the rows rather than the sessions because the rows are
 * what is on screen: a control under a list is offered on the strength of that
 * list.
 *
 * More than one row, which is the ticket's wording, and the two cases it turns
 * away are different. One row that is this device is the common one: there is
 * nowhere else signed in, and "sign out everywhere else" would end nothing. One
 * row that is not this device is the odd one, and it is turned away too, because
 * that row already carries its own revoke and a second control ending the same
 * single session is the duplication rule 2 exists to avoid.
 */
export function signOutOthersControl(
  rows: readonly AccountSessionRow[],
): AccountSessionControl | null {
  if (rows.length <= 1) return null

  return {
    label: 'Sign out everywhere else',
    // Says which device is spared rather than how many end, because the number
    // is already read out by the list above it and the reassurance a person
    // wants before tapping this is that the phone in their hand stays signed
    // in.
    accessibilityLabel: 'Sign out of every session except this device',
  }
}
