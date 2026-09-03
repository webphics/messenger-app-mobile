# Enki (Expo mobile)

Internal support messenger mobile client. This repo is Expo-only; web and API live elsewhere.

## Language

**Enki**:
The product brand shown on launcher, auth, and hub wordmarks.
_Avoid_: Messenger (as product name), Casewire, ISM

**Customer**:
End-user role that only sees their own conversations. Reaches Home, Messages, and Help from the tab capsule; FAQ, Search, and Settings are reached from Home rather than from the tab capsule. The name matches the API's `role` enum and the web client's glossary; the on-screen eyebrow still reads SUPPORT.
_Avoid_: Contact, client, user (when meaning this role)

**Contact list**:
The address book a staff member picks from when starting a conversation, backed by
`GET /conversations/contacts`. A *contact* here is an addressable person of any role — unrelated to
the end-user role, which is Customer. The two must not be collapsed.
_Avoid_: Contacts (bare, when the Customer role is meant), directory, people picker

**Agent**:
Support staff role. Sees assigned threads plus the unassigned pool. Cannot delete.
_Avoid_: Rep, operator

**Admin**:
Oversight role with slim mobile surface (users, unassigned, conversations, hub). Full analytics stay on web.
_Avoid_: Superuser, owner

**Hub**:
Role home screen (Customer / Agent / Admin variants). The first tab destination in every role.
_Avoid_: Dashboard, home feed

**Hub role label**:
Uppercase eyebrow on the hub greeting block: SUPPORT, AGENT, or ADMIN. Not the header wordmark.
_Avoid_: Customer Hub, Agent Dashboard, Executive Overview (as UI labels)

### Session

**Session cookie**:
The Better Auth session cookie the API sets, held in the device keychain and replayed on every request as a `Cookie` header this client sets by hand. Opaque to the app — never parsed, only stored, sent, and discarded.
_Avoid_: Session token, JWT, access token, bearer token

**CSRF token**:
The double-submit value fetched from the API and sent as `X-CSRF-Token` on every mutation, alongside the `csrf-token` cookie it is paired with. Not bound to a session — one is fetched, cached, and reused until the API rejects it.
_Avoid_: XSRF token, nonce, anti-forgery token

**Seed account**:
An account the API's seeder created, offered as a chip on the sign-in screen so a developer can reach
each Hub without three real accounts. Read from `EXPO_PUBLIC_DEV_SEED_ACCOUNTS` behind `__DEV__`, so it
leaves a release bundle entirely. Picking one fills the form and nothing more — signing in is the
ordinary password path, and the role that follows is whatever the API says the account holds.
_Avoid_: Test account, demo account, role switcher (there is no control that changes your own role)

**Magic link**:
A single-use, short-lived sign-in link emailed on request, spent by opening it on the device. One of the
two ways a Customer account comes into existence on this client — the API has no registration endpoint,
and verifying a first link creates the account; the other way is Google sign-in, and staff accounts are
made by an Admin on web. Requesting one says the same thing for every address, because saying otherwise
would disclose who has an account. Verifying one ends in the same Session cookie a password sign-in ends in.
_Avoid_: Magic email, passwordless login, OTP, one-time code (there is no code to type)

**Google sign-in**:
The third way in: the system account sheet, an ID token from Google, and the same Session cookie the
other two end in. Needs a native module and so a Development client — it is the only part of the app
that does not run in Expo Go. Signing in with Google for the first time creates a Customer account, so
it is the second account-creation path beside the Magic link. Dismissing the sheet is a Cancellation,
not a failure.
_Avoid_: Google OAuth, social login, SSO, Sign in with Google (as the name in code)

**Audience arrangement**:
The reason mobile Google sign-in needs no API change: the app is configured with the *web* OAuth
client alongside the platform one, so Google mints the ID token with the web client as its audience —
the single value the API verifies against. Looks like a mistake in a mobile app and is not. See
`docs/adr/ADR-0005-the-google-audience-arrangement.md`.
_Avoid_: Client ID mismatch, aud fix, the web client workaround

**Development client**:
A build of this app that can run native modules, installed on a device in place of Expo Go and served
by the same `pnpm start`. Required for Google sign-in and for opening a Magic link; nothing else in the
app needs it. Built from the `development` profile in `eas.json`.
_Avoid_: Dev build (as the name for the profile), custom client, standalone build (that is a release)

**Cancellation**:
Dismissing the Google account sheet. A distinct outcome from a failure: it surfaces no message, clears
nothing that was typed, and returns to sign-in unchanged.
_Avoid_: Abort, dismissal error, cancelled sign-in error

**Link origin**:
Where the Magic link points, sent to the API with the request because the API serves the web client
too and its links go elsewhere. Configuration — an app scheme now, an HTTPS domain in production —
never a value written into the client. The path it is joined to, `/auth/magic-link`, is fixed on both
sides, so only the origin ever changes.
_Avoid_: Deep link URL, callback URL, redirect URI

**Hydration**:
Reading the stored Session cookie at cold start and exchanging it for the signed-in Customer, Agent, or Admin. Ends in one of three states: signed in, signed out, or unreachable.
_Avoid_: Bootstrapping, session restore, rehydrate

**Unreachable**:
The Hydration outcome where a Session cookie exists but the API could not be reached. Distinct from signed out: the cookie is kept and the person is not sent to sign-in.
_Avoid_: Offline, error, disconnected

**Session end**:
Either of the two ways a session stops: signing out, deliberately, and Session expiry. Both discard the Session cookie and everything derived from it — role included — and both land on sign-in, whatever the person was looking at. Hydration's Unreachable outcome is not one: it keeps the cookie.
_Avoid_: Session exit, teardown, logout (as the name for both)

**Session expiry**:
The involuntary Session end. The API's sessions are a seven-day sliding window with no refresh token, so a Session cookie simply stops being accepted; an authenticated request answered `401` discards it and returns the person to sign-in with an explanation, never to a screen that has quietly stopped loading. A `403` is not one — that is a verdict on the request, not on the session — and neither is a transport failure, which changes nothing.
_Avoid_: Session timeout, token refresh

**Unassigned pool**:
Conversations with no assignee, visible to Agent and Admin.
_Avoid_: Queue (unless referring to ordering), inbox (inbox is the conversation list)

**Engage**:
An Agent or Admin claiming a conversation from the Unassigned pool, becoming its assignee. The API's `engage` action.
_Avoid_: Claim, pick up, assign to self (assignment is what results, not the action's name)

**Takeover**:
An Agent or Admin taking assignment of a conversation away from its current assignee. Distinct from Transfer (Phase 4b): a Takeover is unilateral and names no destination other than the actor; a Transfer hands off to a chosen agent.
_Avoid_: Reassign, steal, force-assign

**Offers**:
In-app promo carousel plus the shared group chat `id: 'offers'`. `"Sponsored"` is a section label only.
_Avoid_: Stories, ads, sponsored content (as a product feature)

**Launch animation**:
The looping transparent character animation on the cold-start screen, shown while the session hydrates. Rendered from an animated WebP; the surface behind it is the app background, not part of the asset.
_Avoid_: Splash screen (that is the separate native `expo-splash-screen` surface this screen dismisses), loading video, chroma-keyed video

**Tab capsule**:
The floating rounded nav bar at the bottom of every role. Icon-only — destination names live in the accessible name, not on screen.
_Avoid_: Tab bar (that is the host navigator's own bar, kept invisible beneath), dock, bottom nav

**Message**:
A unit of chat content in a Conversation: a text body and/or one Attachment. The body may be empty when the Message is only an Attachment; when both are present the body is a caption.
_Avoid_: Post, chat item, media message (as a separate entity from Message)

**Unsent message**:
A Message from the tap on send until the API answers for it. It carries a local id, appears in the
thread immediately, and its **Delivery state** reads *sending* or, when the request did not land,
*failed* — a failed one stays on screen, says so, and offers to go again rather than disappearing.
The API's answer replaces it whole: a server id, a server timestamp, and a Receipt. Not called
*outgoing*, which in this app means a Message the viewer sent, whenever they sent it.
_Avoid_: Outgoing message (that is "mine"), pending message, optimistic message, sending receipt

**Receipt**:
How far a Message the viewer sent has travelled among the people in the Conversation — `sent`,
`delivered`, `read`. Issued by the API and never by this client, so a Message with no Receipt is an
Unsent message. A bubble shows one or the other, never both.
_Avoid_: Delivery state (that is the Unsent message's), tick, checkmark

**Unread**:
What a Conversation holds for the viewer that they have not read yet. The list endpoint counts it
(`unreadCount`); every other path declines to, and a row that arrived by one of those falls back to
whether the last Message was theirs or carries their read Receipt. The reader's side of the facts a
Receipt reports to the sender. Shown as a count on the Conversation row, and summed across the list
for the Messages tab badge — where an uncounted row that the fallback calls unread is worth one,
because a badge that ignored it would disagree with the row beside it.
_Avoid_: Badge (that is where it is shown), new messages, notification count

**Mark as read**:
Opening a Conversation, which clears its Unread and adds the opener's read Receipt to every Message
in it. `POST /conversations/:id/read`. The badge clears before the API is told, because the person
has read the thread whatever the server makes of it.
_Avoid_: Acknowledge, seen, dismiss, clear notifications

**Realtime connection**:
The Socket.IO connection to the API's `/realtime` namespace, authenticated by the same Session
cookie REST carries and opened once per signed-in person. There are two: a *global* one, live for
as long as the session is, that carries every event; and a *conversation* one, open only while a
thread is, whose job is room membership rather than listening. Nothing subscribes to the second.
See `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`.
_Avoid_: Websocket (that is the transport), realtime channel, socket connection (as two words for one thing)

**Resync**:
Re-reading from REST after the Realtime connection comes back, because whatever the API emitted
while it was down was emitted to nobody. Never on a first connect, and never visible: nobody asked
for it, so no spinner appears and a failed one leaves what is on screen alone. REST is the
authority either way — a socket only ever saves it a round trip.
_Avoid_: Refresh (that is the pull-to-refresh a person asks for), refetch, invalidate, reconnect
(that is the socket's event, not what follows it)

**Attachment**:
A single file or recording on a Message — image, video, document, or voice note — identified by a local device URI in this client until a server exists. At most one Attachment per Message.
_Avoid_: Upload, media blob, file message (as a type parallel to Message)

**Voice note**:
An audio Attachment recorded in the app for a Message, not a file picked from the library.
_Avoid_: Voice message, audio clip, mic message
