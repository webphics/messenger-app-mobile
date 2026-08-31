# Bearer sessions on mobile

The API is Better Auth over cookies, and the web client uses it that way. This client instead sends
`Authorization: Bearer <session token>` and keeps the token in `expo-secure-store`, because a React
Native cookie jar behaves inconsistently across iOS and Android, `COOKIE_DOMAIN`/`SameSite=lax` are
hostile to a native client reaching a LAN IP or tunnel, and the API's global CSRF guard explicitly
bypasses Bearer requests — so the token path removes the mandatory `GET /csrf` round-trip before
every mutation rather than working around it. Every mutation but one; see below.

## Considered options

- **Cookies, as web does.** Zero API change, but inherits the cookie jar, the CSRF pre-flight, and
  the cookie-domain problem on every non-localhost host.
- **Bearer.** The API already enables Better Auth's `bearer()` plugin, exposes `set-auth-token` in
  CORS, and allows requests with no `Origin` — the intent was there, unfinished.

## Consequences

- **The API had to be finished, not just consumed.** `bearer()` sets `set-auth-token` on the Better
  Auth `Headers`, but `AuthController.appendCookies` only forwarded `Set-Cookie`, so no route ever
  returned the token to a client. Emitting that header is a prerequisite for this client, and lands
  as its own commit in `messenger-api`.
- **Sign-in itself still pays the CSRF pre-flight.** The guard waives a request carrying
  `Authorization: Bearer`, which is every authenticated request — but sign-in is the request that
  *obtains* the credential, so it has nothing to present and falls through to the CSRF path. Measured
  against a running API: `POST /auth/login` with no `Bearer` header is a 403 `csrf_invalid`. So
  `lib/api-client` fetches the double-submit pair from `GET /csrf` for unauthenticated mutations
  only, and echoes the cookie back by hand rather than trusting a cookie jar — the API scopes that
  cookie to `COOKIE_DOMAIN`, which a device reaching `10.0.2.2` or a LAN IP does not match. One extra
  round trip, once, on the one request that cannot avoid it. The alternative is `@SkipCsrf()` on
  `/auth/login` in the API, which is a defensible change (a login has no ambient credential to abuse)
  but belongs to that repository, not this one.
- **Two-factor is deferred on mobile.** The handoff between password-accepted and code-verified is
  carried in a short-lived `better-auth.two_factor` cookie with nothing in the response body, so a
  Bearer client has nothing to hold between the two steps. A `twoFactorRedirect` response tells the
  person to sign in on web. Supporting it needs the API to return the challenge as a token.
  (`POST /auth/two-factor/verify-backup-code` is also guarded by `AuthGuard`, so it cannot serve as
  the recovery path out of a half-authenticated state — an API bug independent of this decision.)
- **No refresh flow exists.** Sessions are a 7-day sliding window renewed by use; a dead token is a
  401, and a 401 signs the person out.
