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
The address book anybody picks from when starting a conversation, backed by
`GET /conversations/contacts`. A *contact* here is an addressable person of any role — unrelated to
the end-user role, which is Customer. The two must not be collapsed. The endpoint answers for all
three roles and the row says what a tap does: a Customer's contacts are the organizations they
belong to, an Agent's are the Customers whose Support DMs they can see plus the rest of the staff,
and an Admin's is the whole directory. Every row already names the thread that exists between the
two, where one does. Reached as the People tab by staff and as the New Message sheet by everyone.
_Avoid_: Contacts (bare, when the Customer role is meant), directory, people picker, Users (that is
the Account directory)

**Account directory**:
The Admin's list of every account, backed by `GET /users`, reached from the Admin hub. Not the
Contact list: this is who *exists* and what may be done to them — role, ban, sessions, two-factor,
password, deletion — where the Contact list is who you can write to. An Admin's own row offers none
of it, which is this client's rule rather than the API's.
_Avoid_: Users tab (the tab is People, which is the Contact list), user management console

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
Oversight role with slim mobile surface: the hub, People, the Unassigned pool, conversations, and
the org-wide settings the hub leads to — the Account directory, Organizations and Labels. Full
analytics and the audit log stay on web.
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

**Reaction**:
One emoji a person puts on a Message, and one per person per Message — picking another replaces the
last rather than joining it, which is the API's rule and `toggleReaction`'s. Drawn as a chip row
under the bubble, one chip per emoji with a count. A tap changes the bubble before the request
leaves and a refusal puts it back, so a chip on screen is one that has been written or is about to
be. Somebody else's arrives as the reacted Message over the Realtime connection, and persists with
it.
_Avoid_: Like, vote, emoji (bare, when the reaction is meant)

### Session

**Session cookie**:
The Better Auth session cookie the API sets, held in the device keychain and replayed on every request as a `Cookie` header this client sets by hand. Opaque to the app — never parsed, only stored, sent, and discarded.
_Avoid_: Session token, JWT, access token, bearer token

**CSRF token**:
The double-submit value fetched from the API and sent as `X-CSRF-Token` on every mutation, alongside the `csrf-token` cookie it is paired with. Not bound to a session — one is fetched, cached, and reused until the API rejects it.
_Avoid_: XSRF token, nonce, anti-forgery token

**Request deadline**:
The bounded silence every round trip through `lib/api-client` is given before it is abandoned —
fifteen seconds each, the CSRF pre-flight and the streamed upload included, and a body that stalls
after its headers arrived counts as silence too. Per round trip rather than per call, so a mutation
whose pre-flight is also hung is bounded by several of them rather than by one. An abandoned
request is a transport failure and nothing else: it is the same `{ reached: false }` a dead network
produces, so it reads as Hydration's Unreachable outcome and is never a Session expiry. It measures
silence rather than duration, which is why an upload still reporting bytes is never abandoned for
being large.
_Avoid_: Timeout (as a state the app has), request expiry, retry window

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
Reading the stored Session cookie at cold start and exchanging it for the signed-in Customer, Agent,
or Admin. Ends in one of three states: signed in, signed out, or unreachable — and the first of
those has two flavours, because a cookie the API could not answer for still signs in the Kept person
beside it, as a Stale session.
_Avoid_: Bootstrapping, session restore, rehydrate

**Kept person**:
The signed-in person stored on this device beside the Session cookie — an id, a name, an email and a
role, in the same keystore, written on every established session and destroyed by every moment that
discards the cookie. It is not a credential: no cookie is no session however well this device
remembers who was here, and a `401` takes it along with everything else. What it is for is the one
question a cookie alone cannot answer with no network — who this is — which is what the Restore needs
before it can draw a Conversation list. See
`docs/adr/ADR-0010-a-kept-person-answers-an-unreachable-hydration.md`.
_Avoid_: Cached user, stored identity, offline user, profile

**Unreachable**:
The Hydration outcome where a Session cookie exists, *nobody is kept beside it*, and the API could
not be reached. Distinct from signed out: the cookie is kept and the person is not sent to sign-in.
Since the Kept person it is the narrower case it always described — a device holding a credential and
no idea whose — which in practice is a session established by a build that had no Kept person, or one
whose keystore refused the write.
_Avoid_: Offline, error, disconnected

**Stale session**:
A session Hydration could not confirm: the Kept person, signed in, drawn from this device rather than
from the API. Everything on screen is what this phone last knew, which is what every Restored screen
shows anyway, so it looks exactly like a confirmed one — the failures speak instead, and they read as
the network, because a write against a Stale session fails the way a write against any dead network
does. Confirmed by an *authenticated* refetch at the three moments this app can see the server answer —
entering the state, returning to the foreground, and the socket connecting — which is why a cookie
that expired meanwhile is an ordinary Session expiry rather than a silent sign-out. Not a status of its own: every screen asking whether somebody is signed in is told yes.
_Avoid_: Offline session, cached session, unverified session, half signed in

**Session end**:
Either of the two ways a session stops: signing out, deliberately, and Session expiry. Both discard
the Session cookie and everything derived from it — role included, and the Kept person with it — and
both land on sign-in, whatever the person was looking at. Both also Wipe: nothing of a person's
Conversations outlives their session on this device. Hydration's Unreachable outcome is not one, and
neither is a Stale session: both keep the cookie, and so keep the Kept person and the Store.
_Avoid_: Session exit, teardown, logout (as the name for both)

**Session expiry**:
The involuntary Session end. The API's sessions are a seven-day sliding window with no refresh token, so a Session cookie simply stops being accepted; an authenticated request answered `401` discards it and returns the person to sign-in with an explanation, never to a screen that has quietly stopped loading. A `403` is not one — that is a verdict on the request, not on the session — and neither is a transport failure, which changes nothing. A request abandoned on its Request deadline is a transport failure by construction, because silence says nothing about whether the cookie is still good: reading it otherwise would end a session because a train went into a tunnel.
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

**Transfer**:
The assignee of an engaged Support DM handing it to another Agent. The API's `transfer` action, and
the assignee's alone — `assertCanTransfer` refuses anybody else, an Admin included, so an Admin who
wants somebody else's thread takes it over first. The target must be an Agent and must not be the
current holder. Distinct from Takeover, which is unilateral and names no destination but the actor.
_Avoid_: Handover, reassign (that is what the *event* is called), escalate

**Close**:
The assignee ending an engaged Support DM. The API's `close` action, and not final: the Customer
writing in reopens it, and it returns to whoever closed it — which is why nothing about it reads as
destructive. Shown in the thread's state as Resolved, the word the product uses for a thread that is
done with.
_Avoid_: Resolve (as the action's name), archive, delete

**Organization**:
The container everything in this product belongs to — every conversation, every membership, every
saved inbox. An Admin creates, renames and deletes them; the member and conversation counts on each
are the API's. A Staff DM, a group, a Community and a Post each belong to exactly one.
_Avoid_: Team (that is the API's `/team`, the single tenant name), workspace, company (a *company*
is what a Customer's contact row for an organization is called)

**Invitation**:
The only way into an organization. An Admin invites and the person accepts; there is no route that
grants a membership directly, so creating an account takes organization ids that become invitations
rather than memberships. Answered from Settings, by every role, and the card draws nothing at all
when there is nothing to answer. Declining answers one ask rather than standing as a refusal, so a
declined organization can be offered again.
_Avoid_: Add to organization, membership request (the direction is the other way)

**Saved inbox**:
A name and a set of organizations, private to one person, from `GET /inboxes`. Selecting one narrows
the conversation rows already held rather than fetching a different list — the API already scoped
`GET /conversations` by who is asking, and an inbox can only ever narrow within that — so switching
costs no request and works with no signal. An inbox naming an organization the person has since left
simply matches nothing.
_Avoid_: Folder, view, filter preset, Inbox (bare — the inbox is the conversation list)

**Community**:
A named container of groups inside one Organization, created by an Admin on web. Its members see the
groups linked to it and may join one; nobody outside it can see that it exists, and there is no link
that lets anybody in — an Organization's Invitation is still the only door into anything. Reached as
a second tab above the Conversation list rather than as a destination of its own, because what a
Community holds is conversations. It **expands in place** there, onto its Announcements thread and
the Groups the viewer is in, each of them a conversation row a tap opens; only a bounded number of
Groups are drawn, and **View all** at the end opens the **Community screen**, which is the same rows
unbounded. A Community carries no messages of its own — what it holds is threads, and a broadcast to
an Organization is a Broadcast rather than anything here.
_Avoid_: Space, hub, channel group, Wall (a different feature entirely)

**Announcements thread**:
The one-way conversation pinned at the top of a Community's rows, which `GET /communities/:id/groups`
answers first and marks `pinned`. Its own kind rather than a Group: every member is in it and nobody
joins or leaves it, and the feed says nothing about muting it. It carries no unread count there
either — the Conversation list holds the same thread and is where that number comes from.
_Avoid_: Community announcement (the retired one-way *Community* itself), Broadcast (that is
org-wide and not a conversation), Group

**Join policy**:
How somebody gets into a group — *request* (a Join request a Moderator answers, and the default) or
*open* (walk in). A property of the group, read off it rather than assumed: a row offers *Ask to
join* or *Join* depending on it, and says so while a request is pending. Set on web only.
_Avoid_: Approval mode, Invitation (that is an Organization's), private, locked

**Join request**:
A member of a Community asking to enter one of its groups, held until a Moderator answers. Declining
answers one ask rather than standing as a refusal, so the person may ask again — an Invitation
pointed the other way. Withdrawable by whoever made it.
_Avoid_: Application, invite, pending member, knock

**Write policy**:
Who may send in a group — *everyone* (every member, and the default), *admins* (only those who run
it), or *named* (a chosen set, alongside those who run it). A property of the group rather than of
the person, read off the group rather than derived on the device: somebody who may not write is
shown a locked composer saying why, and a send the policy refuses never becomes an Unsent message
offering to go again. Set on web only.
_Avoid_: Read-only, Mute (that is the reader's own setting), announce-only, permissions

**Moderator**:
A member of a Community who runs it and the groups in it. Scoped to that Community and granting
nothing outside it, which is what separates it from a Capability. An Admin holds every Moderator
power without being a member. Nothing about being one is set from a phone.
_Avoid_: Community admin, owner, Admin (that is the server-owned role), Capability

**Post**:
A piece of writing by a Contributor, belonging to its author and readable across one Organization.
It leads with an image — at least one is required — and may carry text up to 500 characters, further
video and documents, and at most one labelled link button. A reader may react to it, **Vote** on it
and **Bookmark** it, and nothing else: there are still no replies, no reposts and no quotes, and a
Post has no reply count because nothing points back at it. It says how many distinct people have
seen it. Its author may edit it, and an edited Post
says so while keeping the Reactions it already had. Not a Message: a Message lives in a Conversation
and is addressed to its participants, carries a Receipt, and cannot be edited.
_Avoid_: Message, announcement, status, update, wall post

**Wall**:
A feed of Posts, and never a place a Post lives. The default Wall is every Organization the reader
belongs to and is not stored anywhere — it is resolved on each read, so an Organization gained or
lost needs no write. It is read **Recent** by default and can be read **Popular**, which ranks on
Vote score and Viewer count within a rolling recent window; sorting reorders what membership already
decided and never widens it. A custom Wall narrows it to named Organizations; anyone may make one and share
it, and because what may be *shown* is still membership, two people opening one shared Wall see
different Posts. A Wall naming only Organizations the reader has left is an empty Wall rather than a
refusal — the same way a Saved inbox that names one simply matches nothing.
_Avoid_: Feed, timeline, board, community wall, Saved inbox (the same shape one level away, but over
Conversations)

**Vote**:
A reader pushing a Post up or down — at most one per person per Post, and the signal a Popular Wall
ranks on. Where a Reaction is expression, a Vote is a judgement. A Post shows a net score and never
how many people voted it down.
_Avoid_: Like/dislike (those are the icons, not the concept), rating, karma, Reaction

**Bookmark**:
A Post somebody saved for themselves. Private: nobody sees another person's, and a Post never says
how many people saved it.
_Avoid_: Save, favourite, star, pin, collection

**Viewer count**:
How many distinct people have seen a Post, its author excluded, counted once per person ever. Not a
Receipt — a Receipt says a Message reached the people it was addressed to, and a Post is addressed to
nobody.
_Avoid_: Views (bare), impressions, reach, Receipt

**Contributor**:
Somebody permitted to write Posts in a given Organization. Staff by default, a Customer by a grant an
Admin gives. A claim about trust and not about identity — a Contributor is permitted to post, not
verified to be anybody.
_Avoid_: Verified user, publisher, poster, author (that is whoever wrote a given Post)

**Reply to a Post**:
Opening the reader's *own* support conversation with a reference to the Post in the composer. Never a
thread on the Wall and never a message to the Post's author, which is what stops a Customer's Post
becoming a way for Customers to reach each other. The word survives only because it is what the
button says.
_Avoid_: Comment, thread, Reply (bare — that is a Message quoting another), Message the author

**Offers**:
In-app promo carousel plus the shared group chat `id: 'offers'`. `"Sponsored"` is a section label only.
_Avoid_: Stories, ads, sponsored content (as a product feature)

**Launch animation**:
The looping transparent character animation on the cold-start screen, shown while the session hydrates. Rendered from an animated WebP; the surface behind it is the app background, not part of the asset.
_Avoid_: Splash screen (that is the separate native `expo-splash-screen` surface this screen dismisses), loading video, chroma-keyed video

**Launch gate**:
What has to be true before the Launch animation ends: it has played its two seconds, *and* the first
Conversation fetch has **settled**. Settled means answered, failed, **or** abandoned on the Launch
deadline — with the Store there is something to draw whichever it is, and an animation held open on
a bad network is the failure the gate exists to prevent. Both halves count in either order. Hydration's Unreachable outcome is not part of
it: that is a screen with a retry on it rather than a Hub to hand over. What bounds the wait is the
**Launch deadline**. Where the launch then *lands* takes one more input — a **Pending thread** — but
the gate itself is unchanged by it: a tapped notification does not shorten the wait, because the Hub
underneath the thread still has to exist. The decision is `lib/launch-route`.
_Avoid_: Splash gate, minimum display (that is only the animation's own half), loading gate

**Launch deadline**:
The bound on the Launch gate's wait: ten seconds from the first Conversation load starting, after
which the fetch is **abandoned** and the gate hands over whatever this device already holds. One
clock per launch — a Resync abandons the load in flight and starts another, and restarting the clock
with it would bound every round trip and never the launch. Armed in `lib/conversation-inbox` beside
the load it bounds, never in the launch screen; the clock is `lib/launch-deadline`. Shorter than a
Request deadline on purpose: it limits what somebody is asked to watch rather than what the network
is allowed to take. A *Try again* that succeeds starts a launch, so it gets one too.
_Avoid_: Request deadline (that is the same word about a round trip, and this one is not built from
it), launch timeout, splash timeout

**Tab capsule**:
The floating rounded nav bar at the bottom of every role. Icon-only — destination names live in the accessible name, not on screen. The Wall is a destination on it, a peer of Messages rather than something inside it; Communities deliberately are not, because a Community is a place conversations live and belongs on the Conversation list.
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
the API answers. Reducers are the pure functions in `lib/thread-state.ts` and `lib/conversation-list.ts`,
unchanged: what is
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
Restored data that the current session has not yet confirmed. A Stale session is the same word about
the session itself — who this is, rather than what they were looking at — and the two arrive
together on a cold start with no network. Every cold start and every return to
the foreground refetches, so staleness is measured in the seconds before that answer lands — but it
is real, and it is the price of drawing something immediately. Reads tolerate it and sends tolerate
it; Engage and Takeover do not, and re-read the conversation from the API before they fire, because
the Unassigned pool is contested and a stale row there loses a race that a spinner would have won.
_Avoid_: Out of date, dirty, invalid, expired (that is what a Session does)

**Outbox**:
Unsent messages that have outlived the process that typed them. An Unsent message has always
survived a failed request; what the Store adds is surviving a restart, so a message typed on a train
is still there tomorrow, still marked *failed*, still offering to go again. Never sent on its own:
a message abandoned on Tuesday must not leave on Thursday without somebody tapping it. Every Unsent
message is written whatever its Delivery state and every one comes back *failed*: a send that was in
flight when the process died did not survive the thing that was sending it, nobody knows whether it
landed, and *failed* is the state that offers to go again. A staged Attachment comes back with the
message carrying it — but the picker's copy of the file lives in the system cache, which the system
reclaims, so a retry reads the file before it sends and names the one that has gone rather than
failing on it. A Restored message the API turns out to have received all along is resolved by the
copy that comes back rather than drawn beside it — the same words twice, one confirmed and one
offering to post a third. That is the one thing being Restored changes about an Unsent message: a
send that failed while somebody watched keeps its place, because they were told and the bubble is
what they were told with, and a Restored one has told this session nothing. The match is only ever
made against the person's own messages, and on a fetched page only against ones this device has
never held — the copy of an Unsent message is one of those by construction, and history that reads
the same is not — because a bubble kept is a message somebody can send again and a bubble dropped
is a message that is gone.
_Avoid_: Queue (nothing drains it), retry queue, pending messages, drafts (a draft was never sent)

**Wipe**:
Destroying everything a session left behind — the database file itself, not the rows in it, the
downloaded documents with it, and this device's Device registration, which is the one item on the
list that is not on the device. Every moment that discards the Session cookie
reaches it, and they are not only the two that end a session: signing out, a Session expiry, a cold
start that finds no cookie, and a sign-in the API refused. The third covers a sign-out the operating
system killed halfway; the fourth is not a Session end at all and wipes anyway, because nothing on
the device belongs to a session that was never established. Hydration's Unreachable outcome reaches
none of it. What a Wipe removes stays removed: it bars the people it took the Store from until they
Restore again, so a socket event landing in the moment between the credential going and the screens
being told cannot write the list back. A Wipe cannot fail a Session end — a database the platform
will not delete is not something the person being signed out can do anything about, so signing out
completes regardless, as it already does when telling the server fails; the Device registration is
the same rule reaching off the phone, started and not waited for. Not Restore's opposite either:
Hydration's Unreachable outcome keeps the cookie, so it keeps both the Store and the registration. Not Eviction, which is about
size and keeps the database: a Wipe is about entitlement and leaves none of it. The database is
excluded from both platforms' device backups so it cannot be lifted off the phone by a backup tool,
while the rest of the app is still backed up — a deny-list, which is why a test fails when the app's
own code names the document directory rather than the cache. It is deliberately not encrypted,
because `expo-sqlite` has none built in and the threat model that would need it already defeats the
Session cookie in the keychain. See ADR-0011.
_Avoid_: Clear, purge, reset, log out the store, invalidate

**Eviction**:
Discarding the history the Store is not going to be asked for. Every Conversation row is kept, always
— a partial list is a list that lies about what exists — but Messages are kept only for the twenty
most recently active threads, fifty each, and Attachment files only up to a fixed budget — 250 MB —
oldest used first. Asking for a page older than what was kept reads SQLite before it reads the API,
which is the whole of the load this is meant to take off it.

Messages are ranked by **conversation activity** — the row's `lastMessageAt`, not the newest Message
this device happens to hold. The two part company on exactly the threads worth keeping: one that has
been busy all morning while the person read something else holds Messages from yesterday and is the
next thread they will open. A thread whose Messages went still appears in the list; opening it
fetches, the same as a thread never opened. Paging is reset for every thread a sweep touched —
emptied or merely shortened — so none of them can restore a cursor pointing at history it no longer
has; the shortened one is the case that is easy to miss, because it still has Messages and its
cursor is further back than the oldest of them. What a sweep removed stays removed: a swept thread
takes no further writes until it is Restored, because memory is still holding what was taken and
patching that onto what is left is what would put a hole in it. An Unsent message is out of reach by
construction — the Outbox is a table of its own and no sweep names it.

Both sweeps run **after a write** rather than on a timer: a thread's Messages are the only thing that
makes the database bigger and a download is the only thing that makes the cache bigger, so each is
bounded by activity, and a phone left closed does nothing. A sweep never chooses the thread whose
write it followed — that is the thread on screen, memory is still holding its Messages, and taking
them would be a write that undoes itself.

*Used* means last **read**, not last downloaded, so a document opened every week outlives one
fetched yesterday and never touched. The filesystem records only when a file was modified, so being
read writes a marker beside it — the `.used` file — and that marker is what the order is made of. A
copy with no marker is ordered by when it arrived, which is the honest answer for one cached by an
earlier build. Discarding is always safe here: everything is re-fetchable, and a file that is gone
costs a download.

An entry being downloaded right now is **pinned**: counted against the budget, never discarded to
meet it. Only the `attachments` directory is ever read, so no device URI an Upload is streaming from
can be reached at all.
_Avoid_: Pruning, cleanup, garbage collection, cache invalidation (nothing here is invalidated),
trimming (the operations are `evictAttachmentFiles` and, for the database, `planEviction`)

### Notifications

**Push notification**:
The banner the operating system draws when a Message arrives and this app is not in front of the
person. Delivered by Expo's push service against a token this device registered, and *not* the same
thing as the Notification row the API writes: a row is written for every recipient of every message,
and only some of them are worth waking a phone for. Never drawn at all while the app is in front of
the person — the thread it is about is either on screen, where the bubble already says it, or it is
not, where the In-app banner does. There is no background connection behind it and there is not going
to be one — a Push notification is how a closed app learns anything at all.
_Avoid_: Notification (bare — say which), local notification, alert, background message

**Notification tag**:
`<conversation>:<notification>`, set by the API on every dispatch that names a conversation, and on
Android the only part of one that survives into the shade. Expo sends an FCM `notification` block so
that a closed phone draws something at all, which means Firebase draws it before any of this app's
code runs — and what the app reads back later is the *Android* notification: a title, a body, and
none of the payload the tap path reads. So the routing travels in the tag as well, which is what a
read has to match on to clear the right thread's notifications. Prefixed by the conversation so a
thread can be cleared at once; suffixed by the notification so the tag stays unique, because Android
*replaces* a notification sharing a tag and a bare conversation id would silently collapse a thread
down to its newest message. Read by `notificationIdsForConversation`, which prefers the payload
wherever it survived.
_Avoid_: Collapse key, group key, thread id (that is iOS's), notification key (that is Android's own)

**Notification permission**:
The operating system's own answer to whether this app may draw a Push notification at all, held by
the platform rather than by the API and scoped to the installation rather than to whoever is signed
in. Asked for at two moments and once: after a first sign-in, and when a Message somebody else wrote
first arrives, with the app in front of the person, for somebody that first never reached. Both platforms draw their dialog once and refuse a later request
without drawing anything, so both triggers are guarded on the same standing — `canAskAgain` plus a
record of the ask under `Paths.cache`, never the status, which on Android 13+ reads `denied` on a
phone nobody has asked. Once neither trigger will ever ask again, Settings offers a route into the
platform's own settings, which is by then the only place the answer can change.
_Avoid_: Notification setting (that is the platform's screen), opt-in, subscribing (that is the
browser's), turning notifications on (say whose — the OS's or a Mute)

**Post notification opt-in**:
Which Organizations may notify somebody about a Post — a switch each, kept by the API on the
notification settings document and empty until somebody fills it. The opposite direction from
everything else here, which is the whole of it: a Broadcast reaches whoever has not opted out and an
essential one reaches past even that, a thread notifies until it is Muted, and a Post notifies nobody
who has not named its Organization. There is no kind of Post that overrides it, so there is nowhere
an override could be read from — the switch is on because its Organization is in the list, and the
list is the only thing consulted. It is not a Notification permission and cannot grant one: a phone
whose notifications are not on is told so under the switches rather than asked, because both moments
that ask are elsewhere and each asks once — and told in the words the standing warrants, since a
phone nobody has asked is not a phone that said no. Decided in `lib/post-notifications`, drawn on
Settings beside the route into the platform's own settings, which is offered on exactly the standing
the harder sentence is.
_Avoid_: Subscribing, following, Mute (the other direction, and over a Conversation), Notification
permission (the operating system's answer, not the API's)

**Push audience**:
Which of a Notification row's recipients this phone is also woken for. Nearly all of them: a Message
in any conversation the person is a recipient of, which reaches the Unassigned pool without a rule of
its own because an unassigned Support DM's recipients *are* the whole staff pool. The one
subtraction is a group or an announcement, which stops at its members — every Admin is a recipient of
those without being a member, and their row is not a reason to put every room in the organization on
their lock screen. Three more push without being a Message, because each is something that happens to
the recipient rather than something said to them: a Transfer, an Engage or Takeover of the thread
they held, and being added to a group. Deliberately not the web audience, which is Support DMs only
and staff only; see ADR-0009.
_Avoid_: Recipients (that is the row's list — say which), subscribers, targets

**Push token**:
The string Expo's push service dispatches against — `ExponentPushToken[…]`, issued to this
installation rather than to the person using it. Registered under whoever is signed in
(`POST /push/devices`, idempotent on the token) after a sign-in and on every launch that finds a
session, because it rotates and a row holding an old one dispatches into nothing. Not a credential:
it authenticates nobody and is registered *with* the Session cookie rather than instead of it.
_Avoid_: Device token (that is the FCM one underneath), subscription (that is the browser's), push ID

**Device registration**:
The API's row saying this phone's Push token belongs to the person signed in on it, and the third
thing a Wipe destroys. Written by every registration and removed by a Session end
(`DELETE /push/devices`, owner-scoped and idempotent), so a phone handed to somebody else stops
showing the previous person's conversations on its lock screen. Its removal is subordinate the way
the rest of a Wipe is: the ending Session cookie is captured before it goes and presented to the
`DELETE`, nothing on the device waits for the answer, and a failure is a row the API keeps for a
while longer rather than a sign-out that did not happen. A Session expiry is that failure by
definition — the cookie is dead, which is how the expiry was noticed — and what closes it is the
next registration on this phone, which moves the row to its new owner rather than adding one. Which
token to name is a record under `Paths.cache`, beside the record of the ask and outliving a Session
end for the same reason. Held in `lib/push-registry`.
_Avoid_: Subscription (that is the browser's), device, enrolment, the token (that is the string
inside it)

**Pending thread**:
The conversation a tapped Push notification asked for, held only while nothing can act on it yet — a
cold start, where Hydration, Restore and the Launch gate are all in front of it. It is the Launch
gate's third input rather than a route of its own, so a signed-in launch opens that thread over the
role's Hub and every other outcome is what it always was: no session sends the person to sign-in and
drops it, and Unreachable keeps it, because that cookie is still good. A tap while the app is running
never becomes one — there is a Hub already, so the listener navigates. Held in `lib/push-intent`,
decided in `lib/launch-route`, read out of the payload by `lib/push-rules`.
_Avoid_: Deep link (that is the magic link's mechanism), initial route, notification route, intent
(bare — that is Android's own word for something else)

**Notification row**:
The API's own record that something happened for a person, written by its `notifications` module and
announced as `notification.created`. Older and broader than a Push notification, which is one
*dispatch channel* for some of them. This client renders none of these rows and has no screen for
them; it names them only so the two are not confused.
_Avoid_: Notification (bare), in-app notification, activity, feed item

**In-app banner**:
What a Message gets instead of a Push notification when the app is open on some other screen: a
strip at the top of the current screen naming the sender, tappable into the thread, gone on its own
after five seconds and dismissible by hand before that. Neither the OS's surface nor a second unread
count — the Conversation row and the tab badge have already moved by the time it appears, and it
exists to say *which* thread moved.

Fed by the socket rather than by an arriving dispatch, which is the load-bearing choice in it: the
strip has to appear for somebody who refused the Notification permission, whose conversations move
exactly as everybody else's do, and the socket is already what moves the row and the badge. One
event, three surfaces. Four kinds of Message never get one — a viewer's own, a System notice, one in
the thread on screen, and one that arrived while the app was behind something, which the operating
system has already drawn. The first two are `bannerNotice`'s; the last two are facts about the
moment rather than about the Message, and the thread on screen is declared by the thread screen
rather than read off the router, for the reason a Pending thread is.
_Avoid_: Toast (that is for something the person just did), snackbar, heads-up notification, alert

**Mute**:
Turning off a conversation's notifications, held by the API per person per conversation
(`PUT`/`DELETE /notifications/mutes/:conversationId`) and applied before its recipient list is even
frozen — so a mute suppresses the Notification row and the Push notification together, rather than
hiding one after the fact. Reached from Conversation details.
_Avoid_: Snooze (that ends by itself), block, unsubscribe, turn off notifications (that is the OS
permission)
