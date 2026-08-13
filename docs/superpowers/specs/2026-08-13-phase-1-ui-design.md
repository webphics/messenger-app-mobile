# Phase 1 — Basic UI Design

**Date:** 2026-08-13  
**Product:** Internal Support Messenger (Expo)  
**Depends on:** Phase 0 scaffold (`docs/superpowers/specs/2026-08-13-phase-0-scaffold-design.md`)  
**Approach:** A — Contact hub → Inbox → Thread (three implementation plans after this spec)

Mock data only. No auth, sockets, uploads, or ad network. Stories remain forbidden.

Visual source of truth (locked):

| Screen | Mock |
|---|---|
| Contact hub | nsave-style hub mock (Support / How can we help / Messages+Help / Recent / Search / Offers ads carousel / FAQ). **No Contact tab bar** — header gear + stack back. |
| Inbox | Messenger-style light list (Messages / search / All·Open·Resolved / rows + unread pills / Offers megaphone row) |
| Thread | Simple modern bubbles (light grey in, primary blue out, pill composer). Not the earlier “old tool” thread mock. Not Messenger dark. Not red outgoing. |

---

## 1. What this phase builds

Replace Phase 0 labeled shells with real mock UI:

1. Contact **Home hub** + Help FAQ list  
2. **Inbox** list (Contact stack + Agent Chats + Admin conversations)  
3. **Thread** (`/chat/[id]`) with bubbles + optimistic send  

Still `DEV_ROLE` session. Still `lib/mock-data.ts` + `lib/rbac.ts`.

**Done when:**

- Contact `DEV_ROLE` lands on hub matching locked mock (structure + tokens, not pixel-perfect photography).
- Messages / Recent / Offers / FAQ navigate as in §3.
- Inbox matches locked mock: search, chips, rows, Offers row, unread pills, online dots.
- Thread: simple pills, header name + subtitle, composer send appends mock message.
- `canViewConversation` still gates opening a thread.
- `pnpm test -- lib/rbac.test.ts` still passes. New UI has no required test file unless a non-trivial helper is added (e.g. inbox filter) — then one small test next to that helper.
- `docs/scope.md` phase map updated: Phase 1 = UI mock; auth is later.

---

## 2. Phase map change

`docs/scope.md` today says Phase 1 = auth, Phase 2 = inbox/chat mock. **Wrong order.** Update to:

0. Scaffold (done)  
1. **Basic UI mock (this spec)**  
2. Auth shell (better-auth + secure store)  
3. Realtime + REST  
4. Media, push, i18n, list virtualization  

---

## 3. Navigation

### 3.1 Contact

**Stack, no tab bar.** Hub gear → settings. Messages / Help / Settings push with native back. Agent/Admin keep their tabs.

| From | To |
|---|---|
| Home (index) | Hub (`headerShown: false`) |
| Messages card | `/(contact)/messages` (stack, back) |
| Recent message | `/chat/[id]` of that thread |
| Help / Search for help / FAQ card | `/(contact)/help` (stack, back) |
| Offer **View offer** / See all / **Join Offers chat** | `/chat/offers` |
| Header gear | `/(contact)/settings` (stack, back) |

Inbox is a **push**, not a tab. Contact inbox must **not** show a Chats tab or a Home/Settings tab bar.

### 3.2 Agent

Tabs: **Chats | Unassigned | Settings** (rename today’s Assigned tab label to **Chats**). Screen header title on Chats is **Messages** (locked mock).

- Chats = inbox mock (assigned + participant + Offers if in group). Chips All \| Open \| Resolved.  
- Unassigned = `assigneeId === null` list only. Same row component. **Not** a chip. Hide filter chips on Unassigned.  
- Row tap → `/chat/[id]` if `canViewConversation`.

### 3.3 Admin

Existing slim tabs. **Conversations** = inbox mock over all threads (header title “Messages”, same chips). Users and Overview stay Phase 0 placeholder shells.

### 3.4 Shared thread

`app/chat/[id].tsx`. Offers group id is literally `'offers'`.

Do not import `@react-navigation/*`.

---

## 4. Visual system

Keep Phase 0 tokens. Do not switch to nsave maroon or Messenger black.

| Token | Use |
|---|---|
| `bg` `#F5F6F9` | screen |
| `surface` `#FFFFFF` | cards, header, bubbles in, composer |
| `ink` / `ink-soft` / `muted` | text |
| `line` | dividers, chip idle, search border |
| `primary` `#3452D9` | actions, outgoing bubbles, active tab, unread pill, Join Offers chat |
| `success` | online dot |

Hub cards: ~16 radius, light shadow, white on `bg`. Offers promo cards: full-bleed gradient (local `visual` key), white CTA. Inbox chips: selected = primary-soft bg + primary text; idle = line/grey. Thread incoming bubble fill ≈ `#F2F2F2`; outgoing = `primary`; radius ~18–20.

Compose icon on inbox: visible, **dead** (no new-thread flow).

---

## 5. Contact hub (Plan 1)

ScrollView, pixel target = locked hub mock.

1. Header: “Support”, overlapping avatars (assigned agents from mock, fallback initials), gear → settings  
2. `Hi {firstName}` + **How can we help?**  
3. Nav card: Messages → `/(contact)/messages`; Help → `/(contact)/help`  
4. Recent message: latest own non-Offers thread; tap → `/chat/[id]`  
5. Search card: “Search for help” → `/(contact)/help` (no live search)  
6. Offers ads block: title + `Sponsored` (label only) + See all → `/chat/offers`; horizontal paging carousel; dots; **Join Offers chat** → `/chat/offers`  
7. FAQ card → `/(contact)/help`  
8. Tab bar Home (active) \| Settings  

**Offer type:**

```ts
export type OfferVisual = 'payouts' | 'zero-fee' | 'verify'

export type Offer = {
  id: string
  title: string
  subtitle: string
  ctaLabel: string
  visual: OfferVisual
  chatId: 'offers'
}
```

Fixtures: 3 offers. All `chatId: 'offers'`. No ad SDK. No commerce checkout.

**Help (`/(contact)/help`):** FlatList of FAQ items (`FaqItem`: `id`, `question`, `answer`). Tap a question to expand/collapse the answer under it. No extra screen, no CMS, no new RNR primitive.

---

## 6. Inbox (Plan 2)

Pixel target = locked inbox mock.

Chrome: title “Messages”, dead compose icon, search (client filter on name/subject/preview), chips **All | Open | Resolved**.

**Row:** avatar, green online dot if `Person.isOnline`, bold title (displayName or subject or `Offers`), grey `preview · relativeTime`, blue unread count if `unreadCount > 0`. Offers row: megaphone-in-circle avatar, title `Offers`, always shown to Contact.

**Title rule:**

- `id === 'offers'` → `Offers`  
- `kind === 'direct'` → other participant `displayName`  
- `kind === 'group'` → `subject` ?? `'Group'`  

**Filters (no CaseStatus type):**

- Open = conversation does **not** include label named `Resolved`  
- Resolved = includes label `Resolved`  
- All = none  

Add mock label `Resolved` and put it on at least one thread so the chip does something.

**Unread / online (Phase 1 mock only):** extend types:

```ts
export type Person = {
  id: string
  displayName: string
  role: UserRole
  avatarUrl: string | null
  isOnline: boolean
}

export type Conversation = {
  // ...existing fields
  unreadCount: number
}
```

Update all mock people/conversations. RBAC tests that construct conversations must include `unreadCount` (default `0` in tests or update fixtures).

Agent Unassigned tab: same row component, `assigneeId === null`, ignore Open/Resolved chips or hide chips — **hide chips** on Unassigned (pool is unassigned, not resolved-state).

---

## 7. Thread (Plan 3)

Simple Messenger-like pills on **light** chrome. Rejected: old generated thread mock, dark Messenger theme, red outgoing, GIF/mic/camera/thumbs-up, in-bubble identity block on every 1:1 message, mono `conv-assigned` in header.

**Header:** back, avatar, **name** (direct: other person; group/Offers: subject), grey subtitle (`Person.lastActiveLabel` e.g. `Active now` / `Active 12h ago` for 1:1; `{n} participants` for groups). Optional tiny status pill (Assigned / Unassigned / Resolved) — not a stepper.

**List:** inverted FlatList. Date divider when day changes. Incoming left grey pills; outgoing right primary pills + **ticks only** from `Message.status` (Check / CheckCheck; no Sent/Delivered/Read words). 1:1: no per-bubble name. Group/Offers: small `displayName` above incoming only. Reply chrome: “You replied to {name}” + smaller grey pill **above** (fused), not a quote block inside the bubble. Reactions: one overlapping badge on the bubble corner. Mock fixtures include a few `reactions` and `replyToId`s.

**Swipe right** on a bubble → quick reply (composer “Replying to” bar). **Long-press:** emoji pill on the message (`❤️😆😮😢😡👎`) + bottom Reply. One reaction per user (picking another replaces). Tap a badge emoji to toggle. Optimistic local state only.

**Composer:** one pill `Message…`, `+` attach **dead**, send → append local `Message` with `status: 'sending'` then immediately `'sent'` (mock). Body required non-empty. Reply banner = thin “Replying to {name}” + snippet + X. Send copies `replyToId`. Composer `bg-surface` goes to the screen edge. Android: **no** bottom inset / wrapper pad. iOS: home-indicator pad **inside** the composer. Keyboard: `softwareKeyboardLayoutMode: resize`.

**Header:** Android `headerStatusBarHeight: 0` + `headerStyle.height: 48` (opaque StatusBar already sits above the header — a second status inset is the top chin). iOS keeps default status inset.

**System nav (Android):** `expo-navigation-bar` `<NavigationBar hidden />` + re-hide on AppState active. Swipe from the bottom edge to reveal 3-button / gesture nav. Not our tab bar.

**Stack motion:** root `animation: 'ios_from_right'` (not linear `slide_from_right`). Hub/thread entering uses Reanimated spring, not linear FadeIn duration.

**RBAC:** if `!canViewConversation(DEV_ROLE, currentUserId, conversation)` → Redirect back. Contact current user = `contact-1` (or first person in mock with `role === DEV_ROLE`). Internal notes: **do not render**.

**`id` param:** `const id = Array.isArray(raw) ? raw[0] : raw`.

---

## 8. Mock data additions

- `DEV_USER_ID`: id of the person whose `role === DEV_ROLE` (helper `getDevUser(): Person`).  
- Label `Resolved` + at least one resolved conversation.  
- Conversation `offers`: `kind: 'group'`, `subject: 'Offers'`, all contact ids (+ optionally agents), `unreadCount > 0`.  
- Messages in `offers` (broadcast-style).  
- `OFFERS: Offer[]` (3).  
- `FAQ_ITEMS: { id, question, answer }[]` (≥3).  
- `Person.isOnline`, `Person.lastActiveLabel: string`, `Conversation.unreadCount`.

Current user for Contact hub greeting: `getDevUser().displayName` first token → “Hi Luis”.

---

## 9. Files (kebab-case)

```
app/(contact)/_layout.tsx          # Stack — hub + messages/help/settings (no tab bar)
app/(contact)/index.tsx            # hub
app/(contact)/messages.tsx         # inbox push
app/(contact)/help.tsx             # FAQ push
app/(agent)/index.tsx              # inbox
app/(agent)/unassigned.tsx         # unassigned list
app/(admin)/conversations.tsx      # inbox all
app/chat/[id].tsx                  # thread
components/inbox/conversation-row.tsx
components/inbox/inbox-screen.tsx  # shared list chrome (search, chips, rows)
components/hub/offer-card.tsx
components/hub/offers-carousel.tsx
components/chat/message-bubble.tsx
components/chat/message-actions.tsx
components/chat/composer.tsx
lib/types.ts                       # extend
lib/mock-data.ts                   # extend
lib/inbox-filter.ts                # filterConversations(list, query, chip) + test
lib/message-react.ts               # toggleReaction + quotePreview + replyCaption + test
```

Prefer **one** `InboxScreen` used by Contact messages, Agent chats, Admin conversations (props: `conversations`, `showChips`, `showCompose`, `title`). Contact is a **Stack** (no tab bar). Hub `router.push('/(contact)/messages')`. Do **not** nest `app/(contact)/home/`. Do **not** use root `app/messages.tsx`. Chat stays `app/chat/[id].tsx` (full-screen). Offers carousel is **full-bleed** (cards start at the screen edge, ~78% width peek). Other hub blocks keep `px-4`.

---

## 10. Out of scope (Phase 1)

Auth, sockets, sqlite, TanStack Query, better-auth, real uploads, voice/video, in-thread search, keyboard-controller, FlashList, ad SDK, commerce, stories, case stepper, internal notes UI, Agent accept-from-pool, Admin analytics, theme toggle, new-conversation compose flow.

---

## 11. Three implementation plans (after spec approval)

1. **Hub + offers + help + types/mock extensions** — Contact Home looks like locked mock; FAQ + Offers chat deep link.  
2. **Inbox** — shared `InboxScreen` + row; wire Contact `/messages`, Agent Chats/Unassigned, Admin conversations; filter helper + test.  
3. **Thread** — simple bubbles + composer optimistic send; gate with rbac; Offers chat works.

Do not start Plan 2 until Plan 1 hub is tappable into `/(contact)/messages` (can be a stub route that Plan 2 fills). Plan 1 may `router.push('/(contact)/messages')` to an empty screen titled Messages.

---

## 12. Guardrails

Updated (do not redo in Plan 1): `docs/scope.md` phase list; `.cursor/rules/expo-router.mdc` (Home \| Settings, hidden `messages`/`help` tabs, `/chat/offers`; never gate splash on fonts); `.cursor/rules/project-scope.mdc` (Offers ≠ stories); `AGENTS.md` Now = Phase 1; `.cursor/rules/phase-discipline.mdc` + `source-of-truth.mdc`.

---

## 13. Implementation approach (high level)

Keep Uniwind + RNR. New app components in `components/hub`, `components/inbox`, `components/chat` (now allowed — Phase 0 forbade empty dirs; Phase 1 creates them with real files). Do not rewrite `components/ui/*` class strings; use messenger tokens + existing shadcn aliases. pnpm only. No commits unless asked.
