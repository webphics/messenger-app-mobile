# 02: `POST /auth/two-factor/verify-backup-code` is session-guarded

**Status: closed, 2026-11-01. Fixed in the API, and confirmed by running it.**

## What was suspected

`POST /auth/two-factor/verify-backup-code` carried `@UseGuards(AuthGuard)`, which resolves a full
better-auth session. At the end of a two-factor challenge there is no session, only the short-lived
`better-auth.two_factor` cookie, so a backup code looked unredeemable at the one moment it exists
for. ADR-0013 kept backup codes off the sign-in challenge because of it, and held ticket 08 (enable
on the phone) behind it.

## What it turned out to be

Real, and on web as well: the web `/2fa/verify` page sends recovery codes to the same route and got
401.

## The fix

`messenger-api` commit `3e57c34`, "fix(auth): let a backup code finish a two-factor sign-in", on
branch `fix/backup-code-sign-in`. It removes the guard. better-auth 1.7.14's `verifyBackupCode`
authenticates the caller itself, from the challenge cookie when no session resolves and from the
session when one does, exactly as `verify-totp` does, which already carried no guard.

## Evidence

Run against the API on `fix/backup-code-sign-in` at `http://localhost:8080`, with the bench account
`customer38@chatroute.test`, before any mobile code changed:

| Step | Request | Answer |
| --- | --- | --- |
| 1 | `POST /auth/login` | 200, session cookie |
| 2 | `POST /auth/two-factor/enable` `{ password }` | 201, `totpURI` and ten backup codes |
| 3 | `POST /auth/two-factor/verify-totp` under that session | 201, session replaced, two-factor on |
| 4 | `POST /auth/login` again | 200, `{ twoFactorRedirect: true, twoFactorMethods: ["totp"] }`, sets `better-auth.two_factor`, no session |
| 5 | `POST /auth/two-factor/verify-backup-code` `{ code }` with **only** the challenge cookie and the CSRF pair | **201**, the user, `Set-Cookie` for `better-auth.session_token` and `better-auth.session_data` |
| 6 | `GET /auth/session` with the cookie from step 5 | 200, `customer38@chatroute.test` |
| 7 | the same backup code on a fresh challenge | 401 `invalid_credentials` |
| 8 | a backup code with no challenge and no session | 401 `invalid_credentials` |

Then the mobile client itself, on the Android emulator against the same API: see the commit that
closes this issue for what was driven.

## What changed on mobile

- The sign-in challenge takes a backup code as well as an authenticator code
  (`lib/two-factor-challenge`, `verifyTwoFactorCode` in `lib/auth-service`,
  `components/auth/sign-in-form`).
- Ticket 08 is unblocked: the account two-factor screen turns two-factor on
  (`lib/two-factor-api`, `lib/two-factor-management`,
  `components/settings/account-two-factor-screen`).
- ADR-0013 is amended to say so.
