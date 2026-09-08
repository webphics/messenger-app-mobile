# Mirror the web client's credential pattern

This client authenticates the same way the web client does: the session cookie the API sets, plus a
cached CSRF token echoed as `X-CSRF-Token` on every mutation. One credential pattern across both
clients, one thing to reason about when auth misbehaves, and the web client stands as a working
reference for anything ambiguous.

The alternative considered and rejected was Bearer, which the API also supports — the `bearer()`
plugin is registered and `csrf.guard.ts` waives any request carrying an `Authorization: Bearer`
header. It was briefly built. It works, and it is genuinely simpler on the device: no CSRF token to
hold, no cookie bookkeeping. It was dropped because it made mobile the only client in the system
authenticating differently from every other, for a saving that turned out to be one cached token —
exactly what the web client already manages without difficulty.

`@better-auth/expo` was also considered and does not apply here: it expects the server to expose
Better Auth's own HTTP surface, and this API sets `disableControllers: true` and reaches Better Auth
in-process behind hand-written Nest controllers. Adopting it would mean serving a second auth API
outside the Zod envelope, the exception filter, and the CSRF layer.

## Consequences

- **Cookies are handled by hand, not by a cookie jar.** Every request sets `credentials: "omit"`, and
  every request that carries a credential attaches `Cookie` explicitly. (The CSRF pre-flight,
  `GET /csrf`, is the one request with no credential to attach — it is what fetches one. It still
  omits credentials, so the native store cannot slip one in.) This is not incidental: React Native's
  `fetch` is backed by native
  networking with its own cookie store, and on iOS a manually-set `Cookie` header can be silently
  overwritten by `NSHTTPCookieStorage`. Omitting credentials takes the native store out of the path
  so the header we set is the header that is sent. `@better-auth/expo` does the same thing for the
  same reason — it is the one idea worth taking from it.
- **Handling cookies manually also sidesteps `COOKIE_DOMAIN`.** The API scopes its cookies to a
  configured domain that a device reaching a LAN IP or `10.0.2.2` does not match. Storing and
  replaying the cookie by name and value ignores the `Domain` attribute entirely, so a device on any
  host works without server configuration.
- **The CSRF token is not session-bound.** `csrf.service.ts` configures `doubleCsrf` with
  `getSessionIdentifier: () => secret`, a constant — so the token is a pure double-submit value.
  Fetch it once from `GET /csrf`, cache it, replay the `csrf-token` cookie beside the
  `x-csrf-token` header, and refresh once on a 403. This is exactly what `lib/client-api.ts` does on
  web.
- **The API needs no changes for this client.** Nothing is added, nothing is waived, nothing is
  configured. That is the strongest property of this decision and the reason to prefer it.
- **Two-factor is still deferred on mobile, and the reason is on this side.** The handoff between
  password-accepted and code-verified rides a short-lived `better-auth.two_factor` cookie. A
  cookie-holding client can in principle carry it, so this is not blocked by transport — and it is
  not blocked by the API either: `POST /auth/two-factor/verify-totp` carries no auth guard and
  returns session cookies, so it is reachable from a native client today. Only
  `verify-backup-code` is guarded. What blocks it is here: `findSessionCookie` in `lib/api-client`
  keeps the session cookie and discards everything else, so the challenge cookie is thrown away the
  moment it arrives. Closing that needs a new `AuthOutcome`, a new `AuthState`, a code-entry screen,
  and a second thing for the client to hold — which is the bookkeeping this decision exists to keep
  small, so it stays its own piece of work rather than a rider on this one. Until then all three
  sign-in paths refuse a challenge with one sentence, and the API repo's `docs/api/auth.md` describes
  this as an API-side gap, which it is not.
- **This client gives up the session cookie cache.** The API enables
  `session.cookieCache`, which lets a browser skip the Postgres lookup on guarded routes by
  presenting a signed `better-auth.session_data` cookie beside the session token. Only the session
  token is stored and replayed here, so every guarded request from a device pays that lookup. It is
  a deliberate trade: `session_data` is a second credential with its own expiry and its own
  invalidation rules, and holding it by hand doubles the bookkeeping this decision exists to keep
  small. Revisit it if the session endpoint shows up in a latency budget, not before.
- **No refresh flow exists.** Sessions are a seven-day sliding window renewed by use; a dead session
  is a 401, and a 401 signs the person out. A transport failure does not.
