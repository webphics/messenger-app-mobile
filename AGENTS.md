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
API's rule, mirrored once in `composer-access`. #43 stopped the screen jumping after the Launch
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
going and the screens being told cannot write the list back. Android backup is disabled; the database
is deliberately not encrypted. #47 gave the Store its third table: the Outbox, so a message that did
not get away is still there tomorrow. Every Unsent Message is written whatever its Delivery state and
every one comes back *failed* — a send in flight when the process died did not survive the thing that
was sending it — and nothing ever sends one without a tap, which is the whole difference between this
and a send queue. A row whose Conversation has left the list goes with it; a staged Attachment comes
back with its message, and because the picker's copy lives in the system cache a retry reads the file
first and names the one that has gone (`staged-file`) rather than sending into nothing. #48 made a Reaction real: the row on a bubble used to write to an overlay the thread screen held and nothing else, and a tap now takes the same three steps a send does — the bubble changes first, the request follows it, and a refusal or a dead network puts the bubble back. `toggleReaction` is unchanged, and whether a tap came out as the API's add or its remove is read off its answer rather than off the tap. Somebody else's reaction arrives as the reacted Message over the socket and folds in through the same reducer as any other change to one — which is what turned up the fix beside it: the *list* must ignore that broadcast, because read as an arrival it dragged the row back to the reacted message's timestamp and preview and dropped the conversation down an order sorted on exactly that. #49 gave the thread screen the two states it was already handed and never drew: a first page still in flight is a spinner, one that failed is why, with a retry — the decision behind `thread-notice`, which also settles the one the screen could not. A failure over Messages that are already drawn does not replace them; what is drawn is still true, so it goes in a strip above the composer and is dismissed rather than retried, the way a failed send is. An empty conversation and an unreachable one are now different screens, which is the whole of it: one says nobody has written anything, the other says this device does not know. #50 made #40's last promise true: the signed-in person is now kept on the device beside the Session cookie, so a cold start that cannot reach the API resolves to that person — signed in, and Stale — and Restores their Conversations instead of offering a *Try again* button in front of rows it already holds. Only the three Hydration outcomes that say nothing about the cookie changed; no cookie is still no session, and a `401` still takes the cookie, the kept person and the Store together. A Stale session is not a status of its own and nothing on screen says so — the writes that fail already read as the network — and it is replaced in place by an *authenticated* refetch on the way in, on every foreground, and on the socket connecting, which is both how the first reachable moment is noticed without a connectivity library and what makes a session that expired in a tunnel an ordinary expiry. Auth now needs a Development client — everything else still runs in Expo Go; see the README. Domain glossary: `CONTEXT.md`. Credential pattern: `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`. Google audience arrangement: `docs/adr/ADR-0005-the-google-audience-arrangement.md`. The socket handshake: `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`. How a file reaches the API: `docs/adr/ADR-0007-a-file-is-streamed-not-serialised.md`. Where the screens read from: `docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`. What a cold start with no network knows: `docs/adr/ADR-0010-a-kept-person-answers-an-unreachable-hydration.md`.

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
