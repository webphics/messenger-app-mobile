# Phase 0 Expo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runnable Expo SDK 57 app for Internal Support Messenger — Uniwind + RNR primitives, 3-role route shells, mock data, RBAC helpers + test, and AI guardrails.

**Architecture:** Single Expo Router app (no monorepo). Root `index` redirects on `DEV_ROLE`. Contact / Agent / slim Admin are sibling tab groups. Shared thread is `app/chat/[id].tsx`. Domain types + mock fixtures + pure RBAC live in `lib/`. RNR copies live only in `components/ui/`.

**Tech Stack:** Expo SDK 57, Expo Router, pnpm, TypeScript strict, Uniwind + Tailwind v4, React Native Reusables, lucide-react-native, Manrope + JetBrains Mono, Reanimated 4 + worklets + Gesture Handler, jest-expo.

## Global Constraints

- Product is Internal Support Messenger (SOW). No stories. No case-status rail. No Casewire branding. No Space Grotesk.
- This repo is Expo-only. No Next.js, NestJS, or Postgres code here.
- Package manager: pnpm. Do not use bun or npm. Add `.npmrc` with `node-linker=hoisted`.
- File/folder names: kebab-case. Components: PascalCase named exports. Expo Router pages: default export required.
- Styling: Uniwind only. No NativeWind, no `cssInterop`, no `remapProps`, no `nativewind/babel`.
- RNR primitives only in `components/ui/`. Do not create empty `components/chat` or `components/inbox`.
- Do not install: TanStack Query, socket.io-client, expo-sqlite, Drizzle, better-auth, expo-secure-store, expo-image, react-native-keyboard-controller, i18next, expo-localization, FlashList, LegendList.
- Phase 0 screens are labeled shells only — no chat bubbles, composer, or inbox rows.
- Never edit `.env`.
- Do not create git commits unless the user explicitly asks.
- Follow `.cursor/rules/ponytail.mdc` once it exists (Task 8); until then apply the same YAGNI ladder.
- Spec: `docs/superpowers/specs/2026-08-13-phase-0-scaffold-design.md`.

## File map

| Path | Responsibility |
|---|---|
| `.npmrc` | pnpm hoisted linker for Metro |
| `package.json` / `app.json` | name, slug, scripts, jest-expo |
| `metro.config.js` | Uniwind outermost wrapper |
| `global.css` | Tailwind v4 + Uniwind + light/dark tokens |
| `uniwind-types.d.ts` | generated typings (Metro); gitignore if generated |
| `lib/types.ts` | domain types |
| `lib/mock-data.ts` | fixtures + `DEV_ROLE` |
| `lib/cn.ts` | `cn()` via clsx + tailwind-merge |
| `lib/rbac.ts` | pure RBAC |
| `lib/rbac.test.ts` | RBAC matrix tests |
| `components.json` | RNR CLI config (Uniwind, utils → `@/lib/cn`) |
| `components/ui/*` | RNR button, text, input, avatar, badge, separator |
| `components/placeholder-screen.tsx` | shared labeled shell |
| `app/_layout.tsx` | fonts, css import, GestureHandler, root Stack |
| `app/index.tsx` | `DEV_ROLE` redirect |
| `app/(auth)/sign-in.tsx` | dead auth shell |
| `app/(contact)/*` | Contact tabs |
| `app/(agent)/*` | Agent tabs |
| `app/(admin)/*` | slim Admin tabs |
| `app/chat/[id].tsx` | shared thread shell |
| `AGENTS.md`, `docs/scope.md`, `.cursor/rules/*.mdc` | AI + human guardrails |

---

### Task 1: Expo SDK 57 scaffold + pnpm

**Files:**
- Create: `.npmrc`
- Modify: `package.json`, `app.json`, `tsconfig.json` (after template lands)
- Delete: template demo routes/components listed in Step 4
- Keep: `docs/` (already exists)

**Interfaces:**
- Consumes: nothing
- Produces: Expo SDK 57 app at repo root, `main: "expo-router/entry"`, slug `internal-support-messenger`, `@/*` path alias

- [ ] **Step 1: Scaffold into a temp folder**

Run from `d:\Programming\Personal\Expo-app-mobile-chat-app`:

```powershell
pnpm dlx create-expo-app@latest _scaffold --template default@sdk-57 --yes
```

Expected: `_scaffold/` with `package.json` whose `expo` dependency is `~57.x` or `^57.x`.

If the CLI still creates SDK 54, delete `_scaffold` and retry with:

```powershell
pnpm dlx create-expo-app@latest _scaffold --template default@sdk-57
```

- [ ] **Step 2: Move scaffold into repo root without wiping `docs/`**

```powershell
if ((Test-Path .git) -and (Test-Path _scaffold\.git)) {
  Remove-Item -Recurse -Force _scaffold\.git
}
Get-ChildItem -Force _scaffold | ForEach-Object {
  Move-Item -Path $_.FullName -Destination . -Force
}
Remove-Item -Recurse -Force _scaffold
if (Test-Path package-lock.json) { Remove-Item package-lock.json }
if (Test-Path bun.lock) { Remove-Item bun.lock }
if (Test-Path bun.lockb) { Remove-Item bun.lockb }
if (Test-Path yarn.lock) { Remove-Item yarn.lock }
```

Expected: `app/`, `package.json`, `app.json` at repo root. `docs/superpowers/` still present.

- [ ] **Step 3: pnpm + hoist + rename**

Create `.npmrc`:

```
node-linker=hoisted
```

In `package.json` set:

```json
"name": "internal-support-messenger"
```

In `app.json` / `app.config` (whichever the template emitted) set:

```json
{
  "expo": {
    "name": "Internal Support Messenger",
    "slug": "internal-support-messenger",
    "scheme": "internal-support-messenger",
    "newArchEnabled": true
  }
}
```

Keep all other Expo keys the template generated. Confirm `newArchEnabled` is `true` (SDK 57 default); set it if missing.

```powershell
pnpm install
```

Expected: `pnpm-lock.yaml` exists. No npm/bun lockfile.

- [ ] **Step 4: Delete template demo code**

Delete every file the default template added that is not Expo config. Typical SDK 57 default set (delete whichever exist):

- `app/(tabs)/` (entire folder)
- `app/modal.tsx`
- `components/` (entire folder — RNR recreates `components/ui` later)
- `constants/`
- `hooks/`
- `scripts/reset-project.js` or `scripts/`

Leave `app/_layout.tsx` in place (rewrite in Task 3).

Rewrite `app/_layout.tsx` temporarily so the app still typechecks:

```tsx
import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack />
}
```

Delete `app/index.tsx` if it imports deleted components. Recreate a stub:

```tsx
import { View, Text } from 'react-native'

export default function Index() {
  return (
    <View>
      <Text>scaffold</Text>
    </View>
  )
}
```

- [ ] **Step 5: Confirm SDK + alias**

Open `tsconfig.json`. Ensure:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

Run:

```powershell
pnpm exec expo config --type public
```

Expected: JSON with `"name": "Internal Support Messenger"`, `"slug": "internal-support-messenger"`, sdkVersion starting with `57`.

---

### Task 2: Uniwind + tokens + `cn`

**Files:**
- Create: `global.css`, `metro.config.js` (or modify if template created one), `lib/cn.ts`
- Modify: `app/_layout.tsx` (css import only)

**Interfaces:**
- Consumes: Task 1 app root
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/cn`; Tailwind tokens `bg`, `surface`, `ink`, `ink-soft`, `muted`, `line`, `primary`, `success`, `danger`, `amber`

- [ ] **Step 1: Install Uniwind stack**

```powershell
pnpm add uniwind tailwindcss clsx tailwind-merge
pnpm dlx expo customize metro.config.js
```

If `metro.config.js` already exists, skip `customize`.

- [ ] **Step 2: Write `metro.config.js`**

Replace with:

```js
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
})
```

`withUniwindConfig` must be the outermost wrapper.

- [ ] **Step 3: Write `global.css` at repo root**

```css
@import 'tailwindcss';
@import 'uniwind';

@theme {
  --font-sans: 'Manrope';
  --font-mono: 'JetBrains Mono';

  --color-bg: #f5f6f9;
  --color-surface: #ffffff;
  --color-ink: #14161f;
  --color-ink-soft: #3a3d4a;
  --color-muted: #6b7280;
  --color-line: #e4e6ec;
  --color-primary: #3452d9;
  --color-success: #1f9d6c;
  --color-danger: #d64545;
  --color-amber: #e2831c;
}

@layer theme {
  :root {
    @variant light {
      --color-bg: #f5f6f9;
      --color-surface: #ffffff;
      --color-ink: #14161f;
      --color-ink-soft: #3a3d4a;
      --color-muted: #6b7280;
      --color-line: #e4e6ec;
      --color-primary: #3452d9;
      --color-success: #1f9d6c;
      --color-danger: #d64545;
      --color-amber: #e2831c;
    }

    @variant dark {
      --color-bg: #0f1117;
      --color-surface: #1a1d27;
      --color-ink: #f4f5f8;
      --color-ink-soft: #c5c8d4;
      --color-muted: #8b90a0;
      --color-line: #2a2e3b;
      --color-primary: #6b82f0;
      --color-success: #3cbb88;
      --color-danger: #e06b6b;
      --color-amber: #f0a04a;
    }
  }
}
```

Do not add a theme toggle UI.

- [ ] **Step 4: Write `lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Import CSS from root layout**

In `app/_layout.tsx`, first line:

```tsx
import '../global.css'
import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack />
}
```

Do not import `global.css` from `index.js` / `expo-router/entry`.

- [ ] **Step 6: Smoke-check Uniwind classes**

Replace `app/index.tsx` with:

```tsx
import { Text, View } from 'react-native'

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <Text className="font-sans text-ink">uniwind ok</Text>
    </View>
  )
}
```

Run:

```powershell
pnpm exec tsc --noEmit
```

Expected: no errors, or only missing `uniwind-types.d.ts` until Metro runs. If TS fails on `className`, start Metro once (`pnpm expo start --clear`) then stop it — Uniwind generates `uniwind-types.d.ts`. Include that file via tsconfig `include` if it is not picked up.

If `uniwind-types.d.ts` is auto-generated on every Metro start, add it to `.gitignore` only if the Uniwind docs for this version say it is generated; otherwise commit it.

---

### Task 3: Fonts, gestures, Reanimated, lucide

**Files:**
- Modify: `app/_layout.tsx`, `package.json` (deps only)
- Modify: `babel.config.js` only if Reanimated plugin is missing after install

**Interfaces:**
- Consumes: Uniwind `global.css` font tokens `--font-sans` / `--font-mono`
- Produces: Root layout that loads Manrope + JetBrains Mono before showing the Stack; `lucide-react-native` available for tab icons

- [ ] **Step 1: Install Expo-compatible native deps**

```powershell
pnpm expo install expo-font expo-splash-screen react-native-reanimated react-native-worklets react-native-gesture-handler lucide-react-native
pnpm expo install @expo-google-fonts/manrope @expo-google-fonts/jetbrains-mono
```

Do not add `react-native-keyboard-controller`.

- [ ] **Step 2: Confirm Babel**

Open `babel.config.js`. SDK 57 `babel-preset-expo` already includes Reanimated. Do not add `react-native-reanimated/plugin` unless `pnpm expo start` errors asking for it. If you must add it, it is the last plugin:

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  }
}
```

- [ ] **Step 3: Replace `app/_layout.tsx`**

```tsx
import '../global.css'
import 'react-native-gesture-handler'

import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync()
    }
  }, [loaded, error])

  if (!loaded && !error) {
    return null
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  )
}
```

Uniwind maps `font-sans` / `font-mono` via `--font-sans` / `--font-mono`. If loaded fonts do not apply, register the same family names with `Font.loadAsync` under `'Manrope'` and `'JetBrains Mono'`, or set `@theme` to `Manrope_400Regular` / `JetBrainsMono_500Medium`. Prefer human family names; only switch to the Google Fonts internal names if text does not render.

- [ ] **Step 4: Verify install**

```powershell
pnpm ls uniwind react-native-reanimated react-native-worklets react-native-gesture-handler lucide-react-native expo-font
```

Expected: all listed, no missing.

---

### Task 4: Domain types + mock data

**Files:**
- Create: `lib/types.ts`, `lib/mock-data.ts`

**Interfaces:**
- Consumes: nothing
- Produces:

```ts
export type UserRole = 'admin' | 'agent' | 'contact'
export type ConversationKind = 'direct' | 'group'
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
}

export type Label = {
  id: string
  name: string
  color: string
}

export type Conversation = {
  id: string
  kind: ConversationKind
  subject: string | null
  participantIds: string[]
  assigneeId: string | null
  labelIds: string[]
  lastMessagePreview: string
  updatedAt: string
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: MessageStatus
}

export type InternalNote = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
}

export const DEV_ROLE: UserRole
export const PEOPLE: Person[]
export const LABELS: Label[]
export const CONVERSATIONS: Conversation[]
export const MESSAGES: Message[]
export const INTERNAL_NOTES: InternalNote[]
```

No `CaseStatus`. No `Story`.

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type UserRole = 'admin' | 'agent' | 'contact'

export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
}

export type ConversationKind = 'direct' | 'group'

export type Label = {
  id: string
  name: string
  color: string
}

export type Conversation = {
  id: string
  kind: ConversationKind
  subject: string | null
  participantIds: string[]
  assigneeId: string | null
  labelIds: string[]
  lastMessagePreview: string
  updatedAt: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export type Message = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  status: MessageStatus
}

export type InternalNote = {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
}
```

- [ ] **Step 2: Write `lib/mock-data.ts`**

```ts
import type {
  Conversation,
  InternalNote,
  Label,
  Message,
  Person,
  UserRole,
} from '@/lib/types'

export const DEV_ROLE: UserRole = 'agent'

export const PEOPLE: Person[] = [
  { id: 'admin-1', displayName: 'Amina Okonkwo', role: 'admin', avatarUrl: null },
  { id: 'agent-1', displayName: 'Jonah Reed', role: 'agent', avatarUrl: null },
  { id: 'agent-2', displayName: 'Priya Shah', role: 'agent', avatarUrl: null },
  { id: 'contact-1', displayName: 'Luis Ferreira', role: 'contact', avatarUrl: null },
  { id: 'contact-2', displayName: 'Elena Voss', role: 'contact', avatarUrl: null },
]

export const LABELS: Label[] = [
  { id: 'label-urgent', name: 'Urgent', color: '#d64545' },
  { id: 'label-billing', name: 'Billing', color: '#3452d9' },
]

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-assigned',
    kind: 'direct',
    subject: 'Cannot reset password',
    participantIds: ['contact-1', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: ['label-urgent'],
    lastMessagePreview: 'I still cannot get past the email step.',
    updatedAt: '2026-08-13T08:12:00.000Z',
  },
  {
    id: 'conv-unassigned',
    kind: 'direct',
    subject: 'Invoice discrepancy',
    participantIds: ['contact-2'],
    assigneeId: null,
    labelIds: ['label-billing'],
    lastMessagePreview: 'The March invoice does not match our PO.',
    updatedAt: '2026-08-13T09:40:00.000Z',
  },
  {
    id: 'conv-group',
    kind: 'group',
    subject: 'Warehouse onboarding',
    participantIds: ['contact-1', 'contact-2', 'agent-1'],
    assigneeId: 'agent-1',
    labelIds: [],
    lastMessagePreview: 'Sharing the access checklist here.',
    updatedAt: '2026-08-12T16:05:00.000Z',
  },
]

export const MESSAGES: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'Hi, the reset link never arrives.',
    createdAt: '2026-08-13T08:00:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-assigned',
    senderId: 'agent-1',
    body: 'Checking the mail logs now.',
    createdAt: '2026-08-13T08:06:00.000Z',
    status: 'read',
  },
  {
    id: 'msg-3',
    conversationId: 'conv-assigned',
    senderId: 'contact-1',
    body: 'I still cannot get past the email step.',
    createdAt: '2026-08-13T08:12:00.000Z',
    status: 'delivered',
  },
  {
    id: 'msg-4',
    conversationId: 'conv-unassigned',
    senderId: 'contact-2',
    body: 'The March invoice does not match our PO.',
    createdAt: '2026-08-13T09:40:00.000Z',
    status: 'sent',
  },
  {
    id: 'msg-5',
    conversationId: 'conv-group',
    senderId: 'agent-1',
    body: 'Sharing the access checklist here.',
    createdAt: '2026-08-12T16:05:00.000Z',
    status: 'read',
  },
]

export const INTERNAL_NOTES: InternalNote[] = [
  {
    id: 'note-1',
    conversationId: 'conv-assigned',
    authorId: 'agent-1',
    body: 'Possible typo in the contact email on file.',
    createdAt: '2026-08-13T08:08:00.000Z',
  },
]
```

Default `DEV_ROLE` is `'agent'` so Assigned + Unassigned tabs are visible while scaffolding. Flip this one constant to preview Contact or Admin.

- [ ] **Step 3: Typecheck**

```powershell
pnpm exec tsc --noEmit
```

Expected: PASS (ignore Uniwind dts if Metro has not run yet).

---

### Task 5: Jest + RBAC (TDD)

**Files:**
- Create: `lib/rbac.test.ts`, `lib/rbac.ts`
- Modify: `package.json` (jest + test script), `tsconfig.json` (`types: ["jest"]`)

**Interfaces:**
- Consumes: `UserRole`, `Conversation` from `@/lib/types`; fixtures from `@/lib/mock-data`
- Produces:

```ts
export function canViewConversation(role: UserRole, userId: string, conversation: Conversation): boolean
export function canAccessUnassignedPool(role: UserRole): boolean
export function canSeeInternalNotes(role: UserRole): boolean
export function canDeleteMessage(role: UserRole): boolean
export function canDeleteConversation(role: UserRole): boolean
export function canAssignConversation(role: UserRole): boolean
export function canBroadcast(role: UserRole): boolean
export function canManageUsers(role: UserRole): boolean
```

Unknown `role` throws. Agent view: assignee OR participant OR `assigneeId === null`. Contact view: participant only. Admin view: always. `canAssignConversation` is Admin only (no agent accept-from-pool).

- [ ] **Step 1: Install jest-expo (Windows)**

```powershell
pnpm expo install jest-expo jest @types/jest "--" --dev
```

In `package.json` add:

```json
"scripts": {
  "test": "jest --watchAll=false"
},
"jest": {
  "preset": "jest-expo",
  "transformIgnorePatterns": [
    "node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))"
  ]
}
```

Keep existing scripts. `test` must be non-watch so CI/agents can run it once.

In `tsconfig.json` `compilerOptions`:

```json
"types": ["jest"]
```

- [ ] **Step 2: Write failing tests `lib/rbac.test.ts`**

```ts
import {
  canAccessUnassignedPool,
  canAssignConversation,
  canBroadcast,
  canDeleteConversation,
  canDeleteMessage,
  canManageUsers,
  canSeeInternalNotes,
  canViewConversation,
} from '@/lib/rbac'
import { CONVERSATIONS } from '@/lib/mock-data'
import type { Conversation, UserRole } from '@/lib/types'

const assigned = CONVERSATIONS.find((c) => c.id === 'conv-assigned') as Conversation
const unassigned = CONVERSATIONS.find((c) => c.id === 'conv-unassigned') as Conversation
const group = CONVERSATIONS.find((c) => c.id === 'conv-group') as Conversation

describe('canViewConversation', () => {
  test('contact sees only threads they participate in', () => {
    expect(canViewConversation('contact', 'contact-1', assigned)).toBe(true)
    expect(canViewConversation('contact', 'contact-1', unassigned)).toBe(false)
    expect(canViewConversation('contact', 'contact-2', unassigned)).toBe(true)
    expect(canViewConversation('contact', 'contact-2', assigned)).toBe(false)
  })

  test('agent sees assignee, participant, or unassigned', () => {
    expect(canViewConversation('agent', 'agent-1', assigned)).toBe(true)
    expect(canViewConversation('agent', 'agent-2', assigned)).toBe(false)
    expect(canViewConversation('agent', 'agent-2', unassigned)).toBe(true)
    expect(canViewConversation('agent', 'agent-1', group)).toBe(true)
  })

  test('admin sees all', () => {
    expect(canViewConversation('admin', 'admin-1', assigned)).toBe(true)
    expect(canViewConversation('admin', 'admin-1', unassigned)).toBe(true)
    expect(canViewConversation('admin', 'admin-1', group)).toBe(true)
  })
})

describe('role matrix', () => {
  test('unassigned pool', () => {
    expect(canAccessUnassignedPool('contact')).toBe(false)
    expect(canAccessUnassignedPool('agent')).toBe(true)
    expect(canAccessUnassignedPool('admin')).toBe(true)
  })

  test('internal notes', () => {
    expect(canSeeInternalNotes('contact')).toBe(false)
    expect(canSeeInternalNotes('agent')).toBe(true)
    expect(canSeeInternalNotes('admin')).toBe(true)
  })

  test('delete message and conversation — admin only', () => {
    expect(canDeleteMessage('contact')).toBe(false)
    expect(canDeleteMessage('agent')).toBe(false)
    expect(canDeleteMessage('admin')).toBe(true)
    expect(canDeleteConversation('contact')).toBe(false)
    expect(canDeleteConversation('agent')).toBe(false)
    expect(canDeleteConversation('admin')).toBe(true)
  })

  test('assign, broadcast, manage users — admin only', () => {
    expect(canAssignConversation('contact')).toBe(false)
    expect(canAssignConversation('agent')).toBe(false)
    expect(canAssignConversation('admin')).toBe(true)
    expect(canBroadcast('contact')).toBe(false)
    expect(canBroadcast('agent')).toBe(false)
    expect(canBroadcast('admin')).toBe(true)
    expect(canManageUsers('contact')).toBe(false)
    expect(canManageUsers('agent')).toBe(false)
    expect(canManageUsers('admin')).toBe(true)
  })

  test('unknown role throws', () => {
    const bad = 'superuser' as UserRole
    expect(() => canBroadcast(bad)).toThrow(/unknown role/i)
    expect(() => canViewConversation(bad, 'x', assigned)).toThrow(/unknown role/i)
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```powershell
pnpm test -- lib/rbac.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/rbac'` or `canViewConversation is not a function`.

- [ ] **Step 4: Implement `lib/rbac.ts`**

```ts
import type { Conversation, UserRole } from '@/lib/types'

const ROLES: readonly UserRole[] = ['admin', 'agent', 'contact']

function assertRole(role: UserRole): void {
  if (!ROLES.includes(role)) {
    throw new Error(`Unknown role: ${String(role)}`)
  }
}

export function canViewConversation(
  role: UserRole,
  userId: string,
  conversation: Conversation,
): boolean {
  assertRole(role)
  if (role === 'admin') return true
  if (role === 'contact') return conversation.participantIds.includes(userId)
  return (
    conversation.assigneeId === userId ||
    conversation.participantIds.includes(userId) ||
    conversation.assigneeId === null
  )
}

export function canAccessUnassignedPool(role: UserRole): boolean {
  assertRole(role)
  return role === 'agent' || role === 'admin'
}

export function canSeeInternalNotes(role: UserRole): boolean {
  assertRole(role)
  return role === 'agent' || role === 'admin'
}

export function canDeleteMessage(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canDeleteConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canAssignConversation(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canBroadcast(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}

export function canManageUsers(role: UserRole): boolean {
  assertRole(role)
  return role === 'admin'
}
```

- [ ] **Step 5: Run tests — expect PASS**

```powershell
pnpm test -- lib/rbac.test.ts
```

Expected: all tests PASS.

---

### Task 6: React Native Reusables primitives

**Files:**
- Create: `components.json`, `components/ui/button.tsx`, `text.tsx`, `input.tsx`, `avatar.tsx`, `badge.tsx`, `separator.tsx` (CLI-generated; rename to kebab-case if needed)
- Modify: `package.json` (CLI-added deps: `class-variance-authority`, `@rn-primitives/*` as required)

**Interfaces:**
- Consumes: `@/lib/cn`, Uniwind `className`
- Produces: importable `@/components/ui/button`, `@/components/ui/text`, `@/components/ui/input`, `@/components/ui/avatar`, `@/components/ui/badge`, `@/components/ui/separator`
- Do not add PortalHost unless a generated file will not compile without it. Phase 0 primitives do not include dialogs.

- [ ] **Step 1: Write `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "global.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`tailwind.config` is empty — Tailwind v4 / Uniwind. `utils` points at `@/lib/cn` (file is `lib/cn.ts`, export `cn`).

- [ ] **Step 2: Add only the six primitives**

```powershell
pnpm dlx @react-native-reusables/cli@latest add button text input avatar badge separator -y
```

If the CLI asks NativeWind vs Uniwind, choose Uniwind. `uniwind` is already in `package.json`, so it should detect it.

If the CLI package name fails, use:

```powershell
pnpm dlx react-native-reusables@latest add button text input avatar badge separator -y
```

- [ ] **Step 3: Enforce kebab-case filenames**

If the CLI wrote `Button.tsx` / `Text.tsx`, rename to `button.tsx` / `text.tsx` and fix internal imports (`@/components/ui/text`, not `@/components/ui/Text`).

Do not rewrite primitive internals unless imports break. Do not install keyboard-controller if the CLI tries to add it — remove it from `package.json` if it appears.

- [ ] **Step 4: Typecheck**

```powershell
pnpm exec tsc --noEmit
```

Expected: PASS. If `cn` import paths inside generated files point at `@/lib/utils`, change those imports to `@/lib/cn` or add `lib/utils.ts` that re-exports `cn` from `./cn`. Prefer fixing generated imports to `@/lib/cn` (one source).

---

### Task 7: Role route shells

**Files:**
- Create: `components/placeholder-screen.tsx`
- Create: `app/index.tsx` (replace stub)
- Create: `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`
- Create: `app/(contact)/_layout.tsx`, `app/(contact)/index.tsx`, `app/(contact)/settings.tsx`
- Create: `app/(agent)/_layout.tsx`, `app/(agent)/index.tsx`, `app/(agent)/unassigned.tsx`, `app/(agent)/settings.tsx`
- Create: `app/(admin)/_layout.tsx`, `app/(admin)/index.tsx`, `app/(admin)/users.tsx`, `app/(admin)/conversations.tsx`, `app/(admin)/settings.tsx`
- Create: `app/chat/[id].tsx`
- Modify: `app/_layout.tsx` only if Stack needs named screens (prefer file-based defaults)

**Interfaces:**
- Consumes: `DEV_ROLE` from `@/lib/mock-data`; RNR `Button`, `Text`, `Input`, `Badge`; `lucide-react-native` icons; `expo-router` `Stack`, `Tabs`, `Redirect`, `Link`, `useLocalSearchParams`, `router`
- Produces: `/` → `/(contact)` | `/(agent)` | `/(admin)` from `DEV_ROLE`; Settings → Sign out → `/(auth)/sign-in` → Continue → `/`; sample chat links to `/chat/conv-assigned`, `/chat/conv-unassigned`, `/chat/conv-group`

Do not import `@react-navigation/*`.

- [ ] **Step 1: Write `components/placeholder-screen.tsx`**

```tsx
import { Link } from 'expo-router'
import { View } from 'react-native'

import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import type { UserRole } from '@/lib/types'

type PlaceholderScreenProps = {
  title: string
  role: UserRole
  chatHref?: '/chat/conv-assigned' | '/chat/conv-unassigned' | '/chat/conv-group'
  children?: React.ReactNode
}

export function PlaceholderScreen({
  title,
  role,
  chatHref,
  children,
}: PlaceholderScreenProps) {
  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="font-sans text-2xl font-semibold text-ink">{title}</Text>
      <View className="mt-3 flex-row items-center gap-2">
        <Badge variant="secondary">
          <Text>{role}</Text>
        </Badge>
        <Text className="font-sans text-muted">Not wired</Text>
      </View>
      {chatHref ? (
        <Link href={chatHref} className="mt-6">
          <Text className="font-sans text-primary">Open sample chat</Text>
        </Link>
      ) : null}
      {children}
    </View>
  )
}
```

If RNR `Badge` children API differs (no wrapping `Text`), follow the generated `badge.tsx` signature. If `variant="secondary"` does not exist, use the variant the CLI generated.

If `React.ReactNode` needs an import, use `import type { ReactNode } from 'react'` and rename the prop type.

- [ ] **Step 2: Root redirect `app/index.tsx`**

```tsx
import { Redirect } from 'expo-router'

import { DEV_ROLE } from '@/lib/mock-data'

const ROLE_HREF = {
  contact: '/(contact)',
  agent: '/(agent)',
  admin: '/(admin)',
} as const

export default function Index() {
  return <Redirect href={ROLE_HREF[DEV_ROLE]} />
}
```

- [ ] **Step 3: Auth group**

`app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: true, title: 'Sign in' }} />
}
```

`app/(auth)/sign-in.tsx`:

```tsx
import { router } from 'expo-router'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'

export default function SignInScreen() {
  return (
    <View className="flex-1 bg-bg px-4 pt-8">
      <Text className="font-sans text-2xl font-semibold text-ink">Sign in</Text>
      <Text className="mt-2 font-sans text-muted">Not wired · mock role only</Text>
      <Input className="mt-6" placeholder="Email" autoCapitalize="none" editable={false} />
      <Button className="mt-4" onPress={() => router.replace('/')}>
        <Text>Continue</Text>
      </Button>
    </View>
  )
}
```

Adjust `Button` children to match generated API (`asChild` vs wrapping `Text`).

- [ ] **Step 4: Contact tabs**

`app/(contact)/_layout.tsx`:

```tsx
import { MessageCircle, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

export default function ContactLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3452d9',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

`app/(contact)/index.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function ContactChatsScreen() {
  return <PlaceholderScreen title="Chats" role="contact" chatHref="/chat/conv-assigned" />
}
```

`app/(contact)/settings.tsx`:

```tsx
import { router } from 'expo-router'

import { PlaceholderScreen } from '@/components/placeholder-screen'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export default function ContactSettingsScreen() {
  return (
    <PlaceholderScreen title="Settings" role="contact">
      <Button className="mt-8" variant="outline" onPress={() => router.push('/(auth)/sign-in')}>
        <Text>Sign out</Text>
      </Button>
    </PlaceholderScreen>
  )
}
```

- [ ] **Step 5: Agent tabs**

`app/(agent)/_layout.tsx`:

```tsx
import { Inbox, MessageCircle, Settings } from 'lucide-react-native'
import { Tabs } from 'expo-router'

export default function AgentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3452d9',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Assigned',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="unassigned"
        options={{
          title: 'Unassigned',
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

`app/(agent)/index.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function AgentAssignedScreen() {
  return <PlaceholderScreen title="Assigned" role="agent" chatHref="/chat/conv-assigned" />
}
```

`app/(agent)/unassigned.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function AgentUnassignedScreen() {
  return <PlaceholderScreen title="Unassigned" role="agent" chatHref="/chat/conv-unassigned" />
}
```

`app/(agent)/settings.tsx`:

```tsx
import { router } from 'expo-router'

import { PlaceholderScreen } from '@/components/placeholder-screen'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export default function AgentSettingsScreen() {
  return (
    <PlaceholderScreen title="Settings" role="agent">
      <Button className="mt-8" variant="outline" onPress={() => router.push('/(auth)/sign-in')}>
        <Text>Sign out</Text>
      </Button>
    </PlaceholderScreen>
  )
}
```

- [ ] **Step 6: Slim Admin tabs**

`app/(admin)/_layout.tsx`:

```tsx
import { LayoutDashboard, MessageCircle, Settings, Users } from 'lucide-react-native'
import { Tabs } from 'expo-router'

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#3452d9',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: 'Conversations',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

`app/(admin)/index.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function AdminOverviewScreen() {
  return <PlaceholderScreen title="Overview" role="admin" />
}
```

`app/(admin)/users.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function AdminUsersScreen() {
  return <PlaceholderScreen title="Users" role="admin" />
}
```

`app/(admin)/conversations.tsx`:

```tsx
import { PlaceholderScreen } from '@/components/placeholder-screen'

export default function AdminConversationsScreen() {
  return <PlaceholderScreen title="Conversations" role="admin" chatHref="/chat/conv-group" />
}
```

`app/(admin)/settings.tsx`:

```tsx
import { router } from 'expo-router'

import { PlaceholderScreen } from '@/components/placeholder-screen'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'

export default function AdminSettingsScreen() {
  return (
    <PlaceholderScreen title="Settings" role="admin">
      <Button className="mt-8" variant="outline" onPress={() => router.push('/(auth)/sign-in')}>
        <Text>Sign out</Text>
      </Button>
    </PlaceholderScreen>
  )
}
```

- [ ] **Step 7: Shared chat shell `app/chat/[id].tsx`**

```tsx
import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'
import { DEV_ROLE } from '@/lib/mock-data'

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="font-mono text-sm text-muted">{id}</Text>
      <Text className="mt-2 font-sans text-2xl font-semibold text-ink">Thread</Text>
      <Text className="mt-2 font-sans text-muted">
        {DEV_ROLE} · Not wired
      </Text>
    </View>
  )
}
```

Chat must be a Stack screen with a visible header + back. If the root Stack has `headerShown: false`, set a local option via `Stack` in `app/chat/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'

export default function ChatLayout() {
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ headerShown: true, title: 'Chat' }} />
    </Stack>
  )
}
```

Only add `app/chat/_layout.tsx` if the chat header does not appear otherwise.

- [ ] **Step 8: Typecheck + tests still pass**

```powershell
pnpm exec tsc --noEmit
pnpm test -- lib/rbac.test.ts
```

Expected: both PASS.

Manual check: `pnpm expo start`, open iOS simulator or Android emulator (App Store Expo Go may not be SDK 57 — use simulator / `eas go`). With `DEV_ROLE = 'agent'`, land on Assigned. Open Unassigned, Settings → Sign out → Continue back to Assigned. Tap Open sample chat. Flip `DEV_ROLE` to `'contact'` then `'admin'` and confirm each group.

---

### Task 8: AI guardrails + human scope doc

**Files:**
- Create: `AGENTS.md`
- Create: `docs/scope.md`
- Create: `.cursor/rules/ponytail.mdc`
- Create: `.cursor/rules/project-scope.mdc`
- Create: `.cursor/rules/rbac.mdc`
- Create: `.cursor/rules/phase-discipline.mdc`
- Create: `.cursor/rules/naming.mdc`
- Create: `.cursor/rules/expo-router.mdc`
- Create: `.cursor/rules/uniwind-rnr.mdc`
- Create: `.cursor/rules/typescript.mdc`

Keep each rule except `ponytail.mdc` under ~50 lines. `ponytail.mdc` is the user’s full text, verbatim.

- [ ] **Step 1: Write `AGENTS.md`**

```md
# Internal Support Messenger — Expo

Expo iOS/Android client for an internal support messenger (Admin / Agent / Contact). Source of truth: Project Plan & Scope of Work PDF + `docs/scope.md`.

This repo is Expo-only. Next.js web and NestJS/Postgres/better-auth live elsewhere.

## Now (Phase 0)

UI scaffold on mock data (`lib/mock-data.ts`). `DEV_ROLE` is the only session. No real auth, network, or persistence.

## Hard rules

- No Instagram stories. No case-status rail. No Casewire branding.
- Kebab-case files. PascalCase components. Named exports except Expo Router pages.
- Uniwind + Tailwind v4 only. Never NativeWind (`cssInterop`, `remapProps`, `nativewind/babel`).
- RNR primitives live in `components/ui/` only. App UI later: `components/chat/`, `components/inbox/` (do not create empty dirs).
- RBAC matrix is `lib/rbac.ts`, not ad-hoc `if (role)` in screens.
- Never edit `.env`.
- Do not add TanStack Query, socket.io, sqlite, Drizzle, better-auth, secure-store, expo-image, keyboard-controller, i18n, or FlashList until that phase.
- Package manager: pnpm.

Cursor rules: `.cursor/rules/`. Spec: `docs/superpowers/specs/2026-08-13-phase-0-scaffold-design.md`.
```

- [ ] **Step 2: Write `docs/scope.md`**

```md
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

Broadcasts are in-inbox announcements (later), not stories.

## Phases

0. **Scaffold (current)** — Expo SDK 57, Uniwind, RNR primitives, role shells, mock data, RBAC helpers, AI rules.
1. Auth shell — better-auth + expo-secure-store.
2. Inbox + chat mock UI.
3. Realtime (socket.io) + REST (TanStack Query).
4. Media, push, i18n, list virtualization.

## Dev role switch

Phase 0 session is `DEV_ROLE` in `lib/mock-data.ts` (`'admin' | 'agent' | 'contact'`). Root `/` redirects to that role group.
```

- [ ] **Step 3: Write `.cursor/rules/ponytail.mdc`**

```md
---
description: Ponytail, lazy senior dev mode. Always pick the simplest solution that works.
globs:
alwaysApply: true
---

# Ponytail, lazy senior dev mode

You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does it already exist in this codebase? Reuse the helper, util, or pattern that's already here, don't re-write it.
3. Does the standard library already do this? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then: write the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the task and the code it touches, trace the real flow end to end, then climb.

Bug fix = root cause, not symptom: a report names a symptom. Grep every caller of the function you touch and fix the shared function once — one guard there is a smaller diff than one per caller, and patching only the path the ticket names leaves a sibling caller still broken.

Rules:

- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins, but only once you understand the problem. The smallest change in the wrong place isn't lazy, it's a second bug.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size, lazy means less code, not the flimsier algorithm.
- Mark deliberate simplifications that cut a real corner with a known ceiling (global lock, O(n²) scan, naive heuristic) with a `ponytail:` comment naming the ceiling and upgrade path.

Not lazy about: understanding the problem (read it fully and trace the real flow before picking a rung, a small diff you don't understand is just laziness dressed up as efficiency), input validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs (the platform is never the spec ideal, a clock drifts, a sensor reads off), anything explicitly requested. Lazy code without its check is unfinished: non-trivial logic leaves ONE runnable check behind, the smallest thing that fails if the logic breaks (an assert-based demo/self-check or one small test file; no frameworks, no fixtures). Trivial one-liners need no test.
```

- [ ] **Step 4: Write `.cursor/rules/project-scope.mdc`**

```md
---
description: Product scope — SOW messenger, Expo-only, Phase 0 scaffold
alwaysApply: true
---

# Project scope

Internal Support Messenger. Roles: Admin, Agent, Contact.

Do not build: Instagram stories, case-status rail, Casewire branding, Next.js, NestJS, or Postgres in this repo.

Phase 0 = runnable Expo scaffold + mock data + RBAC helpers + rules. No chat UI, no real auth, no sockets.

Slim Admin on mobile: overview / users / conversations / settings only. No analytics, audit log UI, or SLA config here.
```

- [ ] **Step 5: Write `.cursor/rules/rbac.mdc`**

```md
---
description: RBAC visibility matrix for Admin, Agent, Contact
alwaysApply: true
---

# RBAC

Source of truth: `lib/rbac.ts`. Screens import those helpers; do not copy role checks.

| Capability | Contact | Agent | Admin |
|---|---|---|---|
| View thread | participant only | assignee, participant, or unassigned | all |
| Unassigned pool | no | yes | yes |
| Internal notes | no | yes | yes |
| Delete message / conversation | no | no | yes |
| Assign / transfer | no | no (accept-from-pool is a later phase) | yes |
| Broadcast | no | no | yes |
| Manage users | no | no | yes |

Unknown role throws.
```

- [ ] **Step 6: Write `.cursor/rules/phase-discipline.mdc`**

```md
---
description: Phase 0 — mock data only, no backend packages
alwaysApply: true
---

# Phase discipline

Mock data lives only in `lib/mock-data.ts`. `DEV_ROLE` is the session. Sign-in does not authenticate.

Do not install or wire: TanStack Query, socket.io-client, expo-sqlite, Drizzle, better-auth, expo-secure-store, expo-image, react-native-keyboard-controller, i18next, FlashList, LegendList.

No fake JWT. No `fetch` to a missing API. No SecureStore.
```

- [ ] **Step 7: Write `.cursor/rules/naming.mdc`**

```md
---
description: Kebab-case files, PascalCase components
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Naming

- Files and folders: kebab-case (`sign-in.tsx`, `placeholder-screen.tsx`, `rbac.ts`).
- Components: PascalCase (`export function PlaceholderScreen`).
- Named exports preferred. Expo Router pages must default-export.

```tsx
// BAD
components/PlaceholderScreen.tsx

// GOOD
components/placeholder-screen.tsx
export function PlaceholderScreen() {}
```
```

- [ ] **Step 8: Write `.cursor/rules/expo-router.mdc`**

```md
---
description: Expo Router role groups and shared chat route
globs: app/**
alwaysApply: false
---

# Expo Router

Role groups: `(auth)`, `(contact)`, `(agent)`, `(admin)`. Shared thread: `app/chat/[id].tsx` → `/chat/:id`.

Root `app/index.tsx` redirects from `DEV_ROLE`. No auth gate in Phase 0.

Import navigation only from `expo-router`. Never `@react-navigation/*` (SDK 56+).

Do not put test files under `app/`.
```

- [ ] **Step 9: Write `.cursor/rules/uniwind-rnr.mdc`**

```md
---
description: Uniwind + RNR styling rules
globs: "**/*.{ts,tsx,css}"
alwaysApply: false
---

# Uniwind + RNR

Use `className` + `cn()` from `@/lib/cn`. Tokens: `bg`, `surface`, `ink`, `ink-soft`, `muted`, `line`, `primary`, `success`, `danger`, `amber`.

Forbidden: NativeWind, `cssInterop`, `remapProps`, `nativewind/babel`, wrapping RN core views with `withUniwind`.

RNR copies: `components/ui/` only. Future app UI: `components/chat/`, `components/inbox/` — do not create empty dirs now.

```tsx
// BAD
import { cssInterop } from 'nativewind'

// GOOD
<View className={cn('bg-bg', className)} />
```
```

- [ ] **Step 10: Write `.cursor/rules/typescript.mdc`**

```md
---
description: TypeScript strict, domain types from lib/types.ts
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# TypeScript

`strict` is on. No `any`. No `as unknown as` to silence errors.

Domain models come from `@/lib/types`. Do not declare parallel `UserRole` / `Conversation` types in screens.

RBAC returns booleans or throws on unknown role. Do not swallow that throw.
```

- [ ] **Step 11: Final verification**

```powershell
pnpm test -- lib/rbac.test.ts
pnpm exec tsc --noEmit
Get-ChildItem .cursor\rules\*.mdc | Select-Object Name
```

Expected: tests PASS, tsc PASS, eight rule files listed: `ponytail`, `project-scope`, `rbac`, `phase-discipline`, `naming`, `expo-router`, `uniwind-rnr`, `typescript`. `AGENTS.md` and `docs/scope.md` exist.

---

## Spec coverage (self-review)

| Spec section | Task |
|---|---|
| Expo SDK 57, pnpm, slug, newArch | 1 |
| Uniwind, tokens, dark variants, `cn` | 2 |
| Fonts, Reanimated, worklets, GH, lucide | 3 |
| Types + mock data + `DEV_ROLE` | 4 |
| RBAC + jest-expo test | 5 |
| RNR six primitives, kebab-case | 6 |
| Role shells, sign-in, `/chat/[id]` | 7 |
| AGENTS.md, scope.md, 8 rules inc. ponytail | 8 |
| No empty chat/inbox dirs | Global + Task 6/7 |
| No backend packages | Global + phase-discipline |
| No commits unless asked | Global |

No TBD/TODO placeholders. Signatures in Task 5 match Task 4 types and Task 7 imports (`DEV_ROLE`, RNR paths, `UserRole`).
