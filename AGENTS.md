Concise rules for building accessible, fast, delightful UIs. Use MUST/SHOULD/NEVER to guide decisions.

**Project phase:** Phase **3** (real auth — cookie sessions mirroring the web client) is **done**: 3a shipped password + magic link, 3b shipped Google sign-in. Phase **4** (realtime + REST) is under way per `docs/scope.md`: every role's conversations, sends, unread and live delivery over Socket.IO are real — the Customer's since #28-#31, an Agent's and an Admin's since #32, which also brought the Staff directory, staff DMs and System notices. #33 verified staff realtime against the running API — the sockets were already shared — and stopped a System notice from counting towards a staff unread badge. #34 brought Engage and Takeover: a staff member claims a thread from the Unassigned pool, an Admin takes one from its assignee, and `conversation.reassigned` tells whoever lost it. The Admin's user directory is still mock. Phase 5 media is done: 5a brought the local picker and the in-app recorder, and #35 wired both to
the API — a send uploads the file and then names it, a received attachment downloads and renders per
type, and every attachment on a message is drawn rather than only the first. #36 gave a thread the
two screens that hang off it: Conversation details (who it is with, its type and state, its Labels,
its Internal notes) and Shared in chat (Media / Docs / Voice / Links), both reached from the
thread's header and both mirroring the web client's Conversation Details pane. #39 gave every
round trip through `api-client` a deadline — fifteen seconds of silence, the CSRF pre-flight and
the streamed upload included — so a hung request now ends as an ordinary transport failure rather
than as a screen that waits forever; it is deliberately never a `401`. #40 opened the Store: `expo-sqlite`, a `conversations` table, and a
cold start that Restores the Conversation list — the same rows, the same Unread counts, the same
order, the tab badge with them — before anything renders, so a phone in airplane mode opens on what
it last knew instead of on an empty inbox. Only Conversations so far; Messages, the Outbox and
Eviction are their own tickets. The two new modules split at the native boundary: `store-rows` maps
a Store to rows and back and imports nothing native, `conversation-store` owns SQLite alone. #41 took
the half of Eviction that touches no SQLite: the downloaded copies of documents are bounded at
250 MB, and a download landing past that discards the least recently *read* files until it fits —
last read rather than last downloaded, which is why a hit writes a marker beside the file. A
download still arriving is pinned, the sweep reads `attachments` and nothing else, and every
filesystem failure in it is swallowed. Split the same way: `attachment-budget` is pure and
table-tested, `attachment-cache` owns the filesystem. #42 took the one carve-out ADR-0008 names:
Engage and Takeover re-read the conversation from the API before they fire, so a thread somebody
claimed while this phone held an older row leaves the Unassigned pool on the tap that lost the race,
and the person is told who has it in words rather than shown a bare `403`. The verdict is pure
(`assignment-precheck`) and judges the thread's state only — who may take a thread over stays the
API's rule, which the API now sends as the conversation's `access` (root ADR 0015), read through `conversation-access`. #43 stopped the screen jumping after the Launch
animation: it now ends when it has played *and* the first Conversation fetch has settled — answered
or failed, since with the Store there is something to draw either way — so the Hub arrives complete
rather than filling in underneath the person a moment later. #44 took the Store from Conversations
to Messages: a `messages` table holds one row per confirmed Message, a thread that has been opened
before opens on what this device already holds rather than on a request, and scrolling back reads
the disk a page at a time and asks the API only for history the phone does not have. The reducers
did not change — `applyNewestPage` is the one addition, and it decides the single new question,
whether the page that confirms a Restored thread continues it or begins after a gap in it. Unsent
Messages are deliberately not persisted; the Outbox is its own ticket. A thread
with nothing to draw now says why — including that it could not be reached — instead of showing an
empty list. #45 finished Eviction, the half ADR-0008 left: every Conversation row is kept always,
Messages only for the twenty most recently active threads and fifty each, ranked by the
conversation's own `lastMessageAt` — which is why the row now carries it as a column rather than
only inside its payload. A thread that lost its Messages still appears in the list and fetches when
opened, with its paging reset so it cannot restore a cursor pointing past history it no longer has.
The sweep runs after the write that grew the table and never on a timer, and never against the
thread that write was for — that is the thread on screen, and taking its Messages would be a write
that undoes itself. Split like the attachment budget: `store-eviction` is pure and table-tested,
`conversation-store` owns the query and the transaction. #46 made a Session end take the Store with
it: every moment that discards the Session cookie — signing out, a Session expiry, a cold start that
finds none, a refused sign-in — reaches one path, `session-wipe`, which destroys the database file
and the downloaded documents together, so nothing of a person's Conversations outlives their session
on this device and a shared phone hands the next person nothing. Hydration's Unreachable outcome
deliberately does not, because a kept cookie is a kept Store. What a Wipe removes stays removed: the
Store bars the people it was taken from until they Restore, so the moment between the credential
going and the screens being told cannot write the list back. The database is deliberately not
encrypted. #47 gave the Store its third table: the Outbox, so a message that did
not get away is still there tomorrow. Every Unsent Message is written whatever its Delivery state and
every one comes back *failed* — a send in flight when the process died did not survive the thing that
was sending it — and nothing ever sends one without a tap, which is the whole difference between this
and a send queue. A row whose Conversation has left the list goes with it; a staged Attachment comes
back with its message, and because the picker's copy lives in the system cache a retry reads the file
first and names the one that has gone (`staged-file`) rather than sending into nothing. #48 made a Reaction real: the row on a bubble used to write to an overlay the thread screen held and nothing else, and a tap now takes the same three steps a send does — the bubble changes first, the request follows it, and a refusal or a dead network puts the bubble back. `toggleReaction` is unchanged, and whether a tap came out as the API's add or its remove is read off its answer rather than off the tap. Somebody else's reaction arrives as the reacted Message over the socket and folds in through the same reducer as any other change to one — which is what turned up the fix beside it: the *list* must ignore that broadcast, because read as an arrival it dragged the row back to the reacted message's timestamp and preview and dropped the conversation down an order sorted on exactly that. #49 gave the thread screen the two states it was already handed and never drew: a first page still in flight is a spinner, one that failed is why, with a retry — the decision behind `thread-notice`, which also settles the one the screen could not. A failure over Messages that are already drawn does not replace them; what is drawn is still true, so it goes in a strip above the composer and is dismissed rather than retried, the way a failed send is. An empty conversation and an unreachable one are now different screens, which is the whole of it: one says nobody has written anything, the other says this device does not know. #50 made #40's last promise true: the signed-in person is now kept on the device beside the Session cookie, so a cold start that cannot reach the API resolves to that person — signed in, and Stale — and Restores their Conversations instead of offering a *Try again* button in front of rows it already holds. Only the three Hydration outcomes that say nothing about the cookie changed; no cookie is still no session, and a `401` still takes the cookie, the kept person and the Store together. A Stale session is not a status of its own and nothing on screen says so — the writes that fail already read as the network — and it is replaced in place by an *authenticated* refetch on the way in, on every foreground, and on the socket connecting, which is both how the first reachable moment is noticed without a connectivity library and what makes a session that expired in a tunnel an ordinary expiry. #51 kept the Store off the cloud: the database file is excluded from Android's automatic backup and from iOS's, and the app-wide `allowBackup: false` that stood in for it is gone, so everything else about the app is backed up again. It is a config plugin because `android/` and `ios/` are generated — the exclusion has to survive a prebuild — and it names the `SQLite` directory rather than the database, because the write-ahead log beside it holds the newest Messages. Ours replace the rules `expo-secure-store` ships and restate its exclusion, since Android reads one set per app. #52 bounded the Launch gate. #43 held the animation until the first
Conversation fetch settled and leaned on the Request deadline to guarantee it would, but that
guarantee is per round trip — a Resync abandons the load in flight and starts another with a
deadline of its own, so a flapping socket bounded every hop and never the launch. The bound is a
Launch deadline: one clock per launch, armed in `conversation-inbox` beside the load it bounds and
idempotent, so a Resync's arming is the call that does nothing. It ends as a fourth thing the fetch
can say — `abandoned`, settled but not terminal, since the load may still answer and overwrite it —
which leaves `launchDestination` at two inputs and the launch screen with the one clock it always
had. Ten seconds, and deliberately shorter than a Request deadline: sizing the bound to contain
whatever is happening underneath only moves the number up, and the question is what somebody is
asked to watch rather than what the network is allowed to take. Being cut off costs little — the
Restored rows are already there, and a launch with none gets the list's own failure state, which is
a screen a person can act on. A Try again that succeeds starts a launch, so it is bounded too. #53
stopped a Restored message the API turned out to have received from offering to send itself again:
the confirmed copy used to arrive beside it, the same words twice, one delivered and one marked
*Not sent* under a *Retry* that would have posted a third. What the socket path could not read is
now a property of the entry — `restored`, set once by `fromOutboxRows` and gone the moment somebody
taps *Retry* — so a send that failed while somebody watched still keeps its place and its offer, and
the rule is one a table can be written for. The page path learned it too, since a page is the more
likely of the two to bring the copy back, and it learned it narrowly: only the viewer's own
messages, only ones the viewer is actually shown, only Restored entries rather than anything a send
of this session put there, and only Messages this device has never held — which the copy of an
Outbox entry is by construction and history that reads the same is not. Deliberately not a
comparison of times: the entry's timestamp is this phone's clock and the copy's is the server's, and
the copy can anyway be older than Messages that arrived before the process died, since what stopped
was the send and not the socket. #54 put a tripwire on what #51's deny-list made possible: the backup rules exclude two directories and nothing else, so the app's document directory is backed up by default and the first private file written there leaves the phone unless whoever added it remembered an ADR — which is not a thing anybody reads at the moment they add a file write. It is a failing test instead, over `lib/`, `app/` and `components/`, and the message is the whole of it: it names ADR-0011 and `EXCLUSIONS` in `plugins/backup-exclusion.js`, and offers `Paths.cache` — which neither platform backs up and which the attachments already use — as the way past it. No allowlist and no exceptions; it lives beside the plugin rather than under `lib/` because a module naming the patterns would be the first thing to trip itself. #58 opened Phase 5d, Push: a signed-in phone now registers itself with the API, so a staff reply can reach it while the app is closed. `expo-notifications` had been a dependency since Phase 5 and imported by nothing; this is the ticket that wires it, split at the native boundary the way the Store's modules are — `push-rules` is pure and holds the permission table, `push-device` owns `expo-notifications` alone. The permission is asked for after a first sign-in and guarded, which is not a nicety: both platforms draw the system dialog once and refuse a later request without drawing anything, so an unguarded ask is a no-op shaped like a prompt. What it is guarded *on* changed on the emulator. The ticket and the scope entry both say *while the status is undetermined*, and that asks nobody anything on the one platform this ships to: `expo-notifications` answers Android 13+ by reading `areNotificationsEnabled()` before the runtime permission, so a phone nobody has ever asked reports `denied`. `canAskAgain` decides it instead — the platform saying whether a request would draw a dialog at all — and *this device has asked before* is the rest, because Android reports a dismissal and a single refusal identically and `canAskAgain` cannot tell them apart. It is kept under `Paths.cache`, which is two decisions in one: it has to outlive a Session end, because the platform's own once does, and it must not outlive the install, because a copy riding a device backup onto a phone whose permission has reset would suppress the dialog there for good. Neither platform backs the cache up, which is the same property ADR-0011's guard already points at. Registration runs after a sign-in and on every launch that finds a session, because a token rotates and a row holding an old one dispatches into nothing; `POST /push/devices` is idempotent on the token, so the common case writes no second row. Nothing about it reaches a screen: a refused permission, a phone with no signal, a registration the API turns down each leave the app exactly as it is. The one retry is a Stale session being confirmed — a launch with no signal can read no token and write no row, so #50's first reachable moment runs it again rather than leaving that phone on a token it no longer has. Past that the retry is the next launch, and there is no timer and no loop. #59 made the tap open the thread. The cold start was the whole of the problem — Hydration, Restore and the Launch gate are all in front of it — and it is deliberately not a second route: `launchDestination` already answers where a launch lands, so the conversation a notification asked for arrives as its third input and the one signed-in row with a Hub behind it answers the thread instead of the role's Hub. Every other row is what it was, the wait included, because a thread Restores from the Store and draws at once but the Hub underneath it has to exist for Back to mean anything — which is why the destination now names what goes *behind* it rather than replacing the Hub with the thread. A tap while the app is running never reaches the gate; the listener navigates, and the seam between the two is `push-intent`, which holds the Pending thread only while nothing can act on it. `push-rules` gained its second table, the payload one, and it answers null for anything it cannot read at every level of the walk down to the id — `realtime-events`' rule on the other transport, and here because a malformed dispatch must not be able to break a launch. The three cases around it fall out of the table rather than being handled: no session goes to sign-in and drops the Pending thread, since the Session end that took the cookie took the Store the thread would have drawn from; and Unreachable keeps it, since that cookie is still good. Three things needed more than the ticket expected, and the third only turned up on the emulator: whether the launch screen is still there cannot be read off the router's pathname, because a route group is not part of a path — the Customer Hub is `/` exactly as `app/index` is, so a tap on the Hub was held for a gate that had already gone and nothing opened. The launch screen says so itself now, which is also the right answer for a cold start that never draws it, such as a magic link. The other two: a tap can be reported twice — the response that starts a cold launch is reachable from the read *and* from a listener registered early enough — so the launch's own notification is remembered and dropped once, and only once, since a person tapping the same shade entry again is asking for the thread rather than the platform repeating itself. And *a conversation this device has never held* turned out not to be free either: the thread screen resolves its row from the Conversation list and nothing else, so a thread nobody had fetched showed *Conversation unavailable* rather than opening. It now asks the API for that one row and puts it in the list, once per id, which is also the honest answer for a row deleted while somebody was reading it. #60 added the second trigger, the one that earns the grant: a Message landing in front of somebody the first-sign-in ask never reached — a person who dismissed that dialog, upgraded from a build with no push, or signed in before any of this shipped. It is never a second ask, and it is guarded by the same table rather than by a rule of its own; what it needed was the socket, so `PushRegistration` moved inside the Realtime provider and both triggers now run the one routine, because a grant with no registration is a phone the API cannot dispatch to and the person who just said yes would never learn it. What the moment has to be is three things and only one of them is about the Message: somebody else's — a viewer's own message and a System notice are the app talking about itself — arriving while the app is in front of the person, on a process that has registered nothing yet. The foreground half is the one that keeps it honest: the socket is not torn down when the app goes behind something, so a reply can land in a pocket, and a dialog raised there is drawn over whatever somebody is actually doing, answered by nobody, and spent for good. The Message half is `shouldAskOnMessage` and table-tested; the other two are facts about the moment rather than the Message, so they are read where the moment is. The other half is the way back for whoever said no: `shouldOfferSystemSettings` is the same standing read from the other side — offered exactly when neither trigger will ever ask again, rather than when the status reads `denied`, which on Android is also what never-asked looks like. So a phone that has not been asked yet is offered nothing, because the ask is still coming, and somebody who dismissed the dialog is offered it while the platform still says it would draw one. The row re-reads on every foreground, since the answer changes out in the platform's settings and not in here, and it is a row on a screen somebody chose to open rather than anything that arrives uninvited. #61 made a Session end stop the pushes: the registration is the third thing on the list `session-wipe` was built to hold — the database, the downloaded documents, and now the row in the API's device table — so signing out, a Session expiry and a refused credential remove it through the one path rather than three call sites, and a phone handed to somebody else stops showing the previous person's support conversations on its lock screen. The `DELETE` wants a credential and a Session end has already discarded it, so the ending cookie is captured before it goes and handed down, the way it already is to `POST /auth/logout`; a moment with none makes no request rather than a request that would remove nothing. It is the only half of a wipe that leaves the phone, so it is the only half nothing waits for — started, not awaited, its failure caught where the list is rather than inside the thing on it, because a sign-out that hung on a request is the failure this path exists to avoid. Which token is a record under `Paths.cache` beside the record of the ask and for the same two reasons: it has to outlive a Session end, because that is the moment it is read, and it must not outlive the install, because a token names an installation. Written by every registration rather than by one that was acknowledged — a row may well exist behind an answer that was lost — and removed only by a `DELETE` the API accepted, which is what leaves a deregistration that failed something to try at the next Session end. It split off `push-device` rather than joining it: nothing about a name written down and a request about the name touches `expo-notifications`, and keeping them apart is what stops a Session end dragging the whole notifications native side in behind it. Two endings are deliberate. Hydration's Unreachable outcome does not come through, for the reason it does not wipe the Store — a kept cookie is a kept registration, and pushes go on arriving. And a Session expiry is a `DELETE` that will fail, since the cookie is dead by definition and that is how the expiry was noticed. The next sign-in on the phone takes the row over rather than adding one, which closes it for a phone somebody picks up again and not for one nobody touches; removing the row server-side when a session ends is #57's story 38 and has no ticket, which is #63. The sign-out has one ordering in it, found on the emulator: the `DELETE` and the logout both go under a cookie this client has already given up and the logout is the one that makes the other impossible, so it waits four seconds and no longer — holding it back keeps the session alive on the server, which is worse to leave running than a device row. #62 made the transport stay out of the way of an app that is open, under one rule: while somebody is looking at this app, this app is what tells them. The operating system now draws nothing in the foreground, and the handler that says so is a constant rather than a decision — the thread a Message is about is either on screen, where the bubble already says it, or it is not, where the new In-app banner does. The banner is fed by the socket rather than by an arriving dispatch, which is the load-bearing choice in it: the strip has to appear for somebody who refused the permission, whose conversations move exactly as everybody else's do, and the socket is already what moves the row and the tab badge. Four kinds of Message never get one — a viewer's own, a System notice, one in the thread on screen, and one that landed while the app was behind something, which the platform has already drawn. The first two are `banner-notice`'s and table-tested; the last two are facts about the moment rather than about the Message, so they are read where the moment is. Which thread is on screen is declared by the thread screen rather than read off the router — #59's distinction again, and for a second reason here: a route id is not always a conversation id, since the Offers alias resolves against the list. The third behaviour is the shade, and it is the one that needed the API. Clearing runs off `markRead`, the one funnel every read goes through whether the thread was opened from the app or from the notification being cleared, and what it could not do was tell which notification belonged to which thread: Expo sends an FCM `notification` block so that a closed phone draws something at all, which means Firebase draws it before any of this app's code runs, and what the app reads back later is the Android notification — a title, a body, and none of the payload the tap path reads. So the routing travels in the Notification tag as well, `<conversation>:<notification>`, prefixed so a thread clears at once and suffixed so nothing collapses, because Android *replaces* a notification sharing a tag. The payload is still preferred wherever it survived, which is the tap path and iOS. #67 opened Phase 7, the half of the product that is not a thread. The Contact list is real (`GET /conversations/contacts`), which is one endpoint answering for all three roles, so a Customer sees the organizations they belong to, an Agent their Customers and colleagues, and an Admin the directory; it reaches staff as a People tab and everyone as the New Message sheet, the same list with different chrome. What a tap does is `contact-directory`, pure and table-tested. Three things it fixed were broken rather than missing: an Agent's conversations screen passed `showCompose={false}`, so the one role that writes to Customers all day could start nothing; a Customer had no compose control either, which left them on whichever support thread a first visit created and nothing offering the rest; and the sheet everyone else had listed staff only, because it read the staff directory directly. Transfer and Close came with it — the assignee's, on Conversation details rather than the header, gated by `thread-actions`, which mirrors the API's assignee test and deliberately not the capability check underneath, because an Agent's grants are not on the session payload. Labels gained the half that defines them rather than applies them, where retiring is the delete the API does not have: an archived label stays on every thread already wearing it. The Admin's mock Users tab is gone; the real Account directory (`GET /users`) lives under the hub with the org-wide settings, and offers an Admin nothing on their own row, which is this client's rule rather than the API's — self-ban and self-delete are both permitted server-side. Organizations, their members and the invitations everybody answers are there too: inviting is the only way in, so nothing grants a membership, and the answering half sits on Settings for every role and draws nothing when there is nothing to answer. And a saved inbox narrows the rows already held rather than fetching a second list, so switching between them costs no request and works with no signal. #74 opened Phase 8 with the reading half of it: the Wall is a fourth destination on the Tab capsule, icon-only like the rest and named in its accessible name, and it reads the default Wall — `GET /wall/posts`, which resolves at read time to every Organization the reader belongs to, so a Customer, an Agent and an Admin ask the same path and each gets their own and nothing here branches on a role. It is built to the feed shape rather than to the list one the web client shipped and is now replacing: a Post is a card, images lead it as a collage, and the collage carries the ratio of its own shape so the card takes its final height before an image has decoded — a Post cannot grow under a thumb halfway down a Wall. Which shape, which images are drawn and what sits behind the last cell's `+N` is `wall-card`, pure and table-tested, beside the two other things a card decides: where a link button actually goes, printed under the label because a label is its author's free text, and whether a body is set as a statement or as something to read, since one word and five hundred characters must both look deliberate. Whether a body is *clamped* is the one thing that cannot be decided up front — the same three hundred characters overflow on a narrow phone and do not on a tablet — so it is measured, off a copy of the text laid out with no clamp and drawn to nobody, because a clamped one reports the clamp's own lines and never more. The three screens are `wall-notice`, which is `thread-notice` again and for the same reason: a Wall with nothing in it and a Wall this device could not reach are opposite facts and would otherwise render identically. Its fourth answer is the one that matters most here — a read that failed over Posts already drawn is a line above them and never a screen in their place, because what is drawn is still true. Paging is backwards and only backwards, on the id of the last Post rather than an offset, so something published while somebody reads page three cannot shift page four underneath them; `wall-feed` holds that and the question a short page answers, which is that the Wall has ended. Nothing is persisted and nothing needed to be: a Wall is re-read when it is opened, the only bytes it puts on the disk are a document opened out of a Post — downloaded by `attachment-cache`, under `Paths.cache`, which a Session end already clears and no backup reaches — so `session-wipe` gained no fourth thing and ADR-0011's tripwire had nothing to catch. A Post carries no Receipt, no Delivery state and never enters the Outbox, which is not a restraint but the shape: a Post is published rather than sent, so there is no half of one waiting on this phone. Reacting, composing, voting and the rest are their own tickets; what a reader can do to a Post today is `wall-actions`, a list that is allowed to be empty — a Post with nothing to offer draws no overflow control at all, rather than one that opens an empty sheet. #72 brought the other half of Phase 8, and it is deliberately not a destination: Communities are a second tab above the Conversation list, beside Chats, for every role — a Community is a place conversations live, so it belongs where the conversations are. It lists the Communities the viewer is a member of, which for an Admin means narrowing `GET /communities` on this device, because their answer is every Community in the product and one somebody is not in has to be invisible rather than refused; the narrowing runs before anything is drawn *and* before anything is written, so a Community nobody joined never reaches the disk either. A Community expands in place rather than opening a screen — WhatsApp's shape, and the web's — onto its Announcements thread, then the Groups the viewer is in, each drawn as a conversation row with a preview, a time, an unread badge and a muted indicator, and then `View all`, which is the way to the Community screen and is drawn even where the feed failed, so a failure is not also a dead end. A tap on any of those rows opens that conversation; only the header expands. Three rows inline and no more, which is what keeps several expanded Communities cheap: the tab is one flat virtualised list rather than a list of lists, flattened by `community-list`, so every state an expanded Community can be in — loading, failed, empty, its rows — is a row the window can see. Store-backed like everything else, split at the same boundary: `community-rows` maps a Community and a feed row to disk and back and imports nothing native, `conversation-store` owns the two new tables, and the schema went to version 5. The expansion rides on the Community's own row, which is what makes it survive a relaunch without a write of its own — and a Session end takes it with the rest of the database, so nothing here needed a fourth thing on `session-wipe`'s list. The rows a feed names are also in the Conversation list, which is the copy the socket keeps moving, so `withLiveThread` prefers it: a message landing in a Group while its Community is open moves the row underneath it without a second request. Loading, empty and unreachable are three screens rather than one, through `read-notice` again. One refusal is deliberate and is not the list parser's usual rule: a page of Communities this build could read *none* of answers `malformed` rather than an empty list, because membership is what the tab is narrowed by and the narrowing is written through — a payload shape this client cannot read would otherwise empty the tab and then delete from the Store the rows it was supposed to fall back on. What is not here is joining: the feed's third row shape is parsed and not drawn, because a list of rooms with no way into them is a dead end and the Community screen that offers one is #73. #81 gave a Post a switch: which Organizations may notify somebody about one, off until they say so, on Settings beside the rest. It is the opposite direction from everything else on that screen and that is the whole of it — a Broadcast reaches whoever has not opted out and an essential one reaches past even that, a thread notifies until it is muted, and a Post reaches nobody who has not named its Organization. So there is nothing for a Post to override: `postNotificationRows` reads the opt-in list and nothing else, and both table-tested halves — the rows and the parse — say that no field this build does not know can turn a switch on. The switches are the join of two reads the API keeps apart, the memberships and the settings, so either one failing is the card failing rather than every switch drawing off, which would be a claim rather than a gap. A tap is the three steps a send is: the switch moves first, the request follows it, and a refusal or a dead network puts it back — and what settles it is the document the API answers with rather than the change that was asked for, so an opt-in it had already recorded and one it has just written land identically. What it changes about notifications themselves is nothing. The permission is still asked for by the two moments that ask, the In-app banner is still fed by the socket, the shade is still cleared by a read, and `post-notifications-boundary.test.ts` is what notices if a later ticket reaches from a setting into the thing it is a setting about. The one read it does make is where the platform stands, because a switch that is on and a phone that draws nothing are not a contradiction anybody can see: somebody whose notifications are not on is told both halves under the rows — that nothing will arrive yet, and that the answer is kept — and is asked nothing, since this is a card on a screen somebody chose to open. It reads the whole standing rather than the status, and the sentence changes on it: a phone the app has not asked yet is told only that notifications are not on, because saying they are turned *off* is a claim about an answer nobody has given and on Android is what never-asked looks like. The sentence that does say off is the one drawn exactly when `shouldOfferSystemSettings` is true, which is when the row beneath this card offers the way into the platform's own settings — so the closed door and its way out arrive together and neither is a dead end. The two of them now sit side by side and last, for the reason that row was last already. Re-read on every foreground, because that answer changes out in the platform's settings rather than in here. And the card's four screens are `read-notice` again, shared with the Wall and a thread for the precedence rather than the copy: asking again over switches already drawn leaves them drawn, and a person in no organization and a person whose memberships could not be read are opposite facts that would otherwise render alike. Broadcasts, Activity and Analytics stay on web; Communities and the Wall no longer do. Auth and now Push need a Development client — everything else still runs in Expo Go; see the README. Domain glossary: `CONTEXT.md`. Credential pattern: `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`. Google audience arrangement: `docs/adr/ADR-0005-the-google-audience-arrangement.md`. The socket handshake: `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`. How a file reaches the API: `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`. Where the screens read from: `docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`. What a cold start with no network knows: `docs/adr/ADR-0010-a-kept-person-answers-an-unreachable-hydration.md`. What never leaves the phone: `docs/adr/ADR-0011-the-store-does-not-leave-the-phone-in-a-backup.md`.

## Interactions

### Keyboard

- MUST: Full keyboard support per [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/)
- MUST: Visible, unobscured focus rings (`:focus-visible`; group with `:focus-within`); sticky/fixed elements never cover focus
- MUST: Manage focus (trap, move, return) per APG patterns
- NEVER: `outline: none` without visible focus replacement

### Targets & Input

- MUST: Hit target ≥24px (mobile ≥44px); if visual <24px, expand hit area
- MUST: Mobile `<input>` font-size ≥16px to prevent iOS zoom
- NEVER: Disable browser zoom (`user-scalable=no`, `maximum-scale=1`)
- MUST: `touch-action: manipulation` to prevent double-tap zoom
- SHOULD: Set `-webkit-tap-highlight-color` to match design

### Forms

- MUST: Hydration-safe inputs (no lost focus/value)
- NEVER: Block paste in `<input>`/`<textarea>`
- MUST: Loading buttons show spinner and keep original label
- MUST: Enter submits focused input; in `<textarea>`, ⌘/Ctrl+Enter submits
- MUST: Keep submit enabled until request starts; then disable with spinner
- MUST: Accept free text, validate after—don't block typing
- MUST: Allow incomplete form submission to surface validation
- MUST: Errors inline next to fields; on submit, focus first error
- MUST: `autocomplete` + meaningful `name`; correct `type` and `inputmode`
- SHOULD: Disable spellcheck for emails/codes/usernames
- SHOULD: Placeholders end with `…` and show example pattern
- MUST: Warn on unsaved changes before navigation
- MUST: Compatible with password managers & 2FA; allow pasting codes
- MUST: Trim values to handle text expansion trailing spaces
- MUST: No dead zones on checkboxes/radios; label+control share one hit target

### State & Navigation

- MUST: URL reflects state (deep-link filters/tabs/pagination/expanded panels)
- MUST: Back/Forward restores scroll position
- MUST: Links use `<a>`/`<Link>` for navigation (support Cmd/Ctrl/middle-click)
- NEVER: Use `<div onClick>` for navigation

### Feedback

- SHOULD: Optimistic UI; reconcile on response; on failure rollback or offer Undo
- MUST: Confirm destructive actions or provide Undo window
- MUST: Use polite `aria-live` for toasts/inline validation
- SHOULD: Ellipsis (`…`) for options opening follow-ups ("Rename…") and loading states ("Loading…")

### Touch & Drag

- MUST: Generous targets, clear affordances; avoid finicky interactions
- MUST: Delay first tooltip; subsequent peers instant
- MUST: `overscroll-behavior: contain` in modals/drawers
- MUST: During drag, disable text selection and set `inert` on dragged elements
- MUST: Drag/swipe/pinch/path gestures have a tap/click and keyboard alternative unless essential
- MUST: If it looks clickable, it must be clickable

### Autofocus

- SHOULD: Autofocus on desktop with single primary input; rarely on mobile

## Animation

- MUST: Honor `prefers-reduced-motion` (provide reduced variant or disable)
- SHOULD: Prefer CSS > Web Animations API > JS libraries
- MUST: Animate compositor-friendly props (`transform`, `opacity`) only
- NEVER: Animate layout props (`top`, `left`, `width`, `height`)
- NEVER: `transition: all`—list properties explicitly
- SHOULD: Animate only to clarify cause/effect or add deliberate delight
- SHOULD: Choose easing to match the change (size/distance/trigger)
- MUST: Animations interruptible and input-driven; autoplay only for muted, non-essential loops
- MUST: Autoplay motion >5s alongside other content has pause, stop, or hide controls
- MUST: Correct `transform-origin` (motion starts where it "physically" should)
- MUST: SVG transforms on `<g>` wrapper with `transform-box: fill-box`

## Layout

- SHOULD: Optical alignment; adjust ±1px when perception beats geometry
- MUST: Deliberate alignment to grid/baseline/edges—no accidental placement
- SHOULD: Balance icon/text lockups (weight/size/spacing/color)
- MUST: Verify mobile, laptop, ultra-wide (simulate ultra-wide at 50% zoom)
- MUST: Respect safe areas (`env(safe-area-inset-*)`)
- MUST: Avoid unwanted scrollbars; fix overflows
- SHOULD: Flex/grid over JS measurement for layout

## Content & Accessibility

- SHOULD: Inline help first; tooltips last resort
- MUST: Skeletons mirror final content to avoid layout shift
- MUST: `<title>` matches current context
- MUST: No dead ends; always offer next step/recovery
- MUST: Design empty/sparse/dense/error states
- SHOULD: Curly quotes (“ ”); avoid widows/orphans (`text-wrap: balance`)
- MUST: `font-variant-numeric: tabular-nums` for number comparisons
- MUST: Redundant status cues (not color-only); icons have text labels
- MUST: Accessible names exist even when visuals omit labels
- MUST: Use `…` character (not `...`)
- MUST: `scroll-margin-top` on headings; "Skip to content" link; hierarchical `<h1>`–`<h6>`
- MUST: Resilient to user-generated content (short/avg/very long)
- MUST: Locale-aware dates/times/numbers (`Intl.DateTimeFormat`, `Intl.NumberFormat`)
- SHOULD: `translate="no"` on brand names, code tokens, & identifiers to prevent garbled auto-translation
- MUST: Accurate `aria-label`; decorative elements `aria-hidden`
- MUST: Icon-only buttons have descriptive `aria-label`
- MUST: Prefer native semantics (`button`, `a`, `label`, `table`) before ARIA
- MUST: Media has captions/transcripts/descriptions as applicable; controls are keyboard-operable; decorative media hidden from assistive tech
- MUST: Non-breaking spaces: `10&nbsp;MB`, `⌘&nbsp;K`, brand names

## Content Handling

- MUST: Text containers handle long content (`truncate`, `line-clamp-*`, `break-words`)
- MUST: Flex children need `min-w-0` to allow truncation
- MUST: Handle empty states—no broken UI for empty strings/arrays

## Performance

- SHOULD: Test iOS Low Power Mode and macOS Safari
- MUST: Measure reliably (disable extensions that skew runtime)
- MUST: Track and minimize re-renders (React DevTools/React Scan)
- MUST: Profile with CPU/network throttling
- MUST: Batch layout reads/writes; avoid reflows/repaints
- MUST: Mutations (`POST`/`PATCH`/`DELETE`) target <500ms
- SHOULD: Prefer uncontrolled inputs; controlled inputs cheap per keystroke
- MUST: Virtualize large lists (>50 items)
- MUST: Preload above-fold images; lazy-load the rest
- MUST: Prevent CLS (explicit image dimensions)
- SHOULD: `<link rel="preconnect">` for CDN domains
- SHOULD: Critical fonts: `<link rel="preload" as="font">` with `font-display: swap`
- SHOULD: `<video autoplay muted loop playsinline>` over animated GIF; provide still/reduced-motion alternative
- SHOULD: Short non-essential loops include a Safari H.264 MP4 `<picture>` source, `prefers-reduced-motion` media condition, and still fallback

## Dark Mode & Theming

- MUST: `color-scheme: dark` on `<html>` for dark themes
- SHOULD: `<meta name="theme-color">` matches page background
- MUST: Native `<select>`: explicit `background-color` and `color` (Windows fix)

## Hydration

- MUST: Inputs with `value` need `onChange` (or use `defaultValue`)
- SHOULD: Guard date/time rendering against hydration mismatch

## Design

- SHOULD: Layered shadows (ambient + direct)
- SHOULD: Crisp edges via semi-transparent borders + shadows
- SHOULD: Nested radii: child ≤ parent; concentric
- SHOULD: Hue consistency: tint borders/shadows/text toward bg hue
- MUST: Accessible charts (color-blind-friendly palettes)
- MUST: Meet contrast—prefer [APCA](https://apcacontrast.com/) over WCAG 2
- MUST: Increase contrast on `:hover`/`:active`/`:focus`
- SHOULD: Match browser UI to bg
- SHOULD: Avoid dark color gradient banding (use background images when needed)
