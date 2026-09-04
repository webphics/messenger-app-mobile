# Mobile push is a second transport, not a widened first one

The API already sends push, and this client cannot use any of it. `POST /push/subscriptions` takes a
browser's `PushSubscription` — an `https://` endpoint with `p256dh` and `auth` keys, `.strict()` —
and `web-push` dispatches to it with VAPID. An `ExponentPushToken[…]` satisfies none of that. So
mobile push gets `POST /push/devices`, its own table, and its own dispatcher against Expo's push
service, and the web path is not touched.

The audience is separated the same way, and this is the part worth writing down. Mobile pushes for a
new Message in any conversation the person is a recipient of, customers included. Web pushes only for
a Support DM, only to staff — three events, decided in `messagePushAudience`. It would have been
fewer moving parts to widen that one rule and let both transports read it, and it would have been
wrong: agents' desktop browsers would have started buzzing for group messages and staff DMs the next
morning, a behaviour change to a working feature, shipped as a side effect of a mobile phase nobody
had asked to affect them. Web push is an accessory for an agent already at their desk with the app
open in a tab; a phone is where somebody finds out at all. Same product, genuinely different jobs.

Expo's service rather than FCM directly, because it is one dispatch path for both platforms and the
documented pairing for `expo-notifications`. Android only for now — there has never been an iOS build
profile in this repo and APNs needs an Apple Developer account — but nothing in the client or the
dispatcher is Android-specific, so iOS is an APNs key uploaded to Expo and a build profile, not a
second dispatcher. The message preview travels in the payload, as it already does on web, which means
support content on a lock screen and through Expo's servers; that is what the product already does
and what a notification reading "New message" would be useless for.

There is no background connection and there will not be one. The Realtime connection lives only while
the app is foregrounded — iOS suspends it within seconds and Android soon after — so a Push
notification is not an optimisation over a socket, it is the only way a closed app learns anything.
Coming back to the foreground refetches through the existing Resync path rather than trusting the
socket to notice it was gone.
