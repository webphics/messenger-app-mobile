# Enki (internal support messenger) — scope

Self-contained internal chat for support. Users log in. Three roles:

| Role | Sees |
|---|---|
| Customer | Own conversations only |
| Agent | Assigned + unassigned pool. Not other agents’ private histories. Cannot delete. |
| Admin | Global oversight. User management, assignment/transfer, broadcasts, deletion (audit later). |

Role names match the API's `role` enum (`admin | agent | customer`) exactly. This client
previously called the end-user role Contact; see `CONTEXT.md`.

Platforms (whole product): Next.js web, Expo iOS/Android, NestJS + Postgres + Socket.IO/Redis. **This repo is Expo only.**

Mobile in this app includes Customer, Agent, and a **slim** Admin surface (overview, users, conversations, settings). Full analytics, audit log UI, and SLA config stay on web.

## Not this product

- Stories
- Case-status stepper (Received → Assigned → In Review → Resolved)
- Casewire name/branding

Offers (Phase 1) are an in-app promo carousel plus a shared group chat (`id: 'offers'`). `"Sponsored"` is a label. Not stories, not an ad SDK.

Broadcasts are in-inbox announcements (later), not stories.

## Phases

0. Scaffold (done)
1. Basic UI mock (done) — Customer hub, inbox, thread on mock data.
2. Mock auth shell + role hubs (done) — login/register, AsyncStorage `{ email, role }`, splash/icon. Agent/Admin hub variants (mock knowledge / charts / add offer).
3. **Real auth (done)** — cookie sessions against the NestJS API, mirroring the web client, stored in `expo-secure-store`.
   - **3a. Password + magic link (done)** — `lib/api-client.ts`, `AuthContext`, real Hydration,
     magic-link deep link. Google button rendered disabled. 2FA out (see ADR-0004). The mock shell
     it replaced is gone with it: no register screen, no control that sets a role.
   - **3b. Google sign-in (done)** — needed a native module, so an EAS `development` profile and a
     Development client. Auth is the only part of the app that no longer runs in Expo Go. The ID token is
     minted for the *web* OAuth client so the API's existing audience check accepts it unchanged —
     see ADR-0005, and do not remove the web client identifier from the mobile configuration. 2FA
     is refused here with the same sentence the password path uses, because the API's two-factor
     hook fires on Google sign-in too.
4. Realtime (socket.io) + REST (TanStack Query). Every role's *conversations* are real —
   the list, sending, unread, and live delivery over a cookie-authenticated socket. The Admin's
   user directory is not; that is its own endpoint and its own ticket. Two connections — a global one
   and one per open conversation — mirroring the web client, with events folded into the same pure
   functions a fetched page goes through, so a reconnect resync arrives as nothing rather than as a
   second copy — as does the API's re-broadcast of a message whose receipt has advanced, which is
   how a tick moves without a refresh.
   See `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`.

   Staff read the same list a Customer does. `GET /conversations` is scoped by the API's own
   policy, so an Agent's assigned threads, the unassigned pool, their staff DMs and their groups
   arrive in one answer and the screens divide it up — the pool is a filter over that list rather
   than a second request, and an Admin's org-wide set needs no client-side narrowing at all.
   Starting a staff DM goes through the Staff directory (`GET /conversations/staff`) and the
   get-or-create beside it. What staff see that a Customer does not is the System notice: an
   Engage, Takeover or Transfer, rendered as a centred line rather than a bubble.

   Engaging and taking over are here. Both sit where the composer would be, because that is where
   the sentence saying why this person cannot write already sat: an unassigned thread offers every
   staff member the Engage, and one somebody else holds offers an Admin the Takeover and offers an
   Agent nothing — the API refuses an Agent's Takeover `403` whatever the thread's state. The row
   the action answers with goes into the shared list, so the composer replaces the button and the
   pool loses the row without a refetch, and `conversation.reassigned` tells whoever the thread was
   taken from. See CONTEXT.md's Reassignment entry for why that event is addressed rather than
   broadcast.

   Neither fires against the row on screen. Both re-read the conversation first and check what came
   back, because the pool is the one surface several staff are competing over the same rows on: a
   lost race names whoever holds the thread now, the re-read's row replaces the one held so the pool
   stops offering something that is gone, and a re-read that never arrived asks about the connection
   instead of inventing a rival. This is the carve-out in ADR-0008; every other read and every send
   tolerates being Stale.

   Still web-only: transferring and closing a thread. The mobile client reads the assignment those
   actions produce and renders the notices they write, but has no control that performs one.
5. Media, push, i18n, list virtualization.
   - 5a. Client media UI (local attachments) — image/video/document pick + in-app voice notes; `Message.attachment` with local URI; in-bubble render; no server upload. (done)
   - 5b. **Attachments over the wire (done)** — sending uploads the file to
     `POST /conversations/:id/files` and then sends the message naming the object it answered with,
     in that order. A received attachment renders per type and, for a document, downloads into the
     device cache first, because handing one to another app wants a file rather than a URL. The
     `attachments` array is plural and every one of them is drawn — this client stages one at a
     time, the web client does not. A file the API would refuse is refused before the upload, by the
     same rules mirrored from its `conversations.upload.ts`, and the composer keeps what was staged
     so the refusal is something a person can act on. See
     `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`.
   - 5c. **What a thread is, beside its messages (done)** — the header opens Conversation details:
     the identity, the type and state, the Labels staff have put on it, the Internal notes they have
     written about it, and a row into Shared in chat, which lists every attachment and link the
     loaded history carries under Media / Docs / Voice / Links. Neither screen has an endpoint of its
     own: the gallery reads the thread's own pages, and details reads the conversation the shared
     list already holds plus `GET /conversations/labels` and `GET /conversations/:id/notes`.

     Who sees what is the API's rule, mirrored rather than invented — see `lib/conversation-details`.
     A Customer's payload carries no assignment, no labels and no notes, so a Customer's details
     screen is the identity, the type and Shared in chat. Notes are Support DMs only, because the API
     answers `404` for one anywhere else.

     Still web-only: creating, renaming and archiving a label, and jumping from a gallery item back
     to the message that carried it.
   - 5d. **Push and resume** — the only way a closed app learns anything, since the Realtime
     connection lives just as long as the foreground. `POST /push/devices` and its own dispatcher
     against Expo's service, because the API's existing `POST /push/subscriptions` takes a browser's
     VAPID subscription and an `ExponentPushToken` satisfies none of it. Pushed: a Message in any
     conversation the person is a recipient of — which already reaches the Unassigned pool, because
     an unassigned Support DM resolves its recipients to the whole staff pool — except a group or
     announcement, which stops at its members rather than reaching every Admin. Plus three things
     that happen *to* somebody rather than being said to them: a Transfer into their queue, an
     Engage or Takeover of the thread they were holding, and being added to a group. Suppressed on
     the thread it is about; an In-app banner instead when the app is open elsewhere; Mute is the
     granularity, per person per conversation, and per-event opt-out waits for a server-side one.
     Coming back to the foreground refetches through the existing Resync path.

     Needs the API: a `pushTo` on `handleConversationEngaged`, which writes a row and pushes
     nothing, and a notification kind for `group.member_added`, which today is heard only by the
     activity log. Needed it once already, for the shade: every dispatch that names a conversation
     carries a Notification tag of `<conversation>:<notification>`, because on Android Firebase draws
     the notification itself and nothing of the payload survives into the thing the app reads back.
     See `CONTEXT.md`. Android only until there is an iOS build profile. See
     `docs/adr/ADR-0009-mobile-push-is-a-second-transport.md`.

     The permission is asked for in two places: after a first sign-in, and when a Message first
     arrives for somebody who has not been asked. The second is the one that earns it — a person
     watching a reply land is being asked a question they can answer from what is in front of them —
     and the first is there so the common case does not wait for it. Both are guarded, because they
     have to be: Android 13+ and iOS each show the system dialog once, and a request after a denial
     is refused without drawing anything. So the second trigger fires for somebody the first never
     reached, never as a second ask.

     The guard is *not* "while the status is undetermined", which is what this said until #58 was
     run on the emulator and drew nothing. `expo-notifications` answers Android 13+ by reading
     `areNotificationsEnabled()` before the runtime permission, and that is false on a fresh
     install, so a phone nobody has ever asked reports `denied`. What decides it is `canAskAgain`,
     the platform saying whether a request would draw a dialog at all, plus a flag recording whether
     this device has asked — because Android reports a dismissal and a single refusal identically
     and `canAskAgain` cannot separate them. The flag lives under `Paths.cache`, so that it outlives
     a Session end, as the platform's own once does, and does not outlive the install, which a copy
     riding a device backup onto a phone with a reset permission would.

     The second trigger asks three things of the moment and only the first is about the Message:
     that somebody else wrote it — a viewer's own message and a System notice are the app talking
     about itself — that the app is in front of the person, because the socket is not torn down when
     it goes behind something and a dialog raised into a pocket is answered by nobody and spent for
     good, and that this process has nothing registered already, since a phone the first trigger
     registered has nothing left for the second to do.

     Which is also what decides the Settings row: somebody who has said no is offered a route into
     the platform's own settings, and it is offered exactly when neither trigger will ever ask
     again — the same standing read the other way round, rather than a second rule about `denied`.
     A phone that has never been asked reports `denied` on Android and is offered nothing, because
     the ask is still coming; somebody who dismissed the dialog is offered it while the platform
     still says it would draw one, because `askedBefore` says it already has. Read again on every
     foreground, since the answer changes out there and not in here. No prompt, no nag, and nothing
     that arrives uninvited: it is a row on a screen somebody chose to open.

     A tap opens the thread it is about, and the cold start is the whole of the problem — Hydration,
     Restore and the Launch gate are all in front of it. It is not a second route: `launchDestination`
     already answers where a launch lands as a pure function of Hydration and the Conversation fetch,
     so the conversation a notification asked for arrives as a third input, and the one signed-in row
     that has a Hub behind it answers `chatHref(id)` instead of the role's Hub. Every other row is
     unchanged, and the wait is the one already there: a thread Restores from the Store, but the Hub
     underneath it has to exist for Back to mean anything.

     A tap while the app is running does not go near any of that — the listener navigates. A tap
     with no session goes to sign-in and the intent is dropped, because a Session end wiped the Store
     the thread would have drawn from; a tap that lands on Unreachable keeps it, because that cookie
     is still good. A conversation this device does not know is the one part that was not free: the
     thread screen resolves its row from the Conversation list, so a thread nobody had fetched read
     as *Conversation unavailable*. It asks the API for that one row and adds it to the list, once
     per id; the Messages under it were always fine, since the thread fetches what it cannot
     Restore and #49 gave it a state that says so when it cannot.

     A Session end takes the registration with it, so a phone handed to somebody else stops showing
     the previous person's support conversations on its lock screen. It is the third thing on the
     list `session-wipe` already held — the database, the downloaded documents, and now the row in
     the API's device table — which is what makes signing out, a Session expiry and a refused
     credential one path rather than three call sites. The `DELETE` needs a credential and the
     Session end has already discarded it, so the ending cookie is captured and handed down, exactly
     as it is to `POST /auth/logout`; a moment with none simply makes no request. Nothing waits for
     it and nothing is failed by it: it is the only half of a wipe that talks to a network, so it is
     started and not awaited, and a sign-out completes whether or not the row went. Which token is a
     record under `Paths.cache` beside the record of the ask, written by every registration, so the
     `DELETE` names the token the last one sent and reading it costs no round trip to Expo.

     Two endings are worth naming. Hydration's Unreachable outcome does not come through here, for
     the reason it does not wipe the Store: the cookie is kept, so the registration is kept, and
     pushes go on arriving. And a Session expiry is a `DELETE` that will fail — the cookie is dead
     by definition, which is how the expiry was noticed — so the row survives it, and no client can
     do anything about that. The next person to sign in on this phone takes the row over rather than
     adding one, which closes it for a phone somebody picks up again and *not* for one nobody
     touches: an expired session there goes on receiving previews. Removing the row server-side when
     a session ends is #57's story 38 and is the only thing that closes it properly.

     The sign-out has one ordering in it. The `DELETE` and `POST /auth/logout` both go under a cookie
     this client has already given up, and the logout is the one that makes the other impossible, so
     it waits — briefly. Briefly, because holding it back keeps the session alive on the server,
     which is a worse thing to leave running than a device row; four seconds buys the ordering on a
     healthy phone and gives it up on one where nothing was going to work anyway.
   - 5e. i18n, list virtualization.
6. The Store — one in-memory copy of everything the screens read, written through to SQLite on the
   device and read back at the next cold start, so a launch draws the last thing this phone knew
   instead of a spinner and the fetch underneath it confirms rather than reveals. See
   `docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`.
   - 6a. **The Conversation list survives a restart (done)** — `expo-sqlite`, one `conversations`
     table carrying each row's payload plus the per-thread paging metadata, and a schema version in
     `PRAGMA user_version` that is discarded rather than migrated when a build does not recognise it.
     A cold start Restores the list before anything renders — the same rows, the same Unread counts,
     the same order, the tab badge with them — and every later state, a socket event included, is
     written through by observing the list rather than by calling a writer at each transition. Writes
     are queued off the render path, coalesced to the newest state and one transaction each; a write
     that fails is swallowed, because persistence is subordinate to the app working. Split at the
     native boundary: `lib/store-rows` is pure and table-tested, `lib/conversation-store` owns SQLite
     alone and is mocked at `expo-sqlite`.
   - 6b. **Attachment files stay within a budget (done)** — the half of Eviction that touches no
     SQLite, which is why it did not wait for the rest. The downloaded copies of documents are
     bounded at 250 MB: a download that lands past the budget discards the least recently *read*
     files until it fits, which is why being read writes a marker beside the file rather than
     leaning on the modification time the filesystem already keeps. A download still arriving is
     pinned, and the sweep reads `attachments` and nothing else, so it can never take the picker's
     copy an Upload is streaming from. A discarded file is downloaded again on the next open —
     the path a reclaimed cache already took. Split the same way as 6a: `lib/attachment-budget` is
     pure and table-tested, `lib/attachment-cache` owns the filesystem and is mocked at
     `expo-file-system`.
   - 6c. **The splash ends when the list is ready (done)** — the Launch animation used to end as
     soon as it had played and Hydration had settled, but the Conversations are fetched *after*
     Hydration — three requests for a Customer — so the Hub arrived empty and filled in underneath
     the person. The gate now takes both: played, and the first Conversation fetch *settled*. Settled
     means answered **or** failed, because with the Store there is something to draw either way and
     an animation held open on a bad network is the failure this prevents; on a first-ever launch
     with nothing to Restore, `lib/api-client`'s request deadline is what bounds the wait. The
     decision stays in `lib/launch-route`, whose table grew rather than the screen's timers; the
     inbox reports the fetch separately from its `status`, which a Restored list makes `ready`
     before anything has been asked of the API. Unreachable is untouched — it is a screen with a
     retry on it, not a route, and it is not folded in with the fetch gate.
   - 6d. **A thread's Messages survive a restart (done)** — a `messages` table holding one row per
     confirmed Message, a thread that has been opened before opening on what this device already
     holds, and a scroll back that reads the disk a page at a time and asks the API only for history
     the phone does not have. Unsent Messages were deliberately not written here; the Outbox is 6f.
   - 6e. **Eviction keeps the database bounded (done)** — the other half of Eviction, and the one
     that does touch SQLite. Every Conversation row is kept, always: a partial list is a list that
     lies about which conversations exist, and the list is cheap. Messages are the opposite — kept
     for the twenty most recently active threads, fifty each, and dropped for the rest, which is
     deep history on the handful of threads anybody revisits and none on the rest. Recency is the
     conversation's own `lastMessageAt` rather than the newest Message held, which is why the row
     carries it as a column; that column is what took the schema to version 3. A thread whose
     Messages went still appears in the list and fetches when opened, with its paging reset so it
     cannot restore a cursor pointing past history it no longer has — as does a thread merely
     shortened, whose cursor is further back than the oldest Message left in it. The sweep runs
     after the write that grew the table rather than on a timer, so it is bounded by activity and a
     phone left closed does nothing, and it never chooses the thread that write was for: that is
     the thread on screen, and taking its Messages would be a write the next state change undoes.
     Split the same way as 6a and 6b: `lib/store-eviction` is pure and table-tested,
     `lib/conversation-store` owns the query and the transaction.
   - 6f. **The Outbox survives a restart (done)** — an `outbox` table holding one row per Unsent
     Message, restored into its thread on the next cold start, still marked *failed*, still offering
     to go again. It never sends itself: a support message somebody typed and abandoned on Tuesday
     must not leave on Thursday without a tap, which is the whole difference between this and a send
     queue. Every Unsent Message is written whatever its Delivery state and every one comes back
     *failed* — a send in flight when the process died did not survive the thing that was sending it
     and nobody knows whether it landed, so there is no state column to get wrong. A row whose
     Conversation has left the list goes with it, in the same statement its Messages do. A staged
     Attachment restores with its message, URI and all, but the picker's copy lives in the system
     cache and the system reclaims that — so a retry reads the file first and says which one has
     gone rather than failing on it (`lib/staged-file`). The table took the schema to version 4.
   - 6g. **A reaction is real (done)** — the reaction row on a bubble used to write to an overlay
     the thread screen held and nothing else, so it meant nothing and did not outlive the screen.
     A tap now applies through the same three steps a send does and in the same order: the bubble
     changes first, the request follows it, and a refusal or a dead network puts the bubble back.
     `toggleReaction` was already written and table-tested and is unchanged — one reaction per
     person per Message, so a second emoji replaces the first — and whether that came out as the
     API's add or its remove is read off its answer rather than off the tap. A reaction somebody
     else makes arrives as the reacted Message on `message.created` and folds in through
     `applyIncomingMessage` like any other copy of it, and because Messages persist it persists
     with them. It is deliberately the last ticket in the spec: the smallest feature that exercises
     the whole write path, so an architecture that was wrong would be wrong here too.
     The one thing it did turn up is that the *list* must ignore that broadcast: read as an
     arrival, a reaction on yesterday's message dragged the row's timestamp back to yesterday,
     previewed it with yesterday's body and dropped the conversation down an order sorted on
     exactly that. `withIncomingMessage` now takes only a message newer than the row's newest;
     the thread still takes every one of them.

7. **Org-wide surfaces** — the half of the product that is not a thread. Everything below existed on
   web and on the API and had no mobile counterpart at all, which is why an Agent could not start a
   conversation and an Admin's user screen was a fixture.
   - 7a. **The Contact list (done)** — `GET /conversations/contacts`, the one directory that answers
     for all three roles: a Customer's organizations as companies, an Agent's Customers and
     colleagues, an Admin's whole directory. It reaches staff as a People tab and everyone as the
     New Message sheet, which are the same list with different chrome, because a tap means the same
     thing in both. What a tap means is `lib/contact-directory`, pure and table-tested — a row the
     API says already has a thread opens it, a company with none creates the support thread, a staff
     member with none starts the DM, and one the pair share several organizations through asks which
     first. The staff directory is read alongside it, because it is what carries
     `sharedOrganizations` and the contacts payload does not; it may fail on its own, and a
     directory that never answered leaves the binding to the API.

     Three things here were broken rather than absent. An Agent's conversations screen passed
     `showCompose={false}`, so the one role that writes to Customers all day could start nothing. A
     Customer had no compose control either, which meant the support thread created on a first visit
     was their first organization's and nothing offered the rest. And the sheet everyone else had
     listed staff only, because it read the staff directory directly. The Admin's mock Users tab is
     gone with them; People stands where it did.
   - 7b. **Transfer, Close and the label vocabulary (done)** — the two staff actions the scope called
     web-only, on Conversation details rather than in the thread's header: they are decisions taken
     *about* a thread rather than while writing in it. `lib/thread-actions` mirrors
     `assertCanTransfer` and `assertCanClose` as one predicate, because the API asks the same three
     questions of each — a Support DM, engaged, held by the person asking. It deliberately does not
     mirror the capability check underneath: an Agent's grants are not on the session payload, so an
     Agent whose `transfer` grant was revoked is offered a control the API refuses and gets its own
     sentence back. Withholding both from every Agent for the sake of the few was the alternative.
     Neither action re-reads the thread first; ADR-0008's carve-out is for the pool several staff
     compete over, and these are about a thread this person already holds.

     Labels gained their other half. Putting one on a conversation has been real since 5c; defining
     the vocabulary is Admin's, and the new screen creates one with a colour and retires one —
     which is the delete the API does not have and should not, because an archived label stays on
     every thread already wearing it.
   - 7c. **The Account directory (done)** — `GET /users` and the nine routes around it, under the
     Admin hub rather than in the tab bar, because People took that tab and answers a different
     question. A row is a name, a role and whatever is notable; what counts as notable is
     `lib/user-directory`, table-tested, and a healthy account flags nothing. Expanded it carries
     invite, remove from an organization, change role, sign out everywhere, reset two-factor, set a
     password, ban and delete, each destructive one naming who it is about. An Admin is offered none
     of it on their own row: self-demotion, self-ban and self-delete are all permitted server-side,
     and a phone is the worst place to discover that. The Admin hub's last mock number went with the
     screen — "Active users" counted a fixture, and the tile is now the Unassigned pool, which comes
     from the list already held.
   - 7d. **Organizations, members and invitations (done)** — the container everything else belongs
     to, which the phone could neither see nor be put in. An Admin creates, renames and deletes, with
     the API's member and conversation counts beside each name and repeated in the deletion's
     confirmation. Tapping one opens its members, which is two lists asked as one question: who is
     in it, and everybody in the directory who is not — a client-side difference, because the API has
     no endpoint for "not in this organization". Inviting is the only way in, so the button says
     Invite and the row keeps saying Invited until the person accepts; removing is immediate and
     reassigns what the loss made unreadable, which is the `membership_revoked` reason already
     arriving on `conversation.reassigned`. The answering half is on Settings for every role, draws
     nothing when there is nothing to answer, and deliberately says nothing when its fetch fails.
   - 7e. **Saved inboxes (done)** — `GET /inboxes`: a name and a set of organizations, per person.
     Selecting one narrows the rows already held rather than fetching a different list, so switching
     costs no request and works with no signal; `filterConversations` gained one optional set, and
     an inbox naming an organization the person has since left simply matches nothing. Which
     organizations may be named is the web client's rule — an Agent's memberships, an Admin's whole
     list — because asking an Agent for `GET /organizations` is a `403` nothing needs.

   Still web-only, and deliberately: Broadcasts, the Activity log and Analytics. **Communities are
   no longer on that list** — they come to this client along with the Wall, which is a separate
   feature and a destination of its own. Administering a Community stays on web; a phone gets the
   member's half. See `CONTEXT.md` for both, and the API's `docs/planning/wall.md`.
   Deleting a conversation is web-only too — it is content-destroying, admin-only and undoable by
   nobody, and nothing on a phone needed it.

## Session

Signed in = a Session cookie in `expo-secure-store` that `GET /auth/session` accepts. Role is
**server-owned** — it arrives on the session user and the app cannot set it. Sign-out clears the
cookie and every cached identity, role included.

A session ends two ways, and both land on sign-in. Signing out discards the cookie, tells the
server, and completes even when that call fails. A session expiring — an authenticated request
answered `401` — discards the cookie without telling a server that has already refused it. A `403`
is not an expiry, and neither is a request that got no answer at all.

Hydration at cold start has three outcomes: signed in, signed out, and **Unreachable** — a cookie
exists but the API did not answer, which keeps the cookie and offers a retry rather than sending the
person to sign-in. A 401 is not Unreachable: it clears the cookie.

Self-registration does not exist; the API has no register endpoint. A Customer account comes into
existence two ways, both of them sign-in: verifying a first magic link, and signing in with Google
for the first time. Staff accounts are created by an Admin on web. The register screen is gone
rather than disabled — it posted nowhere — and the sign-in screen sends anyone without an account to
one of those two instead.

The Settings role switcher is gone. It set the session's role from the client, which server-owned
roles make a lie. What replaced it is a `__DEV__`-only picker on the sign-in screen for *which seed
account to sign in as*: it fills the form from `EXPO_PUBLIC_DEV_SEED_ACCOUNTS`, and the role that
arrives is the server's answer about that account. `__DEV__` is what keeps both the control and its
configured credentials out of a shipped bundle.
