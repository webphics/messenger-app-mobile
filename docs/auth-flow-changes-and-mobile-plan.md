# What changed in the auth flow, and what this app owes it

The window is **2026-09-18 08:00 to 2026-09-20 10:00 (+06)** — the last ~50 hours of work on
`messenger-api` and `messenger-app`. This file exists to answer one question: the web and the API
moved, so what does this client have to do to keep up, and what is newly possible that was not
before.

It is a reading of the two other repos, not a record of work done here. Nothing in this app changes
because this file exists.

Reproduce the window with:

```bash
git log --since="2026-09-18 08:00" --date=iso --pretty='%h %ad %s'
```

The API documents itself and those docs were updated in the same commits, so they are the authority
wherever this summary and they disagree: `docs/api/auth.md`, `docs/api/memberships.md`,
`docs/api/organization-join-links.md`.

---

## The one-paragraph version

Sign-in now takes a username **or** an email under one `identifier` field — this app already sends
that and needs nothing. Two new link-shaped ways into the product were added, invitations and
organization join links, and neither exists on mobile at all. The credential scheme did not change,
so none of this needs an API change to support a native client. Sign-in on the web is three steps
with a **new-user branch** — `POST /auth/account-state` was added after this was first written,
reversing the refusal it described (§4) — and onboarding is a
post-authentication gate on a blank name, not a step in that form. The one thing that will break
silently is `MAGIC_LINK_APP_ORIGINS`, which still names the old scheme.

---

## 1. Sign-in takes an `identifier`, not an `email`

| Repo | Commit | |
| --- | --- | --- |
| api | `db9522c` | Add email-prefix usernames as a login identifier |
| api | `0c84b84` | Make the username editable and visible on admin surfaces |
| app | `6650879` | Accept a username or an email on the login form |
| app | `520fc57` | Show and edit the username across users and profile |

`POST /auth/login` and `POST /auth/magic-link` both replaced `email` with `identifier`. The body is
`z.strictObject`, so a client still sending `email` fails **twice** — the missing `identifier` and
the unrecognised key — as a `422` before any password is checked.

How the value is read:

- A value matching `^[^\s@]+@[^\s@]+\.[^\s@]+$` in full is treated as an email address.
- Anything else is a username: `^[a-zA-Z0-9_]*$`, at most 20 characters.
- Validation branches on a bare `@`, routing branches on the full-address pattern. So `ada@example`
  is refused as a malformed address and never reaches the username route.
- Lower-cased after validation. A 255-character cap and an empty check cover both branches.

An unknown username, an unknown email and a wrong password all return the same
`401 invalid_credentials`, deliberately — the route will not say which usernames exist.

### Corrected: the web offers email only, and reverted inside the window

An earlier draft of this file read `6650879` as the current state of the web form. It is not.
`6e088bf` — 96 files, titled "refactor(inbox)" — rewrote the login form later the same window and
took the username option back out. `login-schema.ts` on `main` says so in as many words: *"Sign-in is
email-only. `/auth/login` and `/auth/magic-link` both still take a username in the same slot, and
the wire field is still called `identifier`, but nothing in the web app offers that: one field, one
meaning, one label."*

Confirmed by running it: `/login` labels the field **Email**, types the input `email`, and refuses
`adalovelace` with *"Email must be a valid email address."* before any request.

So three different things are true at once, and they are easy to conflate:

- **The API takes either.** Verified against a local instance: every shape this client refuses comes
  back `422`, every shape it accepts reaches the handler and comes back `401`.
- **The wire field is `identifier` on both routes.** That part of `6650879` stands.
- **The web deliberately offers only an address.** A product decision, not a limitation.

**This app now offers both**, which is a divergence from the web rather than a defect — it works
against the API either way. Whether mobile should narrow to match is a decision nobody has made; the
argument for matching is the one `login-schema.ts` makes, and the argument against is that a
username is a credential the API issues and this is the only client that would honour it.

**Password sign-in was already correct** (`lib/auth-service.ts`, `main` commit `c8f89fa`).
**The link request was not.** It still sent `email`, so every magic-link request from this client
was refused `422` before a link was generated — and since a link is this client's sign-up, no
account could be created from mobile at all. The test beside it asserted `email:` too, which is why
the suite was green while describing a request the API refuses. Both are fixed.

**Still missing here:** the username is part of the shared user payload and editable on web profile
surfaces. This app neither displays nor edits it. A gap, not a break.

## 2. Invitations became links

| Repo | Commit | |
| --- | --- | --- |
| api | `420528f` | Invitation signup links: invite by email, redeem by token |
| api | `376a516` | Pending invitations response, rate limiting |
| app | `b31127d` | Invitation redemption page |
| app | `a778d1f` | Organization filtering on inbox and invitation redemption |

An admin can invite an address that has no account. The API mails a link; following it creates the
account and accepts every organization on the invitation in one step.

- Token: 32 bytes, base64url. Only its SHA-256 is stored.
- **Lifetime 7 days** (`INVITATION_LINK_EXPIRY_DAYS`), single-use, killed by cancel or decline.
- It is **not a second authorization path** — redemption accepts rows that already existed. The
  token carries no role and names no organization of its own.
- **Neither redemption route reads the caller's session.** Membership goes to the address the
  invitation names, so following a link while signed in as somebody else changes nothing about who
  gets the membership.

Two routes:

| Route | Session | Body | Answers |
| --- | --- | --- | --- |
| `GET /invitations/redeem/:token` | none | — | `{ outcome, email, invitedByName, organizations }` |
| `POST /invitations/redeem/:token` | none | `{ name, password }` | `201` + the login user + `Set-Cookie` |

`outcome` is `signup` (live, no account holds the address), `signin` (live, but the address gained
an account since — the invitation is waiting inside it), or `invalid`. **A dead token is a `200`,
not a `404`**, and the four ways of being dead fold into one answer so a guessed token learns
nothing.

`POST` returns the same shape `POST /auth/login` returns, which means the existing response handling
in `lib/auth-response.ts` already knows how to read it.

**This app has no link redemption.** `lib/use-invitations.ts` covers something different and still
correct: the in-app list of invitations addressed to a person who is *already signed in*
(`GET /invitations/mine`, accept, decline). The link path is the one that creates an account, and it
does not exist here.

## 3. Organization join links

| Repo | Commit | |
| --- | --- | --- |
| api | `b67bd4a` | Organization join links: generate, redeem, revoke |
| app | `3af178f` | Join links: an admin page and a public landing page |

A shareable link into one or more organizations. Unlike an invitation it names nobody: an admin
generates it, copies it, and sends it however they like. There is no email and no activity event.

- Token: 32 bytes base64url, hashed for lookup, encrypted at rest. **Rotating `CRYPTO_SECRET`
  invalidates every live join link.**
- Expiry presets are 1, 24 or 168 hours; the default is 24.
- Usage is single-use or unlimited. **A redemption spends a single-use link even when it granted
  nothing.**
- Status (`active` / `used` / `expired` / `revoked`) is derived, never stored.

| Route | Session | Answers |
| --- | --- | --- |
| `GET /organization-join-links/redeem/:token` | none | `{ outcome, organizations }`, always `200`, writes nothing |
| `POST /organization-join-links/redeem/:token` | **required** | `{ joined, alreadyMembers }`, `401` without one |

**The asymmetry with invitations is the thing to design around.** An invitation link *creates* the
account. A join link *requires* one — so on a phone, a signed-out person tapping a join link has to
sign in or sign up first and have the token survive that trip. See §7.

## 4. Sign-in is three steps, and onboarding is not one of them

This is the flow to copy, read off `src/features/auth/login/form/login-form.tsx` and `src/proxy.ts`
rather than inferred, and since confirmed by running the web app locally.

Both the three steps and onboarding arrived in the same commit, `6e088bf` on 09-19 — which also
reverted the username option (§1) and is titled "refactor(inbox)". Nothing in its subject says it
touches auth at all, which is why reading the log by subject line misses all three. **The window's
auth story is mostly in one grab-bag commit**, so date the files rather than trusting the titles.

`type LoginStep = "email" | "password" | "magic-link-sent"` — one form across all three, so the
identifier typed on step one is the one every later step uses.

| Step | Heading | What is on it |
| --- | --- | --- |
| `email` | "Welcome back" | the identifier field, and Google — a `GoogleLogin` button plus One Tap |
| `password` | "Enter your password" | the password field, and a button that asks for a magic link instead |
| `magic-link-sent` | "Check your email" | confirmation, resend, and a way back |

Every step after the first shows the identifier as a row that is itself the way back to step one.

### Superseded: there *is* a new-user branch now

**This section was right when it was written and is no longer true.** The API has since added
`POST /auth/account-state`, and the web form's step one calls it before advancing. Keep reading for
why it was refused, because the reasoning is what makes the reversal legible — then see
"What replaced it" below.

### What it used to be: no new-user branch, and there could not be one

**`handleEmailStepSubmit` calls `trigger("email")` and then `setStep("password")`. That is the whole
of it** — a local validation of one field and a step change. No request is made, and nothing on step
one knows or asks whether the identifier belongs to an account.

That is not an omission to fix on mobile. The API refuses to answer the question on purpose, in
three separate places:

- `POST /auth/login` returns one `401 invalid_credentials` for a wrong password, an unknown email
  and an unknown username alike, and the username branch resolves the account inside the same call
  that checks the password so the three cost the same work.
- `POST /auth/magic-link` answers `200 data: true` for a username that matches nothing, reporting a
  link it never sent, explicitly so the endpoint cannot be probed.
- The magic-link budget is charged on the identifier **before** the username lookup, so a real
  username and an unknown one cannot be told apart by which starts answering `429`.

A screen that branched on "is this a new user" would need an existence oracle, and building one
would hand back the enumeration all three of those exist to deny. **So step one advances to the
password step for everybody**, and whether the account exists is answered by the password attempt
or by the link.

### What replaced it

`POST /auth/account-state` → `{ exists, hasPassword }`. Unauthenticated, `POST` so the address stays
out of URLs and access logs, rate limited per identifier *and* per IP, and it carries two booleans
and nothing else off the row.

**The argument that changed is worth stating, because it is not "we stopped caring".** From the
route's own schema: *drawing the controls is itself the disclosure* — a second step with no password
field says the address has no password whatever the payload withheld. So the choice was never
between telling and not telling. It was between telling for free, via a screen anyone can read, and
telling under a budget. The route is the second. The other three defences above are untouched:
`/auth/login` still answers one `401`, and the magic-link route still reports a link it never sent.

Step two is therefore one of three things:

| `exists` | `hasPassword` | step two |
| --- | --- | --- |
| true | true | "Enter your password" — the password field |
| true | false | "Check your email instead" — link only |
| false | false | "Let's get you started" — link only |

The last two draw identical controls and are worded apart on purpose: "your account has no password"
and "you have no account" are different news, and one line covering both is useless to either
person.

Two behaviours that are not obvious from the contract and are worth copying rather than
rediscovering:

- **A failed probe does not advance.** Picking one of the two step-two screens without an answer
  means guessing, and guessing the link-only one hides the password field from somebody who has a
  password and blames their account for it. The web form stays on step one and reports it; so does
  this app.
- **The answer is cached for five minutes**, keyed on the identifier as sent. Going back to fix a
  typo and returning is then free against a budget the API keeps per identifier. Five minutes
  rather than longer because what it describes changes — somebody can set a password in another tab,
  and a stale "no password" strands them on a screen that will not take it.

This app implements all of the above (`lib/account-state`, `lib/account-state-cache`,
`lib/sign-in-steps`), verified against the live API and on the emulator for all three rows.

### What onboarding actually is

Not a signup screen and not part of the login form. It is a **post-authentication gate in the
proxy**:

```ts
function needsOnboarding(user: AuthUser): boolean {
	return !user.name?.trim();
}
```

Any authenticated account whose name is blank is redirected to `/onboarding?redirect=<where they
were going>` from anywhere, and the redirect is placed *before* the "already signed in, go home"
rule so a new account landing back on `/login` reaches it in one hop. The two-factor challenge is
carved out. The gate runs in both directions: once the name is set, `/onboarding` bounces you out,
so a bookmark cannot re-ask a settled question.

It collects **`name`, required, and `phone`, optional** (`onboarding-schema.ts`). It is reached
whatever produced the session — Google, magic link, password, invitation redemption — because the
only thing it tests is the blank name. In practice that is mostly the magic-link signup path, since
invitation redemption takes a `name` in its body and Google usually supplies one.

The write is `PUT /auth/profile`. Two things about it that will bite:

- **`name` is required on every call. It is a replace, not a patch.**
- **Omitting `phone` clears it.** The service writes `input.phone ?? null` unconditionally, which is
  the opposite of how `username` on the same route behaves. Send the current value to keep it.

### So the mobile flow is

1. Screen one: identifier + Google.
2. Screen two: password, with "email me a link instead".
3. Screen three: link sent, with resend.
4. **Then a gate, not a screen in the stack:** on reaching `signed-in`, if `user.name` is blank, go
   to onboarding before the Hub rather than to `ROLE_HREF[role]`. Same rule on a cold start with a
   hydrated session, which is what makes it a gate.

`lib/auth-machine.ts` already has the states this needs, and `lib/magic-link-route.ts` already
routes a signed-in person to `ROLE_HREF[state.user.role]` — that is the one place the gate has to
sit in front of. There is no onboarding in this app today.

## 5. The rest of the window, briefly

- **`20af591` / `3b43402` — broadcast acknowledgement.** The web dashboard is blocked until required
  broadcasts are acknowledged. This is a gate that sits *after* sign-in, so it shapes what a
  signed-in person sees rather than how they authenticate. This app does not implement it. Whether
  mobile should gate the Hub the same way is a product question nobody has answered.
- **`34d10ff`, `b8ef6e6`, `422d1eb`, `2aec0e6` — email providers and templates.** Server-side
  delivery: detailed provider test errors, template bodies backfilled, the `Talo` preheader
  corrected to `ChatRoute`. Matters to this app only in that a misconfigured provider now makes
  `POST /auth/magic-link` answer `500` rather than a false `200` — a real failure the sign-in screen
  should not report as a sent link.
- **`c0b3667` — `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in deploy.** Web plumbing. This app's Google audience
  arrangement is unchanged; see `ADR-0005`.

## 6. What did *not* change, and it matters

The credential scheme. `docs/api/auth.md` is explicit: **"A native client needs no API change at
all."**

- Session cookie `better-auth.session_token`, held and replayed by hand, `credentials: "omit"`.
- CSRF token from `GET /csrf`, not session-bound, sent as `x-csrf-token` on every POST and PUT.
- Expiry 7 days, sliding renewal after 1 day — overwrite the stored cookie whenever a response
  carries a fresh `Set-Cookie`.

Everything in §2 and §3 rides this same scheme. There is no new credential to hold and nothing in
`lib/keychain.ts` needs a new key.

`Authorization: Bearer` still resolves and is still not to be used. The doc records that a native
client was built against it once and the approach was dropped.

---

## 7. Invite app auto-open

### What is actually broken

Both new links are built from the **web** origin and only the web origin:

| Link | Built by | Shape |
| --- | --- | --- |
| Magic link | `auth.email.ts` | `<origin>/auth/magic-link?token=…` — origin may be native |
| Invitation | `memberships.email.listener.ts` → `buildRedemptionUrl` | `<ORIGIN_URL[0]>/invitations/redeem?token=…` |
| Join link | webapp `buildJoinLinkUrl` | `<NEXT_PUBLIC_FRONTEND_URL>/join?token=…` |

`MAGIC_LINK_APP_ORIGINS` — the allowlist that lets a link point at a custom scheme — is read in
exactly one place, `src/modules/auth/emails/auth.email.ts`. The invitation listener does not consult
it and the join link is built in the browser. So **tapping an invitation or a join link on a phone
opens the website, every time**, and there is no server setting that changes this.

### Why not just add a native origin to invitations

Because an invitation is mailed to somebody who by definition does not have an account yet, and very
likely does not have the app. A `chatroute://` link is a dead end for them: it opens nothing, and
several mail clients decline to linkify a non-HTTPS scheme at all — `lib/magic-link-config.ts`
already records this for magic links.

The link has to stay an HTTPS link that works in a browser. Making it open the app is therefore a
**verified app link**, not a scheme:

- **Android App Links** — `autoVerify` intent filter + `/.well-known/assetlinks.json` on the web
  origin.
- **iOS Universal Links** — `associatedDomains` + `/.well-known/apple-app-site-association`.

Installed, the app opens. Not installed, the existing web page answers. No API change, no email
change, and the web flow stays exactly as it is for everyone who does not have the app. This is also
the arrangement `lib/magic-link-config.ts` already names as the production answer for magic links —
so doing it once serves all three link shapes.

### What it needs here

1. **`app.json`** — an `android.intentFilters` entry with `"autoVerify": true` for the web host on
   `/invitations/redeem` and `/join`, and `ios.associatedDomains` with `applinks:<host>`.
2. **Association files on the web origin**, served from `/.well-known/` as `application/json`, with
   no redirect. Android's needs the package name and the **release signing certificate SHA-256**;
   iOS's needs the team id and bundle id.
   **Both carry the new identity from `5be1879`: `com.zeestglobal.joychat`.** The old
   `com.anonymous.enki` will verify nothing.
3. **Two routes**, mirroring `app/auth/magic-link.tsx`:
   - `app/invitations/redeem.tsx` — `GET` the preview, then branch on `outcome`: `signup` collects
     name and password and `POST`s, `signin` sends them to sign-in with the address filled,
     `invalid` explains and offers a way back.
   - `app/join.tsx` — `GET` the preview; with a session, `POST` and land in the Hub; without one,
     hold the token, send them to sign-in, and redeem after.
4. **A held token across sign-in**, for the join case only. The token is a live credential, so it
   belongs in memory for the length of that trip and not in the store — `ADR-0011` is the reasoning
   for keeping things off the disk, and a join token has less claim to a row than a message does.
5. **A `lib/invite-link-config.ts`**, the way `lib/magic-link-config.ts` exists: the path is fixed on
   both sides, the origin is the only variable, and a contract test asserts that what the API builds
   is what expo-router parses. That test is the point — this is the join between three repos where a
   wrong value looks perfectly fine and opens nothing.

### The gotchas

- **Verification is all-or-nothing per host.** A malformed `assetlinks.json`, a redirect, or the
  wrong fingerprint means Android silently falls back to the browser with no error anywhere.
- **Debug and release builds have different signing fingerprints.** List both, or app links will
  work in CI and not on a tester's device.
- **iOS caches the association file at install.** Changing it needs a reinstall to re-fetch.
- **`/join` and `/join-links` must not collide.** The webapp already guards this
  (`src/routes/routes.ts:50`); the intent filter has to be as careful, matching `/join` exactly
  rather than by prefix.
- **A single-use join link is spent by a redemption that granted nothing.** Do not let the app retry
  a `POST` on a network failure without knowing whether the first one landed.

---

## 8. Action items

**Do this first — it is a live regression, not a feature.**

- [ ] **`MAGIC_LINK_APP_ORIGINS` still names the old scheme.** Every deployed environment this app
      points at has it set to `enki:` or to nothing. Commit `5be1879` changed this app's scheme to
      `chatroute://`, so every magic link request from a current build now falls back to
      `BETTER_AUTH_URL` and **the emailed link stops opening the app**. It fails quietly: the API
      answers `200`, the mail arrives, the link opens a website. Set it to `chatroute:` wherever
      `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` is `chatroute://`. The API's own `.env.example` still shows
      `enki:` in its example line and should be corrected too.

**Then, in order of how much they unblock:**

- [ ] Decide the web host that will carry the association files, and whether one host serves all
      environments or each gets its own.
- [ ] Publish `assetlinks.json` and `apple-app-site-association` with `com.zeestglobal.joychat` and
      both signing fingerprints.
- [ ] `app.json`: `intentFilters` + `associatedDomains`.
- [ ] `app/invitations/redeem.tsx` and `lib/invite-link-config.ts` with its contract test.
- [ ] `app/join.tsx` and the held-token-across-sign-in path.
- [ ] Split sign-in into the three steps §4 describes, with the identifier and Google on the first.
- [ ] Add the onboarding gate: on reaching `signed-in` with a blank `user.name`, go to onboarding
      rather than `ROLE_HREF[role]`, on a fresh sign-in and on a hydrated cold start alike. Name
      required, phone optional, written with `PUT /auth/profile` — and send the current phone back,
      because omitting it clears it.
- [ ] Surface `username` on the profile screen, now that the API returns and accepts it.
- [ ] Answer whether required broadcasts should gate the mobile Hub the way they gate the web
      dashboard.

## 9. Open questions

- **Does an invitation redeemed on a phone belong to that phone's signed-in person?** No — the API
  is explicit that it attaches to the address the invitation names. The app should probably say so
  out loud when someone taps an invitation link while already signed in as somebody else, rather
  than quietly replacing their session the way a browser would.
- **Should a join link tapped by a signed-out person offer sign-up, or only sign-in?** The API only
  offers `POST` with a session; it has no signup-from-join-link path. Sign-up then redeem is two
  round trips and a token held across both.
- **One host or many?** App-link verification is per-host, and a staging host that is not in
  `associatedDomains` will open the browser instead — which is correct behaviour and looks like a
  bug to whoever is testing.
