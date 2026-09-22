# Depth, Shadows & Divot Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform JoyChat's visual system from a flat plane into a rich, modern tactile environment with recessed "divit" wells for inputs/containers, crisp ambient + direct shadows for raised cards, resting elevation on buttons, and high-elevation floating navigation/overlays without introducing new brand colors.

**Architecture:** Implement a standardized 5-level depth ramp (Level -1 to Level 3) across design tokens (`DESIGN.md`, `lib/tokens.ts`, `global.css`), apply recessed well styling to inputs, search bars, and the chat composer, upgrade conversation/hub/analytics cards with crisp soft shadows and hairline borders, and enhance floating tab capsule and modal sheets with high elevation.

**Tech Stack:** React Native, Expo, Uniwind (Tailwind CSS v4 for RN), Lucide Icons, Jest.

**Spec:** [docs/superpowers/specs/2026-08-22-depth-and-divot-elevation-design.md](file:///d:/Programming/Personal/Expo-app-mobile-chat-app/docs/superpowers/specs/2026-08-22-depth-and-divot-elevation-design.md)

## Global Constraints

- Never invent palette hexes outside the Clear Desk tokens; all colors remain derived from existing tokens (`bg`, `surface`, `line`, `ink`, `muted`, `primary`, `primary-soft`).
- Maintain full accessibility: contrast ratios, mobile touch targets ≥44px, safe area insets.
- Native React Native shadows must be cross-platform compatible (iOS, Android, Web).

---

### Task 1: Design Tokens & Elevation Utilities

**Files:**
- Modify: `lib/tokens.ts`
- Modify: `global.css`
- Modify: `DESIGN.md`
- Modify: `.impeccable/design.json`

**Interfaces:**
- Produces: `elevation` and shadow styling constants / utilities for Level -1 through Level 3.

- [ ] **Step 1: Update design tokens in `lib/tokens.ts` and `global.css`**
  - Add `shadows` / elevation ramp in `lib/tokens.ts`:
    ```ts
    export const shadows = {
      divit: "border border-line/80 bg-line/35",
      card: "shadow-md shadow-black/8 border border-line/70 bg-surface",
      buttonPrimary: "shadow-sm shadow-primary/25",
      buttonSecondary: "shadow-xs shadow-black/8",
      floating: "shadow-xl shadow-black/15 border border-line/80 bg-surface/95",
      overlay: "shadow-2xl shadow-black/20 border border-line bg-surface",
    } as const;
    ```
- [ ] **Step 2: Update `DESIGN.md` and `.impeccable/design.json`**
  - Document the 5-tier elevation system in `DESIGN.md` (Level -1 to Level 3) replacing purely flat hybrid notes.
- [ ] **Step 3: Commit token updates**
  ```bash
  git add lib/tokens.ts global.css DESIGN.md .impeccable/design.json
  git commit -m "style: define 5-level elevation, shadow and divit design tokens"
  ```

---

### Task 2: Level -1 Recessed "Divit" Wells (Inputs, Search & Composer)

**Files:**
- Modify: `components/ui/input.tsx`
- Modify: `components/search-field-with-clear.tsx`
- Modify: `components/hub/help-search-field.tsx`
- Modify: `components/chat/composer.tsx`

**Interfaces:**
- Consumes: `bg-line/35 border-line/80` sunken styling tokens.
- Produces: Tactile inset input containers across auth, hub search, knowledge search, and chat.

- [ ] **Step 1: Update `components/ui/input.tsx`**
  - Change default input background from flat white to recessed well:
    ```tsx
    className={cn(
      "h-12 w-full rounded-2xl border border-line/80 bg-line/35 px-4 text-base font-normal text-ink",
      "placeholder:text-muted focus:border-primary",
      className,
    )}
    ```
- [ ] **Step 2: Update `components/search-field-with-clear.tsx` and `components/hub/help-search-field.tsx`**
  - Apply sunken divit well styling `border border-line/80 bg-line/35 rounded-2xl` to search containers.
- [ ] **Step 3: Update `components/chat/composer.tsx`**
  - Change composer input container to a carved well with `border border-line/80 bg-line/35 rounded-2xl px-3.5 py-2` while preserving outer resting border.
- [ ] **Step 4: Commit recessed well updates**
  ```bash
  git add components/ui/input.tsx components/search-field-with-clear.tsx components/hub/help-search-field.tsx components/chat/composer.tsx
  git commit -m "style: implement recessed divit styling on inputs, search bars, and composer"
  ```

---

### Task 3: Level 1 Pop-Out Cards & Incoming Message Bubbles

**Files:**
- Modify: `components/inbox/conversation-row.tsx`
- Modify: `components/hub/action-tile.tsx`
- Modify: `components/hub/action-row.tsx`
- Modify: `components/hub/recent-thread-card.tsx`
- Modify: `components/hub/faq-row.tsx`
- Modify: `components/hub/knowledge-row.tsx`
- Modify: `components/hub/user-row.tsx`
- Modify: `components/hub/chart-card.tsx`
- Modify: `components/chat/message-bubble.tsx`

**Interfaces:**
- Consumes: Level 1 card elevation classes `shadow-md shadow-black/8 border border-line/70 bg-surface`.
- Produces: Palpable card lift and separation across inbox, hub, admin, and chat.

- [ ] **Step 1: Update `components/inbox/conversation-row.tsx`**
  - Ensure card styling uses crisp `rounded-3xl border border-line/70 bg-surface p-4 shadow-md shadow-black/8`.
- [ ] **Step 2: Update Hub action cards & tiles (`action-tile.tsx`, `action-row.tsx`, `recent-thread-card.tsx`)**
  - Add soft lift `shadow-md shadow-black/8 border border-line/70 bg-surface` to Hub interactive cards.
- [ ] **Step 3: Update Knowledge/FAQ/User rows & Metric cards (`faq-row.tsx`, `knowledge-row.tsx`, `user-row.tsx`, `chart-card.tsx`)**
  - Apply crisp card lift `shadow-md shadow-black/8 border-line/70` and subtle inner metric wells.
- [ ] **Step 4: Update Incoming Message Bubbles in `components/chat/message-bubble.tsx`**
  - Give incoming bubbles soft lift `shadow-xs shadow-black/5 border border-line/70 bg-bubble-in` to pop off the chat desk.
- [ ] **Step 5: Commit Level 1 card changes**
  ```bash
  git add components/inbox/conversation-row.tsx components/hub/ components/chat/message-bubble.tsx
  git commit -m "style: add Level 1 pop-out card elevation and incoming bubble lift"
  ```

---

### Task 4: Level 2 Tactile Buttons & Interactive Controls

**Files:**
- Modify: `components/ui/button.tsx`
- Modify: `components/hub/pill.tsx`

**Interfaces:**
- Consumes: Button elevation tokens and tactile press states.
- Produces: Physical tactile button depth that visually depresses on press.

- [ ] **Step 1: Update `components/ui/button.tsx`**
  - Add resting shadow to primary button: `shadow-sm shadow-primary/25 active:shadow-none active:scale-[0.98]`.
  - Add resting shadow to secondary/outline buttons: `shadow-xs shadow-black/8 active:shadow-none active:scale-[0.98]`.
- [ ] **Step 2: Update `components/hub/pill.tsx`**
  - Add subtle crisp shadow to active selected pills.
- [ ] **Step 3: Commit Level 2 button changes**
  ```bash
  git add components/ui/button.tsx components/hub/pill.tsx
  git commit -m "style: add tactile resting elevation and depression states to buttons"
  ```

---

### Task 5: Level 3 Floating Navigation & Overlays

**Files:**
- Modify: `components/nav/floating-tab-bar.tsx`
- Modify: `components/chat/message-actions.tsx`
- Modify: `components/chat/attachment-sheet.tsx`
- Modify: `components/inbox/new-chat-modal.tsx`

**Interfaces:**
- Consumes: Level 3 floating shadow tokens `shadow-xl shadow-black/15` / `shadow-2xl shadow-black/20`.
- Produces: High-elevation floating chrome and modal overlay surfaces.

- [ ] **Step 1: Update `components/nav/floating-tab-bar.tsx`**
  - Elevate floating capsule with `shadow-xl shadow-black/15 border border-line/80 bg-surface/95`.
- [ ] **Step 2: Update `components/chat/message-actions.tsx` & `attachment-sheet.tsx` & `new-chat-modal.tsx`**
  - Ensure overlays and sheets utilize `shadow-2xl shadow-black/20 border border-line`.
- [ ] **Step 3: Commit Level 3 floating changes**
  ```bash
  git add components/nav/floating-tab-bar.tsx components/chat/message-actions.tsx components/chat/attachment-sheet.tsx components/inbox/new-chat-modal.tsx
  git commit -m "style: elevate floating tab bar capsule and overlay sheets"
  ```

---

### Task 6: Test Suite Alignment & Verification

**Files:**
- Modify: `lib/keyboard-inset.test.ts`

- [ ] **Step 1: Fix `lib/keyboard-inset.test.ts` to test current `keyboard-inset.ts` exports**
  - Update `keyboard-inset.test.ts` to test `residualKeyboardOverlap` and `keyboardOverlap` correctly.
- [ ] **Step 2: Run complete test suite**
  ```bash
  pnpm test
  ```
  Expected: PASS on all test suites (28/28 passing).
- [ ] **Step 3: Commit test alignment**
  ```bash
  git add lib/keyboard-inset.test.ts
  git commit -m "test: align keyboard inset test suite with current helper signatures"
  ```
