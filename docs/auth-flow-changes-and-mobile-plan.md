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
so none of this needs an API change to support a native client. The one thing that will break
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

**This app is already correct.** `lib/auth-service.ts:267` sends `identifier`, and the comment there
already names the strict-object failure. The `main` commit `c8f89fa` did this.

**What is still missing here:** the username is now part of the shared user payload and is editable
on web profile surfaces. This app neither displays nor edits it. That is a gap, not a break.

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
sign in or sign up first and have the token survive that trip. See §6.

## 4. The rest of the window, briefly

- **`20af591` / `3b43402` — broadcast acknowledgement.** The web dashboard is blocked until required
  broadcasts are acknowledged. This is a gate that sits *after* sign-in, so it shapes what a
  signed-in person sees rather than how they authenticate. This app does not implement it. Whether
  mobile should gate the Hub the same way is a product question nobody has answered.
- **`34d10ff`, `b8ef6e6`, `422d1eb`, `2aec0e6` — email providers and templates.** Server-side
  delivery: detailed provider test errors, template bodies backfilled, the `Talo` preheader
  corrected to `JoyChat`. Matters to this app only in that a misconfigured provider now makes
  `POST /auth/magic-link` answer `500` rather than a false `200` — a real failure the sign-in screen
  should not report as a sent link.
- **`c0b3667` — `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in deploy.** Web plumbing. This app's Google audience
  arrangement is unchanged; see `ADR-0005`.

## 5. What did *not* change, and it matters

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

## 6. Invite app auto-open

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
likely does not have the app. A `joychat://` link is a dead end for them: it opens nothing, and
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

## 7. Action items

**Do this first — it is a live regression, not a feature.**

- [ ] **`MAGIC_LINK_APP_ORIGINS` still names the old scheme.** Every deployed environment this app
      points at has it set to `enki:` or to nothing. Commit `5be1879` changed this app's scheme to
      `joychat://`, so every magic link request from a current build now falls back to
      `BETTER_AUTH_URL` and **the emailed link stops opening the app**. It fails quietly: the API
      answers `200`, the mail arrives, the link opens a website. Set it to `joychat:` wherever
      `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` is `joychat://`. The API's own `.env.example` still shows
      `enki:` in its example line and should be corrected too.

**Then, in order of how much they unblock:**

- [ ] Decide the web host that will carry the association files, and whether one host serves all
      environments or each gets its own.
- [ ] Publish `assetlinks.json` and `apple-app-site-association` with `com.zeestglobal.joychat` and
      both signing fingerprints.
- [ ] `app.json`: `intentFilters` + `associatedDomains`.
- [ ] `app/invitations/redeem.tsx` and `lib/invite-link-config.ts` with its contract test.
- [ ] `app/join.tsx` and the held-token-across-sign-in path.
- [ ] Surface `username` on the profile screen, now that the API returns and accepts it.
- [ ] Answer whether required broadcasts should gate the mobile Hub the way they gate the web
      dashboard.

## 8. Open questions

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
