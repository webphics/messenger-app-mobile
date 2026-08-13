# Phase 0 — Expo Scaffold Design

**Date:** 2026-08-13  
**Product:** Internal Support Messenger (Expo iOS/Android)  
**Source of truth:** Project Plan & Scope of Work (PDF). Claude’s Casewire UI scaffold is not the product.

---

## 1. What this phase builds

An empty-but-runnable Expo app with:

- Official SDK 57 project, pnpm, TypeScript strict, Uniwind, React Native Reusables (minimal primitives)
- Role-gated Expo Router shells for Contact, Agent, and slim Admin
- Domain types + mock data + pure RBAC helpers + one small RBAC test
- AI guardrails: `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/scope.md`

It does **not** build chat UI, inbox rows, real auth, networking, or persistence.

**Done when:**

1. `pnpm expo start` boots on simulator / `eas go` / Android emulator.
2. Root redirect lands on the `DEV_ROLE` shell (admin | agent | contact).
3. All placeholder screens in Section 3 are reachable.
4. Shared `/chat/[id]` opens as a labeled shell.
5. RNR `Button`, `Text`, `Input`, `Avatar`, `Badge`, `Separator` render with Uniwind `className`.
6. `lib/rbac` tests pass.
7. `AGENTS.md`, `docs/scope.md`, and all rule files in Section 6 exist.

---

## 2. Product identity (locked)

Internal, self-contained support messenger. Three roles:

| Role | Mobile in this app | Sees |
|---|---|---|
| Contact | Yes | Own conversations only |
| Agent | Yes | Assigned conversations + unassigned pool. Cannot see other agents’ private histories. Cannot delete messages or conversations. |
| Admin | Yes, **slim** surface | Global conversation list, user management entry, assignment/transfer entry, broadcast entry. Not the full web admin suite (analytics, audit log UI, SLA config UI). |

**Explicitly not in this product (Claude Casewire leftovers):**

- Instagram-style stories
- Case-status rail (Received → Assigned → In Review → Resolved)
- Space Grotesk / “Casewire” branding

Broadcasts are in-inbox announcements (later phase), not stories.

**This repo is Expo-only.** Next.js web and NestJS/Postgres/better-auth live elsewhere.

**Display name:** Internal Support Messenger  
**Slug / bundle base:** `internal-support-messenger`  
Rename when client branding arrives; token *names* stay.

---

## 3. Architecture

Single Expo app. No monorepo, no pnpm workspaces.

### 3.1 Routes

```
app/
  _layout.tsx                 # fonts (useFonts Manrope + JetBrains Mono), Uniwind, providers, root stack
  index.tsx                   # always redirect to DEV_ROLE group — no auth gate in Phase 0
  (auth)/
    _layout.tsx
    sign-in.tsx               # dead shell; reachable from Settings → Sign out (navigate only)
  (contact)/
    _layout.tsx               # tabs: Chats | Settings
    index.tsx
    settings.tsx
  (agent)/
    _layout.tsx               # tabs: Assigned | Unassigned | Settings
    index.tsx
    unassigned.tsx
    settings.tsx
  (admin)/
    _layout.tsx               # tabs: Overview | Users | Conversations | Settings
    index.tsx                 # overview placeholder
    users.tsx
    conversations.tsx
    settings.tsx
  chat/
    [id].tsx                  # shared thread shell; capabilities later via rbac
```

- Role groups are sibling route groups under the root stack.
- Chat lives outside role groups so the URL is always `/chat/:id`.
- Phase 0 screens are labeled shells: screen title, current role, “not wired”. No mock Messenger UI.
- Do not import `@react-navigation/*`. Use `expo-router` only (SDK 56+).

### 3.2 Libraries

```
components/
  ui/                         # RNR primitives only (CLI-generated, kebab-case)
lib/
  types.ts
  mock-data.ts
  cn.ts
  rbac.ts
```

Do not create empty `components/chat` or `components/inbox`. Those folders start when those phases do. Rules still name those paths as the future home for app UI.

### 3.3 Naming

- **Files and folders:** kebab-case everywhere (`sign-in.tsx`, `message-bubble.tsx`, `rbac.ts`).
- **Components / types / functions:** PascalCase / camelCase as usual (`export function MessageBubble`).
- **Named exports preferred** over default exports, except where Expo Router requires a default page export.

---

## 4. Stack (locked)

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57, New Architecture on, Expo Router |
| Package manager | pnpm (not bun — Metro transitive resolution is unreliable with bun) |
| Language | TypeScript, `strict: true` |
| Styling | Uniwind + Tailwind CSS v4. `@import 'tailwindcss'` + `@theme` in `global.css`. Metro plugin only. No NativeWind, no `nativewind/babel`, no `cssInterop`, no `remapProps`. |
| UI | React Native Reusables via `@react-native-reusables/cli`, copied into `components/ui/` |
| Icons | `lucide-react-native` |
| Fonts | `@expo-google-fonts/manrope` (UI) + `@expo-google-fonts/jetbrains-mono` (IDs, timestamps). No Space Grotesk. |
| Animation / gestures | `react-native-reanimated` v4 + `react-native-worklets` + `react-native-gesture-handler` — installed, unused beyond what RNR/Expo need |
| Lists | React Native `FlatList` |

**Phase 0 RNR primitives (only these):** `button`, `text`, `input`, `avatar`, `badge`, `separator`.

**Do not add in Phase 0:** TanStack Query, socket.io-client, expo-sqlite, Drizzle, better-auth, expo-secure-store, expo-image, react-native-keyboard-controller, i18next / expo-localization, FlashList / LegendList.

**Expo Go:** App Store build may lag SDK 57. Develop on iOS Simulator, Android emulator, or `eas go` / sign.expo.dev. A development client is a later phase, not Phase 0.

### 4.1 Design tokens

Light messenger palette in `@theme` (hex values are placeholders until client branding):

| Token | Use |
|---|---|
| `--color-bg` | Screen background `#F5F6F9` |
| `--color-surface` | Cards, bars `#FFFFFF` |
| `--color-ink` / `--color-ink-soft` | Primary / secondary text `#14161F` / `#3A3D4A` |
| `--color-muted` | Timestamps, placeholders `#6B7280` |
| `--color-line` | Borders `#E4E6EC` |
| `--color-primary` | Actions, sent-bubble later `#3452D9` |
| `--color-success` | Resolved / online later `#1F9D6C` |
| `--color-danger` | Destructive `#D64545` |
| `--color-amber` | Urgent / SLA later `#E2831C` |

Define dark-mode `@theme` variants in CSS in Phase 0. Do not ship a theme toggle UI.

---

## 5. Data, types, RBAC

### 5.1 Flow

Screens import static data from `lib/mock-data.ts` only. No `fetch`, no SecureStore, no SQLite.

Phase 0 has no auth gate. `DEV_ROLE: UserRole` in `mock-data.ts` is the only “session”. `app/index.tsx` always `Redirect`s to `/(contact)`, `/(agent)`, or `/(admin)` from that value. Sign-in does not change `DEV_ROLE`. Settings → Sign out only `router.push`es `/(auth)/sign-in`. Sign-in primary action `router.replace`s `/`, which follows `DEV_ROLE` again.

### 5.2 Types (`lib/types.ts`)

```ts
type UserRole = 'admin' | 'agent' | 'contact'

type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
}

type ConversationKind = 'direct' | 'group'

type Label = {
  id: string
  name: string
  color: string
}

type Conversation = {
  id: string
  kind: ConversationKind
  subject: string | null
  participantIds: string[]
  assigneeId: string | null
  labelIds: string[]
  lastMessagePreview: string
  updatedAt: string
}

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: MessageStatus
}

type InternalNote = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
}
```

No `CaseStatus`. No `Story`. Mock data includes at least: one admin, two agents, two contacts, one assigned direct chat, one unassigned direct chat, one group chat, a few messages, one internal note, two labels (`Urgent`, `Billing`).

### 5.3 RBAC (`lib/rbac.ts`)

Pure functions. This is the code source of truth; Cursor rules describe the same matrix.

```ts
function canViewConversation(role: UserRole, userId: string, conversation: Conversation): boolean
function canAccessUnassignedPool(role: UserRole): boolean
function canSeeInternalNotes(role: UserRole): boolean
function canDeleteMessage(role: UserRole): boolean
function canDeleteConversation(role: UserRole): boolean
function canAssignConversation(role: UserRole): boolean
function canBroadcast(role: UserRole): boolean
function canManageUsers(role: UserRole): boolean
```

Matrix:

| Capability | Contact | Agent | Admin |
|---|---|---|---|
| View thread | yes if participant | yes if assignee, participant, or `assigneeId === null` | yes all |
| Unassigned pool | no | yes | yes |
| Internal notes | no | yes | yes |
| Delete message / conversation | no | no | yes |
| Assign / transfer | no | no (accept from pool is later; not assign-others) | yes |
| Broadcast | no | no | yes |
| Manage users | no | no | yes |

`canViewConversation` for Agent: `assigneeId === userId` OR `participantIds.includes(userId)` OR `assigneeId === null`. Contact: `participantIds.includes(userId)` only. Admin: always true.

Unknown `role` throws (programmer error). No UI toasts in Phase 0.

`canAssignConversation`: Admin only in Phase 0. Agent “accept from unassigned pool” is a later phase; do not encode it as assign-others.

---

## 6. AI guardrails

### 6.1 `AGENTS.md` (root)

One-pager: product name, three roles, Expo-only repo, mock data only, kebab-case, Uniwind not NativeWind, never edit `.env`, pointer to `docs/scope.md` and `.cursor/rules/`.

### 6.2 `.cursor/rules/` (`.mdc`, one concern, keep each under ~50 lines except ponytail which is the user’s full text)

| File | `alwaysApply` / globs | Purpose |
|---|---|---|
| `ponytail.mdc` | always | User’s lazy-senior / YAGNI ladder, verbatim |
| `project-scope.mdc` | always | SOW product, no stories, no case rail, no Next/Nest in this repo, Phase 0 = scaffold |
| `rbac.mdc` | always | Visibility matrix matching Section 5.3 |
| `phase-discipline.mdc` | always | No backend packages until that phase. No fake auth. Mock data only in `lib/mock-data.ts` |
| `naming.mdc` | `**/*.{ts,tsx}` | kebab-case files, PascalCase components |
| `expo-router.mdc` | `app/**` | Role groups, shared `chat/[id]`, no `@react-navigation/*` |
| `uniwind-rnr.mdc` | `**/*.{ts,tsx,css}` | `className` + `cn()`. No NativeWind APIs. RNR only in `components/ui`. Future app UI: `components/chat`, `components/inbox` (do not create empty dirs in Phase 0) |
| `typescript.mdc` | `**/*.{ts,tsx}` | strict, no `any`, types from `lib/types.ts` |

### 6.3 `docs/scope.md`

Human SOW digest + phase map:

0. Scaffold (this spec)
1. Auth shell (better-auth + secure store) — later
2. Inbox + chat mock UI — later
3. Realtime (socket.io) + REST (TanStack Query) — later
4. Media, push, i18n, list virtualization — later

---

## 7. Testing

Only non-trivial Phase 0 logic is `lib/rbac.ts`.

- Use whatever test runner `create-expo-app` SDK 57 ships (Jest or the template default). Do not add Vitest/Playwright/Detox.
- One file: `lib/rbac.test.ts` next to the module.
- Cover the matrix in Section 5.3: each role × each function, plus unknown-role throw.
- No tests for placeholder screens.

---

## 8. Out of scope (Phase 0)

Chat bubbles, composer, thread rows, story viewer, case stepper, real auth, sockets, sqlite, push, i18n, FlashList, keyboard-controller, EAS Submit / store listing, theme toggle UI, Agent “accept from pool”, Admin analytics/audit/SLA screens.

---

## 9. Implementation approach

1. Scaffold Expo SDK 57 TypeScript template into this repo root. `docs/` already exists — do not wipe it. If `create-expo-app` refuses a non-empty directory, generate into a temp folder and move files over, keeping `docs/`.
2. Configure pnpm, Uniwind (metro + `global.css` + Tailwind v4), path alias `@/`.
3. Install Reanimated/worklets/gesture-handler, lucide, fonts.
4. Init RNR `components.json` and `pnpm dlx @react-native-reusables/cli add` the six primitives. Rename any PascalCase generated files to kebab-case if the CLI emits them.
5. Replace default routes with Section 3.1 shells.
6. Add `lib/types.ts`, `mock-data.ts`, `cn.ts`, `rbac.ts` + test.
7. Write `AGENTS.md`, `docs/scope.md`, `.cursor/rules/*`.
8. Verify `pnpm expo start` and tests.

Do not commit unless the user asks.
