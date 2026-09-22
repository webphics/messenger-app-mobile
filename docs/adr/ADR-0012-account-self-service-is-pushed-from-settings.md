# Account self-service is pushed from Settings, and the device you are holding cannot revoke itself

Password, sessions and two-factor management are reachable from the one shared Settings screen, as
rows that push to screens living outside the three role groups, beside `chat/`, `wall/` and
`community/`.

Root ADR 0008 ruled that governing your own account belongs to the account rather than the role, and
built the web surface once to mount under two route groups. This client has the easier version of
that problem. `components/settings/settings-screen.tsx` is already one shared, role-agnostic
component that `(admin)`, `(agent)` and `(customer)` all render, so rows on it inherit the property
without a fourth route group. A sessions list and a TOTP setup flow are both too tall to inline on
the Settings screen itself.

## Both password modes ship, so `SessionUser` widens

`POST /auth/set-password` and `POST /auth/change-password` both exist, and web picks between them on
`hasPassword`. Mobile does the same. A magic-link-only or Google-only account can therefore set a
password from the phone. Diverging from web here would break the single credential pattern that
ADR-0004 exists to hold, and it would mean a person could set a password on a laptop and not on a
phone for no reason they could discover.

`lib/types.ts` keeps `id`, `name`, `email` and `role` on `SessionUser` and drops `hasPassword` and
`twoFactorEnabled`, both of which the API sends on the session payload. `lib/account-state.ts` reads
`hasPassword` for an identifier before sign-in, which is a different path and unavailable once
signed in. Rather than add a second authenticated read for data the client was handed at sign-in and
threw away, the parse in `lib/user-parse.ts` widens to keep both. It already falls back on optional
fields rather than dropping a row, so the two additions follow the rule it already has.

## The current device is listed and carries no action

`POST /sessions/:id/revoke` would work on your own row, and web offers it. A phone cannot, because
revoking the session it is holding is a sign-out, and a sign-out here also wipes the local Store.
ADR-0011 keeps that file off device backups and `lib/session-wipe.ts` does the wiping. Two controls
one screen apart that do the same thing, only one of which admits it signs you out, is a trap rather
than a feature. The row is marked as this device and has no revoke. Sign out already sits on the
Settings screen above it and does the whole job.

`POST /sessions/revoke-others` ships as "Sign out everywhere else". `DELETE /sessions/:id` is not
surfaced, mirroring root ADR 0008: revoking ends access and leaves the record, while deleting erases
the evidence that a session existed at all.

## Consequences

- One shared account surface for all three roles, reached from the screen each role already lands
  on. No route group is added and no layout branches on role.
- `SessionUser` carries two more fields, which means `lib/user-parse.ts` has two more things to get
  right. Both are booleans with a safe default of false, so a missing field degrades to hiding a
  control rather than to a wrong one.
- Root ADR 0008 records that revoking one session pushes no realtime signal to that device while
  revoking many does. A revoked phone therefore learns on its next 401, which signs it out. The UI
  is built against that behaviour rather than around it.
- Deleting a session from history is unavailable on mobile, as on web. Anyone who needs it has the
  endpoint and no interface.
- Two-factor management lives here as a row, but what it contains is set by ADR-0013, not by this
  decision.
