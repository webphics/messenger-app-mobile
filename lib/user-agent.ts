/**
 * The User-Agent this app sends, and reading one back off a session.
 *
 * Pure and table-tested, beside `lib/app-user-agent`, which reads the device
 * off `Platform` and is the only half that imports anything native.
 *
 * Why it exists at all: left alone, every request goes out under whatever the
 * native HTTP stack calls itself — `okhttp/4.12.0` on Android,
 * `ChatRoute/1 CFNetwork/1490 Darwin/24.0.0` on iOS — and the API's sessions
 * list sniffs that string for an operating system and a browser, finds
 * neither, and calls the phone in somebody's hand an `Unknown OS - Unknown
 * Browser` computer. So the app names itself, in the shape every client that
 * is not a browser uses:
 *
 *     ChatRoute/1.0.23 (Android 14; Pixel 8)
 *     ChatRoute/1.0.23 (iOS 18.1; iPhone)
 *     ChatRoute/1.0.23 (iPadOS 18.1; iPad)
 *
 * The words inside the brackets are chosen for the API's sniffing as well as
 * for this file: `android` and `iphone` are what it reads as a phone, `ipad`
 * what it reads as a tablet, so the web client's list stops calling this app a
 * computer without the API changing. It still cannot name the app, which is
 * the API's to fix.
 */

/** What the app says about the device it is on. */
export type AppAgentDevice = {
  /** This build's `expo.version`. */
  version: string
  platform: 'android' | 'ios'
  /** Android's release (`14`) or iOS's version (`18.1`). */
  osVersion: string
  /**
   * Android's `Build.MODEL`. Null on iOS, which tells an app its idiom and not
   * its model without a native module this app does not ship.
   */
  model: string | null
  /** iOS's `pad` idiom. Android does not say, so an Android tablet is a phone here. */
  tablet: boolean
}

/** A session's user agent, read as this app, for the sessions screen to draw. */
export type AppAgent = {
  /** The line that names the device, such as `ChatRoute app - Android 14`. */
  name: string
  kind: 'phone' | 'tablet' | null
  /** The handset's model, when the agent named one. */
  model: string | null
}

const PRODUCT = 'ChatRoute'
const APP_NAME = 'ChatRoute app'

/**
 * A value okhttp will put in a header, and one that cannot break the brackets.
 *
 * okhttp throws on any character outside printable ASCII, and a model name is
 * whatever the manufacturer typed, so this is not tidiness: one accented
 * letter in `Build.MODEL` would otherwise fail every request the app makes.
 */
function token(value: string): string {
  return value
    .replace(/[^\x20-\x7e]|[();]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function appUserAgent(device: AppAgentDevice): string {
  const os = device.platform === 'android' ? 'Android' : device.tablet ? 'iPadOS' : 'iOS'
  const system = token(`${os} ${device.osVersion}`)
  const hardware =
    device.platform === 'android' ? token(device.model ?? '') : device.tablet ? 'iPad' : 'iPhone'
  const details = hardware === '' ? system : `${system}; ${hardware}`
  return `${PRODUCT}/${token(device.version) || '0'} (${details})`
}

const APP_AGENT = /^ChatRoute\/\S+ \(([^;)]*)(?:; ([^)]*))?\)/
const IOS_IDIOMS = /^(iphone|ipad|ipod)$/i

/**
 * What a build from before this file called itself: the native stack's own
 * name. Nothing but this app holds a session cookie and speaks okhttp or
 * CFNetwork, so these are this app on another phone that has not updated, and
 * reading them as such is better than the computer the API makes of them. They
 * name no version and no idiom, so the kind is left unsaid rather than guessed.
 */
const LEGACY_AGENTS: readonly { pattern: RegExp; os: string }[] = [
  { pattern: /^okhttp\//i, os: 'Android' },
  { pattern: /\bCFNetwork\/\S+ Darwin\//, os: 'iOS' },
]

/**
 * This app, read off a session's user agent, or null when the agent is not
 * this app's, in which case the API's own reading of it stands.
 */
export function readAppUserAgent(userAgent: string | null): AppAgent | null {
  const agent = userAgent?.trim() ?? ''
  if (agent === '') return null

  const match = APP_AGENT.exec(agent)
  if (match) {
    const system = token(match[1] ?? '')
    const hardware = token(match[2] ?? '')
    const idiom = IOS_IDIOMS.test(hardware)
    return {
      name: system === '' ? APP_NAME : `${APP_NAME} - ${system}`,
      kind: /^ipados\b/i.test(system) || /^ipad$/i.test(hardware) ? 'tablet' : 'phone',
      model: hardware === '' || idiom ? null : hardware,
    }
  }

  const legacy = LEGACY_AGENTS.find(({ pattern }) => pattern.test(agent))
  return legacy ? { name: `${APP_NAME} - ${legacy.os}`, kind: null, model: null } : null
}
