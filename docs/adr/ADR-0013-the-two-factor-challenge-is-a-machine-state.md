# The two-factor challenge is a state in the sign-in machine, not a screen you can reach

ADR-0004 deferred two-factor and priced it exactly: a new `AuthOutcome`, a new `AuthState`, a
code-entry screen, and a second credential for the client to hold. This decision spends that, and
rules where the state lives.

The challenge is a state in `lib/auth-machine.ts`, rendered by the sign-in screen that is already on
the display. It is not a route. `app/auth/magic-link.tsx` is a route because an inbound email link
has to land somewhere. A challenge has no inbound link, and giving it a URL would make a
half-finished handshake into an address reachable out of order, with a held credential that only
makes sense mid-flow.

## What was actually blocking it

`findSessionCookie` in `lib/api-client.ts` keeps the session cookie and discards every other cookie
in the response, which throws the short-lived `better-auth.two_factor` challenge cookie away the
moment it arrives. ADR-0004 identified this as the whole of the blocker and recorded that it sits on
this side rather than the API's. Nothing on the server changes for the challenge:
`POST /auth/two-factor/verify-totp` carries no auth guard and returns session cookies, so it is
reachable from a device today.

Until now all three sign-in paths refused a challenge with one sentence telling the person to use the
web app. An account with two-factor on could not sign in on a phone at all. That is the access bug
this closes, and it is why the challenge lands before management rather than after it.

## Both kinds of code at the challenge, and enable on the phone

*Amended 2026-11-01. As first written this section said TOTP only, and enable off the phone. The
reasoning is kept below because it is why the order of work went the way it did.*

`POST /auth/two-factor/verify-backup-code` used to carry `@UseGuards(AuthGuard)`, and that guard
comes from `@thallesp/nestjs-better-auth`, so it resolved a full session. At challenge time there is
no session, only the challenge cookie. A backup code therefore could not be redeemed at the one
moment it exists to be used, and the challenge screen offered TOTP and nothing else. It was broken
on web as well: `two-factor-verify-client.tsx` called the backup-code route from its own challenge
screen and got the same 401.

Management consequently shipped in two halves. Disable, regenerate backup codes and view current
state shipped first. Enable was held back until backup-code recovery worked, because offering it
while the only recovery path for the factor was broken would have let a person turn on a lock and
throw away the only spare key, from the device most likely to be the one they lose.

The API has since dropped the guard (`messenger-api` commit `3e57c34`). better-auth's
`verifyBackupCode` authenticates from the challenge cookie or from a session by itself, so the route
now matches `verify-totp`. `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md`
ran it against the API before anything here changed: a backup code presented with only the
challenge cookie answered 201 with session cookies, a reused one and one with no challenge answered
401. So:

- The challenge takes either kind of code. Which one is a field on the sign-in screen and a route in
  `verifyTwoFactorCode`, not a second machine state: both answer the same challenge with the same
  cookie and come back with the same session.
- Enable ships, as a setup card on the account two-factor screen. `POST /auth/two-factor/enable`
  mints the secret and the codes without turning anything on, and the first code from the new
  authenticator, sent to `verify-totp` under the session, is what turns it on. The codes are shown
  before that code is asked for, so they are stored while nothing depends on them yet.

## Consequences

- The client holds a second credential for the length of one handshake. It is the first thing besides
  the session cookie and the CSRF token that `lib/api-client.ts` retains, which is exactly the
  bookkeeping ADR-0004 was protecting, so it is scoped to the machine state and discarded with it.
- A `two-factor` `AuthState` and a matching `AuthOutcome` exist, so the three sign-in paths stop
  sharing one refusal string.
- Management shipped in two. The half without enable came first. Enable followed once the challenge
  existed and a backup code could answer it, because enabling a factor from a phone that cannot
  answer its challenge, or whose spare key does not open it, is the lockout this decision exists to
  prevent.
- A person who has two-factor on and has lost their authenticator gets in from a phone with a backup
  code. One who has lost both still cannot, and no client fixes that.
