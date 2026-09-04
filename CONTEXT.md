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

**Staff directory**:
The list of every other Agent and Admin a staff member may write to, backed by
`GET /conversations/staff`, and what the New Message sheet shows. Each row names the organizations
the pair share, because a Staff DM belongs to one of them: one binds silently, several are chosen
between, and none means the row cannot be written to at all. Distinct from the Contact list, which is
the `contacts` endpoint and addresses people of any role — a Staff directory holds no Customer.
_Avoid_: Contacts, team list, people picker, agent list (an Admin is in it too)

**System notice**:
A `system`-type Message: the thread's own record of an Engage, a Takeover or a Transfer. Rendered as
a centred line rather than a bubble, because it belongs to the conversation rather than to either
side of it, and drawn with no sender, no side and no tick — the payload carries a sender and a
receipt like any other message, and the notice row shows neither. Never counted as unread, on either
side: the API's `countUnreadMessagesFor` excludes `system`, and so does this client's live count.
Staff see them; a Customer never does — the API withholds them from a Customer's payload and the
client filters again on the way in.
_Avoid_: System message (as a bubble), event, activity log entry

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

**Conversation details**:
The screen a thread's header opens: who the thread is with, its type and state, the Labels on it,
the Internal notes about it, and the way into Shared in chat. The mobile counterpart of the web
client's Conversation Details pane, and gated by the same rules — a Customer's payload carries no
assignment, no labels and no notes, and the API refuses all three to a Customer who asks, so a
Customer sees the identity, the type and Shared in chat and nothing else.
_Avoid_: Info panel, sidebar, profile

**Shared in chat**:
Every attachment and link a conversation has carried, on one screen, under four tabs: Media, Docs,
Voice and Links. No endpoint of its own — it reads the same message pages the thread reads, so it is
exactly as deep as the history that has been loaded, and reaching the end of a tab asks for the page
before it. Each kind opens the way the thread opens it.
_Avoid_: Media library, gallery (as the UI label), attachments tab

**Label**:
A coloured tag an Admin defines for the organization and any staff member puts on a conversation.
Organization-wide rather than per-thread: the same set is offered everywhere, and which of them a
thread wears is on the conversation payload. An *archived* label is one an Admin has retired — it
stays on the threads already carrying it and is offered on none. Creating, renaming and archiving
one stays on web; this client attaches and detaches.
_Avoid_: Tag, category, status

**Internal note**:
A staff-only note about a Support DM, never shown to the Customer and never part of the thread. On
Support DMs only — the API answers `404` for a note request on any other conversation type — and on
staff screens only. Distinct from a System notice, which *is* in the thread and which staff read as
a message.
_Avoid_: Comment, private message, annotation

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
An Admin taking assignment of a conversation away from its current assignee. Admin only, unlike an
Engage: the API's `assertCanTakeOver` begins with `assertAdmin` and answers an Agent `403` whatever
the thread's state, so an Agent reading a conversation somebody else holds is told who has it and
offered nothing. Distinct from Transfer (Phase 4b): a Takeover is unilateral and names no destination
other than the actor; a Transfer hands off to a chosen agent.
_Avoid_: Reassign, steal, force-assign

**Reassignment**:
Being told that a conversation is no longer yours — `conversation.reassigned`, the one event the API
addresses rather than broadcasts: it goes to the *previous* assignee's own room and to nobody else.
Three reasons, and the third is why it exists. A Takeover or a Transfer leaves the person able to see
the thread — an Agent reads every Support DM in their organizations whoever holds it — so the row
stays and only its assignment moves. A revoked membership does not: they are out of the organization,
the thread goes back to the pool, and the `conversation.updated` that follows every other
reassignment is emitted to rooms they have already been removed from. Everyone *else* learns of an
assignment from that update, never from this.
_Avoid_: Unassign, kicked out, access lost (that is the web client's screen, not the event)

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
A file on a Message: a photo, a video, a document, or a Voice note. A message carries `attachments`
— plural — and a bubble draws every one of them; the *first* is the one the bubble is shaped around,
and the one a quote strip and a preview line stand in for. Two shapes, in two places, and the
distinction is the whole of `lib/attachment-view.ts`: `MessageAttachment` is what the API stores — a
MIME type and a URL naming an object — and `AttachmentView` is what a bubble renders and a picker
produces, which is a kind, a playable URI and milliseconds.
_Avoid_: Media (as the name for one), media blob, file message (as a type parallel to
Message), attachment singular (a message has as many as it has)

**Upload**:
Putting a file where the API can reach it: `POST /conversations/:id/files`, answered with the object
it stored. Always before the send that names it — the other order would put a message in front of
everyone else pointing at a URI only one phone can open — and its own delivery state on the bubble
(*Uploading…*, then *Sending…*), because on a phone it is the part that takes time. Streamed from
disk rather than read into memory; see `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`.
_Avoid_: Attach (as the verb for this), send (when the upload is meant), POST the file

**Voice note**:
An `audio` Attachment recorded in the composer, not a file picked from the library, and rendered
as a player with a waveform rather than as a file row. What makes it one is `messageType: 'voice'`,
which the API accepts only for a message that is one voice note and nothing else — a voice note sent beside a photo is `media`, like anything
else carrying more than one thing. Its duration and its bar levels were measured by the recorder and
are carried across the upload by hand: the file endpoint received a file, so it reports a file.
_Avoid_: Voice message, audio message, audio clip, mic message, voicemail


### Local store

**Store**:
The one in-memory copy of everything the screens read — the Conversation list, the Messages of the
threads that have been opened, the Outbox — kept on disk so a cold start has something to draw before
the API answers. Reducers are the pure functions in `lib/conversation-state.ts`, unchanged: what is
new is that every state they produce is written through to SQLite, and that a boot reads one back.
Screens read the Store and never the network, and a socket event, a fetched page and a typed message
all reach them the same way — through it. See
`docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`.
_Avoid_: Cache (it is not an optimisation the app can ignore), database (that is where it is kept),
local state, offline store (nothing here composes offline)

**Restore**:
Reading the Store back from SQLite at cold start, so the first frame after the Launch animation is
the last thing this device knew rather than a spinner. Not Hydration, which is the *session's* cold
start and belongs to auth: a boot does both, and they answer different questions — Hydration asks who
this is, Restore asks what they were looking at. Restore has no failure a person sees; an unreadable
database is discarded and the boot proceeds with nothing.
_Avoid_: Hydration (that is auth's, and the collision is the reason this word exists), rehydrate,
load from cache, warm start

**Stale**:
Restored data that the current session has not yet confirmed. Every cold start and every return to
the foreground refetches, so staleness is measured in the seconds before that answer lands — but it
is real, and it is the price of drawing something immediately. Reads tolerate it and sends tolerate
it; Engage and Takeover do not, and re-read the conversation from the API before they fire, because
the Unassigned pool is contested and a stale row there loses a race that a spinner would have won.
_Avoid_: Out of date, dirty, invalid, expired (that is what a Session does)

**Outbox**:
Unsent messages that have outlived the process that typed them. An Unsent message has always
survived a failed request; what the Store adds is surviving a restart, so a message typed on a train
is still there tomorrow, still marked *failed*, still offering to go again. Never sent on its own:
a message abandoned on Tuesday must not leave on Thursday without somebody tapping it.
_Avoid_: Queue (nothing drains it), retry queue, pending messages, drafts (a draft was never sent)

**Eviction**:
Discarding the history the Store is not going to be asked for. Every Conversation row is kept, always
— a partial list is a list that lies about what exists — but Messages are kept only for the twenty
most recently active threads, fifty each, and Attachment files only up to a fixed budget, oldest
used first. Asking for a page older than what was kept reads SQLite before it reads the API, which is
the whole of the load this is meant to take off it.
_Avoid_: Pruning, cleanup, garbage collection, cache invalidation (nothing here is invalidated)

### Notifications

**Push notification**:
The banner the operating system draws when a Message arrives and this app is not in front of the
person. Delivered by Expo's push service against a token this device registered, and *not* the same
thing as the Notification row the API writes: a row is written for every recipient of every message,
and only some of them are worth waking a phone for. Suppressed entirely when the app is foregrounded
on the thread it is about. There is no background connection behind it and there is not going to be
one — a Push notification is how a closed app learns anything at all.
_Avoid_: Notification (bare — say which), local notification, alert, background message

**Notification row**:
The API's own record that something happened for a person, written by its `notifications` module and
announced as `notification.created`. Older and broader than a Push notification, which is one
*dispatch channel* for some of them. This client renders none of these rows and has no screen for
them; it names them only so the two are not confused.
_Avoid_: Notification (bare), in-app notification, activity, feed item

**In-app banner**:
What a Message gets instead of a Push notification when the app is open on some other screen: a
strip at the top of the current screen naming the sender, tappable into the thread, gone on its own.
Neither the OS's surface nor a second unread count — the Conversation row and the tab badge have
already moved by the time it appears, and it exists to say *which* thread moved.
_Avoid_: Toast (that is for something the person just did), snackbar, heads-up notification, alert

**Mute**:
Turning off a conversation's notifications, held by the API per person per conversation
(`PUT`/`DELETE /notifications/mutes/:conversationId`) and applied before its recipient list is even
frozen — so a mute suppresses the Notification row and the Push notification together, rather than
hiding one after the fact. Reached from Conversation details.
_Avoid_: Snooze (that ends by itself), block, unsubscribe, turn off notifications (that is the OS
permission)
