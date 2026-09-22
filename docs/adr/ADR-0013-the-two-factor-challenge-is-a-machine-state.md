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

## TOTP only at the challenge, and enable stays off the phone

`POST /auth/two-factor/verify-backup-code` carries `@UseGuards(AuthGuard)`, and that guard comes
from `@thallesp/nestjs-better-auth`, so it resolves a full session. At challenge time there is no
session, only the challenge cookie. A backup code therefore cannot be redeemed at the one moment it
exists to be used. The challenge screen offers TOTP and nothing else.

This is suspected to be broken on web as well, since `two-factor-verify-client.tsx` calls the
backup-code mutation from its own challenge screen against the same guarded route. It is filed
separately as `.scratch/mobile-parity/issues/02-backup-code-verify-is-session-guarded.md` and is not
fixed here. Reading the code is not running it, so that issue confirms before it concludes.

Management consequently ships in two halves. Disable, regenerate backup codes and view current state
ship with it. **Enable does not ship until backup-code recovery is confirmed working.** Offering
enable while the only recovery path for the factor is broken would let a person turn on a lock and
throw away the only spare key, from the device most likely to be the one they lose.

## Consequences

- The client holds a second credential for the length of one handshake. It is the first thing besides
  the session cookie and the CSRF token that `lib/api-client.ts` retains, which is exactly the
  bookkeeping ADR-0004 was protecting, so it is scoped to the machine state and discarded with it.
- A `two-factor` `AuthState` and a matching `AuthOutcome` exist, so the three sign-in paths stop
  sharing one refusal string.
- Management splits in two. The half without enable ships on its own and is done when its screens
  render. Enable is a separate ticket, blocked both on the backup-code issue and on the challenge,
  because enabling a factor from a phone that cannot answer its challenge is the lockout this
  decision exists to prevent.
- A person who has two-factor on and has lost their authenticator still cannot get in from a phone.
  That is not made worse by this decision, and it is not fixed by it either.
