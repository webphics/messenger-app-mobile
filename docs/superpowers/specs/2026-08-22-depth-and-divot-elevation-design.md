# System-Wide Depth, Elevation & Divot Design Spec

**Date:** 2026-08-22  
**Status:** Approved  
**Topic:** Visual Depth, Shadows & Recessed "Diviting" Hierarchy across JoyChat Mobile  

---

## 1. Overview & Goals

The JoyChat mobile support client currently presents a clean but predominantly flat plane where cards, inputs, and screens blend into a uniform white field. 

This design introduces a cohesive, modern physical depth model with:
1. **Recessed "Divit" Wells (Level -1)**: Tactile sunken containers for inputs, search bars, chat composer input field, and metric containers that feel physically carved into the desk canvas.
2. **Elevated Pop-Out Cards & Surfaces (Level 1)**: Crisp ambient + key shadows with hairline perimeter borders for conversation rows, hub tiles, and incoming chat bubbles.
3. **Tactile Buttons & Controls (Level 2)**: Floating resting shadow with physical depression (`scale-98` + shadow collapse) on press.
4. **Floating Chrome & Overlays (Level 3)**: Floating tab capsule, bottom sheets, and reaction trays with prominent elevation.

All depth is achieved through lighting, elevation tokens, and contrast ratios **without introducing any new brand colors**, strictly honoring the Clear Desk philosophy and existing palette tokens.

---

## 2. The 5-Level Elevation Hierarchy

```
Level 3: Overlays & Floating Capsule  [▲ +16px lift, shadow-xl shadow-black/15 + border-line/80]
Level 2: Interactive Controls & Pills   [▲ +4px lift, shadow-sm shadow-primary/25 or shadow-black/10]
Level 1: Cards & Popped-Out Surfaces    [▲ +2px lift, shadow-md shadow-black/8 + border-line/70]
-----------------------------------------------------------------------------------------
Level 0: Base Desk Canvas               [— 0px flat, bg-bg / #FFFFFF]
-----------------------------------------------------------------------------------------
Level -1: Divits & Recessed Wells       [▼ -2px sunken, bg-line/35 (or #F4F6FA) + border-line]
```

### Depth Token System
- **Level -1 (Divit / Recessed)**:
  - Background: `bg-line/35` (`#F4F6FA` in light mode, `#13151D` in dark mode)
  - Border: `border border-line/80`
  - Inner visual cue: Sunken feel giving negative depth against the Level 0 canvas.
- **Level 0 (Desk Canvas)**:
  - Background: `bg-bg` (`#FFFFFF` in light mode, `#0F1117` in dark mode).
- **Level 1 (Card Pop-Out)**:
  - Background: `bg-surface` (`#FFFFFF`).
  - Shadow: `shadow-md shadow-black/8` (iOS / Web) / elevation 3 (Android).
  - Border: Hairline rim `border border-line/70`.
- **Level 2 (Tactile Buttons)**:
  - Primary button resting: `shadow-sm shadow-primary/25`.
  - Secondary/Outline button resting: `shadow-xs shadow-black/8`.
  - Active/Press: Flattened shadow + `scale-[0.98]` tactile depression.
- **Level 3 (Floating Capsule & Overlays)**:
  - Floating Tab Bar Capsule: `shadow-xl shadow-black/15 border border-line/80 bg-surface/95`.
  - Reaction Trays / Modals / Action Sheets: `shadow-2xl shadow-black/20 border border-line`.

---

## 3. Component Touchpoints

### 3.1 Level -1 (Divits & Recessed Wells)
1. **`components/ui/input.tsx` & Form Inputs**:
   - Change input field background from flat surface to recessed well `bg-line/35 border-line/80`.
   - On focus: shifts to crisp `border-primary` ring.
2. **`components/search-field-with-clear.tsx` & `components/hub/help-search-field.tsx`**:
   - Search containers styled with recessed `bg-line/35 border-line/80` well styling with rounded-2xl geometry.
3. **`components/chat/composer.tsx`**:
   - The text input area inside the bottom bar becomes a sunken well (`bg-line/35 border-line/80 rounded-2xl px-3.5 py-2`), giving clear tactile affordance for typing.
4. **`components/hub/chart-card.tsx` & `components/hub/sparkline.tsx`**:
   - Mini metric/sparkline wells use subtle recessed divits inside the card surface.

### 3.2 Level 1 (Pop-Out Cards & Surfaces)
1. **`components/inbox/conversation-row.tsx`**:
   - Elevation upgraded to crisp `shadow-md shadow-black/8 border border-line/70 bg-surface`.
2. **`components/hub/action-tile.tsx` & `components/hub/action-row.tsx`**:
   - Enhanced from flat border to tactile card lift (`shadow-md shadow-black/8 border-line/70`).
3. **`components/hub/recent-thread-card.tsx` & `components/hub/faq-row.tsx` & `components/hub/knowledge-row.tsx` & `components/hub/user-row.tsx`**:
   - Cards pop out with consistent `shadow-md shadow-black/8 border-line/70`.
4. **`components/chat/message-bubble.tsx` (Incoming Bubbles)**:
   - Incoming messages on the desk get subtle soft lift (`shadow-xs shadow-black/5 border border-line/70 bg-bubble-in`).

### 3.3 Level 2 (Tactile Controls & Buttons)
1. **`components/ui/button.tsx`**:
   - Primary buttons: `shadow-sm shadow-primary/25` resting.
   - Secondary / Outline buttons: `shadow-xs shadow-black/8` resting.
   - Press effect: `active:shadow-none active:scale-[0.98]`.
2. **`components/hub/pill.tsx`**:
   - Active filter pills gain subtle crisp lift.

### 3.4 Level 3 (Floating Capsule & Overlays)
1. **`components/nav/floating-tab-bar.tsx`**:
   - Upgrade floating capsule shadow to `shadow-xl shadow-black/15 border border-line/80`.
2. **`components/chat/message-actions.tsx` (Reaction Tray)** & **`components/chat/attachment-sheet.tsx`**:
   - High elevation overlay shadow `shadow-2xl shadow-black/20 border-line`.

---

## 4. Design System Token Updates
- Update `DESIGN.md` (Elevation & Depth section, Component shadow vocabulary).
- Update `.impeccable/design.json`.
- Update `global.css` utilities and `@theme` definitions if needed.
- Update `lib/tokens.ts` for native header/tab/elevation constants.

---

## 5. Verification Plan
- **Automated Tests**: Run `pnpm test` (Jest test suite) to ensure all tests continue passing.
- **Visual & Layout Check**: Ensure all modified components adhere to React Native styling, safe-area insets, and dark-mode fallback definitions.
