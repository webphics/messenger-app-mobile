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
3. **Real auth (current)** — cookie sessions against the NestJS API, mirroring the web client, stored in `expo-secure-store`.
   - **3a. Password + magic link** — `lib/api-client.ts`, `AuthContext`, real Hydration, magic-link
     deep link. Google button rendered disabled. 2FA out (see ADR-0004). (this slice)
   - 3b. Google sign-in — needs a native module, so an EAS `development` profile and a dev client.
4. Realtime (socket.io) + REST (TanStack Query).
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

Self-registration does not exist; the API has no register endpoint. A first-time email gets an
account by verifying a magic link. Staff accounts are created by an Admin on web.

The Settings role switcher is gone. It set the session's role from the client, which server-owned
roles make a lie; #22 brings it back as a `__DEV__`-only picker for *which seed account to sign in
as*, which is a different control with the same shape.
