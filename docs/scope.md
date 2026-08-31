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
2. **Mock auth shell + role hubs (current)** — login/register, AsyncStorage `{ email, role }`, splash/icon. Agent/Admin hub variants (mock knowledge / charts / add offer). Not better-auth.
3. Real auth — better-auth + expo-secure-store.
4. Realtime (socket.io) + REST (TanStack Query).
5. Media, push, i18n, list virtualization.
   - **5a. Client media UI (local attachments)** — image/video/document pick + in-app voice notes; `Message.attachment` with local URI; in-bubble render; no server upload. (this slice)
   - 5b. Push, i18n, list virtualization.

## Session

Logged in = non-empty `email` in AsyncStorage key `ism.session`. Role defaults to `customer` on first login; Settings can switch Customer / Agent / Admin. Sign-out clears email and **keeps role**. Current user = mock `Person` whose `role === getSession().role` (`getDevUser()`).
