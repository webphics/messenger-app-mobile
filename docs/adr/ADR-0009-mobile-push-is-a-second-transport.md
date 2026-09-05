# Mobile push is a second transport, not a widened first one

The API already sends push, and this client cannot use any of it. `POST /push/subscriptions` takes a
browser's `PushSubscription` — an `https://` endpoint with `p256dh` and `auth` keys, `.strict()` —
and `web-push` dispatches to it with VAPID. An `ExponentPushToken[…]` satisfies none of that. So
mobile push gets `POST /push/devices`, its own table, and its own dispatcher against Expo's push
service, and the web path is not touched.

The audience is separated the same way, and this is the part worth writing down. Mobile pushes for a
new Message in any conversation the person is a recipient of, customers included. Web pushes only for
a Support DM, only to staff. It would have been
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

## What "a recipient" resolves to, and why that is the whole rule

Amended after reading the API, because the sentence above is easy to read as vaguer than it is and a
spec written off the vague reading would invent rules that already exist.

The recipient list is not the people in a thread. `notificationRecipientPublicIds` resolves a Support
DM by its status: **unassigned** means the customer *and every agent and admin*, **engaged** means the
customer and the assignee alone, **closed** means the customer only — status read before the
assignment, because `close` keeps `assignedAgentPublicId` so the thread remembers who handled it. So
a Customer writing into support has the whole staff pool as recipients of that message, and the
mobile rule reaches the Unassigned pool with nothing added to it. There is no separate "a new support
conversation" event and there does not need to be one: the queue *is* the recipient list, and it is
the first message that fires. A conversation created and never written in notifies nobody, on either
transport, which is correct — nothing has happened yet.

Everything else fans out through `interestedUserPublicIds`: a group or an announcement means its
members *plus every Admin*, who reach company-run rooms without being members of them. That is the
line to look at twice before shipping mobile push, because it is where the two transports diverge
most: web sends no push for those at all, and mobile as decided here would push every group message
to every Admin.

Membership is not an event. `group.member_added` is emitted, and the only listener is the activity
log — being added to a group writes no Notification row and sends no push on either transport. The
person finds out when the conversation reaches their list, or when somebody writes in it. If being
added should announce itself, that is a new notification kind in the API, not a mobile decision.

## The events, corrected

The paragraph above originally said "three events, decided in `messagePushAudience`". Both halves
were wrong in a way worth recording rather than quietly fixing, since the spec was about to quote it.

`PushEvent` has three members — `support_unassigned`, `support_held`, `transfer` — and only the first
two are decided in `messagePushAudience`; `transfer` is decided in `handleConversationTransferred`.
The count also has history: `push.service.ts` notes the original spec named four, and that the fourth,
a direct mention, "was an error in the writing rather than a feature deferred: the product has no
mentions."

`transfer` is the one that does not follow from the rule at the top of this file, because it is not a
Message. Engage and Takeover are not push events either — `handleConversationEngaged` writes a row and
passes no `pushTo`, so an Admin taking a thread from an Agent does not buzz a desktop today. Whether
either of those should buzz a phone is open, and belongs in the push spec rather than here.
