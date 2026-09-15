import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Post opt-in changes nothing about notifications themselves, and this is
 * what says so.
 *
 * #81's second acceptance criterion — *nothing about the Wall changes the
 * existing notification permission flow, the In-app banner or the
 * shade-clearing behaviour* — is true today because none of these modules
 * touches any of it: the permission is still asked for by the two moments in
 * `lib/push-rules`' table, the banner is still fed by the socket, and the shade
 * is still cleared by a read. That is a property of the code rather than of
 * anything asserted at runtime, so the way it stops being true is a later
 * ticket reaching from a settings card into the thing it is a setting *about*.
 * This is a failing test instead, in the spirit of `wall-persistence.test.ts`
 * and of ADR-0011's tripwire beside the backup plugin.
 *
 * One read is allowed and is the reason this bans names rather than the module:
 * `readNotificationStanding` is how the card says what the phone cannot
 * promise, and `shouldOfferSystemSettings` is how it says it in the same words
 * the row beneath does. Reading where the platform stands is not the flow —
 * raising the dialog, drawing a banner and clearing the shade are.
 */

const REPOSITORY = join(__dirname, '..')

const SOURCES = [
  'lib/notification-api.ts',
  'lib/notification-parse.ts',
  'lib/post-notifications.ts',
  'lib/post-notifications-notice.ts',
  'lib/use-post-notifications.ts',
  'components/settings/post-notifications-card.tsx',
]

/**
 * What reaching into the notification flow would have to look like. Named one by
 * one, because each is a specific behaviour this ticket promised not to move.
 */
const FLOW = [
  // The permission dialog, and the module that can raise one at all.
  'ensurePushPermission',
  'expo-notifications',
  // The In-app banner.
  'banner-notice',
  'in-app-banner',
  // The shade.
  'dismissConversationNotifications',
  'notificationIdsForConversation',
  // Registering this device, which is what a dispatch is addressed to.
  'push-registry',
  'registerPushDevice',
]

describe('the Post opt-in leaves the notification flow alone', () => {
  const sources = SOURCES.map((path) => ({
    path,
    source: readFileSync(join(REPOSITORY, path), 'utf8'),
  }))

  it('finds every module of the opt-in, so a rename cannot empty this test', () => {
    expect(sources).toHaveLength(SOURCES.length)
  })

  it.each(FLOW)('reaches for no %s', (name) => {
    const offenders = sources.filter((file) => file.source.includes(name))

    expect(
      offenders.map((file) => file.path).join(', ') ||
        'nothing, which is what this ticket changed about notifications: nothing',
    ).toBe('nothing, which is what this ticket changed about notifications: nothing')
  })
})
