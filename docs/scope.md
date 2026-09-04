# Enki (internal support messenger) — scope

Self-contained internal chat for support. Users log in. Three roles:

| Role | Sees |
|---|---|
| Customer | Own conversations only |
| Agent | Assigned + unassigned pool. Not other agents’ private histories. Cannot delete. |
| Admin | Global oversight. User management, assignment/transfer, broadcasts, deletion (audit later). |

Role names match the API's `role` enum (`admin | agent | customer`) exactly. This client
previously called the end-user role Contact; see `CONTEXT.md`.

Platforms (whole product): Next.js web, Expo iOS/Android, NestJS + Postgres + Socket.IO/Redis. **This repo is Expo only.**

Mobile in this app includes Customer, Agent, and a **slim** Admin surface (overview, users, conversations, settings). Full analytics, audit log UI, and SLA config stay on web.

## Not this product

- Stories
- Case-status stepper (Received → Assigned → In Review → Resolved)
- Casewire name/branding

Offers (Phase 1) are an in-app promo carousel plus a shared group chat (`id: 'offers'`). `"Sponsored"` is a label. Not stories, not an ad SDK.

Broadcasts are in-inbox announcements (later), not stories.

## Phases

0. Scaffold (done)
1. Basic UI mock (done) — Customer hub, inbox, thread on mock data.
2. Mock auth shell + role hubs (done) — login/register, AsyncStorage `{ email, role }`, splash/icon. Agent/Admin hub variants (mock knowledge / charts / add offer).
3. **Real auth (done)** — cookie sessions against the NestJS API, mirroring the web client, stored in `expo-secure-store`.
   - **3a. Password + magic link (done)** — `lib/api-client.ts`, `AuthContext`, real Hydration,
     magic-link deep link. Google button rendered disabled. 2FA out (see ADR-0004). The mock shell
     it replaced is gone with it: no register screen, no control that sets a role.
   - **3b. Google sign-in (done)** — needed a native module, so an EAS `development` profile and a
     Development client. Auth is the only part of the app that no longer runs in Expo Go. The ID token is
     minted for the *web* OAuth client so the API's existing audience check accepts it unchanged —
     see ADR-0005, and do not remove the web client identifier from the mobile configuration. 2FA
     is refused here with the same sentence the password path uses, because the API's two-factor
     hook fires on Google sign-in too.
4. Realtime (socket.io) + REST (TanStack Query). Every role's *conversations* are real —
   the list, sending, unread, and live delivery over a cookie-authenticated socket. The Admin's
   user directory is not; that is its own endpoint and its own ticket. Two connections — a global one
   and one per open conversation — mirroring the web client, with events folded into the same pure
   functions a fetched page goes through, so a reconnect resync arrives as nothing rather than as a
   second copy — as does the API's re-broadcast of a message whose receipt has advanced, which is
   how a tick moves without a refresh.
   See `docs/adr/ADR-0006-the-socket-carries-the-session-cookie.md`.

   Staff read the same list a Customer does. `GET /conversations` is scoped by the API's own
   policy, so an Agent's assigned threads, the unassigned pool, their staff DMs and their groups
   arrive in one answer and the screens divide it up — the pool is a filter over that list rather
   than a second request, and an Admin's org-wide set needs no client-side narrowing at all.
   Starting a staff DM goes through the Staff directory (`GET /conversations/staff`) and the
   get-or-create beside it. What staff see that a Customer does not is the System notice: an
   Engage, Takeover or Transfer, rendered as a centred line rather than a bubble.

   Still web-only: engaging, taking over, transferring and closing a thread. The mobile client
   reads the assignment those actions produce and renders the notices they write, but has no
   control that performs one.
5. Media, push, i18n, list virtualization.
   - 5a. Client media UI (local attachments) — image/video/document pick + in-app voice notes; `Message.attachment` with local URI; in-bubble render; no server upload. (done)
   - 5b. Push, i18n, list virtualization.

## Session

Signed in = a Session cookie in `expo-secure-store` that `GET /auth/session` accepts. Role is
**server-owned** — it arrives on the session user and the app cannot set it. Sign-out clears the
cookie and every cached identity, role included.

A session ends two ways, and both land on sign-in. Signing out discards the cookie, tells the
server, and completes even when that call fails. A session expiring — an authenticated request
answered `401` — discards the cookie without telling a server that has already refused it. A `403`
is not an expiry, and neither is a request that got no answer at all.

Hydration at cold start has three outcomes: signed in, signed out, and **Unreachable** — a cookie
exists but the API did not answer, which keeps the cookie and offers a retry rather than sending the
person to sign-in. A 401 is not Unreachable: it clears the cookie.

Self-registration does not exist; the API has no register endpoint. A Customer account comes into
existence two ways, both of them sign-in: verifying a first magic link, and signing in with Google
for the first time. Staff accounts are created by an Admin on web. The register screen is gone
rather than disabled — it posted nowhere — and the sign-in screen sends anyone without an account to
one of those two instead.

The Settings role switcher is gone. It set the session's role from the client, which server-owned
roles make a lie. What replaced it is a `__DEV__`-only picker on the sign-in screen for *which seed
account to sign in as*: it fills the form from `EXPO_PUBLIC_DEV_SEED_ACCOUNTS`, and the role that
arrives is the server's answer about that account. `__DEV__` is what keeps both the control and its
configured credentials out of a shipped bundle.
