# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

**Contact** — internal person seeking help or participating in support conversations; sees only their own threads. Reaches Home, Messages, and Help from the tab capsule.

**Agent** — support staff who reply in assigned threads and work the unassigned pool. Cannot delete.

**Admin** — oversight on a slim mobile surface (users, unassigned, conversations, hub overview). Full analytics stay on web.

Primary jobs on this client: support conversations, internal role-shaped communication, and admin overview — not a consumer chat app.

## Product Purpose

Enki is an internal support messenger. People log in, work in Contact / Agent / Admin roles, and handle help threads (plus related hub tools) without leaving the org’s messenger.

Success: each role reaches the right conversations and hub actions quickly, with RBAC respected; Contacts get help; Agents triage and reply; Admins oversee on mobile without needing the full web admin stack.

## Positioning

- Role-shaped hubs and RBAC: every role uses a tab hub, with a role-specific destination set (Contact: Home/Messages/Help; Agent: Home/Unassigned/Conversations; Admin: Home/Users/Unassigned/Conversations); capabilities follow role (view rules, unassigned pool, notes, delete, assign, broadcast — capability ≠ ship UI this phase).
- Internal-only product: not consumer chat, not Casewire, no Instagram-style stories, no case-status stepper.
- Offers = in-app promo carousel + shared group chat `id: 'offers'` (`"Sponsored"` is a label only). Agent/Admin hubs may include mock knowledge and overview charts; not an ad SDK or checkout.

## Operating Context

- This repo is the Expo iOS/Android client only. Next.js web, NestJS, and Postgres live elsewhere.
- Current phase: mock auth + role hubs, plus Phase 5a local media UI (`Message.attachment`, no server upload). Session blob `{ email, role }` in AsyncStorage (`ism.session`); mock data; no real backend in-app.
- Terminology source of truth: `CONTEXT.md` (Enki, Contact, Agent, Admin, Hub, Unassigned pool, Offers, Message, Attachment, Voice note).
- Scope source of truth: `docs/scope.md` + current phase in `AGENTS.md`.

## Capabilities and Constraints

- Confirmed roles and navigation model as in scope (all roles use tab hubs; Settings via hub gear).
- Phase discipline: do not install later-phase packages (real auth, sockets, TanStack Query, FlashList, etc.) ahead of the phase bump.
- Dead controls stay dead where phase says so (e.g. inbox compose). Thread attach + voice notes are live for Phase 5a (local URI only).
- RBAC helpers live in `lib/rbac.ts`; screens import them.
- Undecided for product record: exact org that will deploy Enki; production API contracts (owned outside this repo).

## Brand Commitments

- Product name: **Enki** (launcher, auth, hub wordmarks).
- Avoid as product naming: Messenger, Casewire, ISM.
- Hub role eyebrow labels: SUPPORT (Contact), AGENT, ADMIN — not in the header wordmark.
- Greeting copy (ADR-0001): Contact `How can we help, {name}?`; Agent `Ready when you are, {name}`; Admin `Welcome back, {name}`.

## Evidence on Hand

- Runnable Expo app with mock conversations, hubs, auth shell, and role switching in Settings.
- Domain language: `CONTEXT.md`. Scope: `docs/scope.md`. Hub chrome ADR: `docs/adr/ADR-0001-hub-chrome-and-phase-2-mobile-polish.md`.
- No real customer testimonials, press, or production metrics in this repo — do not fabricate them.

## Product Principles

1. Role clarity first — every surface should make the active role and its allowed job obvious.
2. Internal support, not social — prioritize triage, reply, and oversight over feeds, stories, or case theatrical UI.
3. Mobile Admin stays slim — overview and essential ops here; deep analytics and SLA stay on web.
4. Phase honesty — mock and deferred controls must not pretend to be shipped product.
5. Preserve confirmed terminology and brand naming across hubs and auth.

## Accessibility & Inclusion

- Reduced motion is a product requirement: animated transitions must keep a reduced-motion-safe path; avoid decorative-only motion (ADR-0001).
- Otherwise follow platform accessibility defaults and project UI rules; no separate WCAG certification target recorded yet.
