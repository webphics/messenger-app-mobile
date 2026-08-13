# Internal Support Messenger — scope

Self-contained internal chat for support. Users log in. Three roles:

| Role | Sees |
|---|---|
| Contact | Own conversations only |
| Agent | Assigned + unassigned pool. Not other agents’ private histories. Cannot delete. |
| Admin | Global oversight. User management, assignment/transfer, broadcasts, deletion (audit later). |

Platforms (whole product): Next.js web, Expo iOS/Android, NestJS + Postgres + Socket.IO/Redis. **This repo is Expo only.**

Mobile in this app includes Contact, Agent, and a **slim** Admin surface (overview, users, conversations, settings). Full analytics, audit log UI, and SLA config stay on web.

## Not this product

- Stories
- Case-status stepper (Received → Assigned → In Review → Resolved)
- Casewire name/branding

Offers (Phase 1) are an in-app promo carousel plus a shared group chat (`id: 'offers'`). `"Sponsored"` is a label. Not stories, not an ad SDK.

Broadcasts are in-inbox announcements (later), not stories.

## Phases

0. Scaffold (done) — Expo SDK 57, Uniwind, RNR primitives, role shells, mock data, RBAC helpers, AI rules.
1. **Basic UI mock (current)** — Contact hub, inbox, thread on mock data. `DEV_ROLE` session.
2. Auth shell — better-auth + expo-secure-store.
3. Realtime (socket.io) + REST (TanStack Query).
4. Media, push, i18n, list virtualization.

## Dev role switch

Session is `DEV_ROLE` in `lib/mock-data.ts` (`'admin' | 'agent' | 'contact'`). Root `/` redirects to that role group. Current user is the mock `Person` whose `role === DEV_ROLE`.
