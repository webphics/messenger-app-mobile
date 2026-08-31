---
name: Enki
description: Light internal support messenger — Clear Desk chrome with Ember accents
colors:
  enki-ember: "#B83E0B"
  ember-mist: "#FEEBDC"
  graphite: "#1A1714"
  ink-soft: "#453F39"
  muted: "#6E6862"
  line: "#EAE6E2"
  bg: "#FFFFFF"
  surface: "#FFFFFF"
  bubble-in: "#FFFFFF"
  on-primary: "#FFFFFF"
  success: "#1F9D6C"
  danger: "#B3261E"
  amber: "#A16207"
typography:
  display:
    fontFamily: "Manrope-ExtraBold, Manrope, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope-ExtraBold, Manrope, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Manrope-SemiBold, Manrope-Medium, Manrope-Bold, Manrope, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Manrope, Manrope-Medium, Manrope-Bold, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Manrope, Manrope-Medium, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Manrope-SemiBold, Manrope-Medium, Manrope-Bold, Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  mono:
    fontFamily: "JetBrains Mono, JetBrains Mono-Bold, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
faces:
  manrope-regular: "Manrope"
  manrope-medium: "Manrope-Medium"
  manrope-semibold: "Manrope-SemiBold"
  manrope-bold: "Manrope-Bold"
  manrope-extrabold: "Manrope-ExtraBold"
  jetbrains-mono: "JetBrains Mono"
  jetbrains-mono-bold: "JetBrains Mono-Bold"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  bubble: "22px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  screen-top-extra: "12px"
components:
  button-primary:
    backgroundColor: "{colors.enki-ember}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.ember-mist}"
    textColor: "{colors.enki-ember}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.graphite}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    height: "48px"
  input-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px"
    height: "48px"
  chip-selected:
    backgroundColor: "{colors.enki-ember}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "8px 14px"
  chip-idle:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "8px 14px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.xl}"
    padding: "16px"
  bubble-outgoing:
    backgroundColor: "{colors.enki-ember}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "10px 12px"
  bubble-incoming:
    backgroundColor: "{colors.bubble-in}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "10px 12px"
---

# Design System: Enki

## Overview

**Creative North Star: "The Clear Desk" (with Support Ember accents)**

Enki is a modern, usable internal support messenger on a calm white plane. The Clear Desk leads: screens stay light, sparse, and scannable so Customers, Agents, and Admins can finish a job without chrome noise. Enki Ember appears when it means action, selection, or “you” (primary buttons, selected chips, outgoing bubbles, avatar initials on Ember Mist). Ember Mist is the soft help wash — selected states and soft chips — not a second brand color fighting Graphite type.

Personality is **friendly and direct**: soft full pills, rounded cards, tactile press, no theatrical gradients. Depth is **hybrid** — hairline `line` borders at rest; soft card shadows for hub/inbox rows; stronger shadow only for overlays (reaction tray, attachment sheet). This phase locks **light chrome only** (`Uniwind.setTheme('light')`); dark tokens exist in CSS for later but must not drive UI now.

**Key Characteristics:**
- White Clear Desk surfaces; Graphite type; Enki Ember as the sparse action/help signal
- Manrope for UI; JetBrains Mono for code-like fragments only
- Soft rounded cards (~24px) and chat bubbles (~22px); pills are fully round
- Hybrid elevation: border-first, soft card lift, stronger shadow only on overlays (composer is border-only at rest)
- Role clarity via uppercase eyebrows (SUPPORT / AGENT / ADMIN), not per-role palettes
- Ops hubs stay quiet: Graphite stats, neutral icon chips; amber for unassigned attention; Ember Mist for secondary CTAs

## Colors

A warm light ops palette: white field, Graphite ink, one Enki Ember accent with Ember Mist wash, plus status greens/ambers/reds.

### Primary
- **Enki Ember** (`#B83E0B`): Primary actions, selected filter chips, outgoing bubbles, unread count badge (alone), focus ring, tab active tint, read receipts when read. Keep rare on any given screen so the Clear Desk stays calm.
- **Ember Mist** (`#FEEBDC`): Soft selected/active wash, avatar fallbacks (including Offers megaphone), secondary buttons, soft chips, admin “Create Offer” row icon. The Support Ember accent — help is present without flooding the desk.

### Secondary
Omit as a second brand accent. Status colors below are functional, not brand.

### Neutral
- **Graphite** (`#1A1714`): Primary text, wordmarks, headers.
- **Ink Soft** (`#453F39`): Secondary body / idle chip text.
- **Muted** (`#6E6862`): Timestamps, hints, inactive tab tint.
- **Line** (`#EAE6E2`): Borders, dividers, outline control strokes.
- **Bg / Surface** (`#FFFFFF`): Screen and card fields (same hex this phase).
- **Bubble In** (`#FFFFFF`): Incoming bubbles on light (paired with `border-line`).
- **On Primary** (`#FFFFFF`): Text/icons on Enki Ember fills.

### Functional
- **Success** (`#1F9D6C`): Online dots, positive pills.
- **Danger** (`#B3261E`): Errors, destructive actions.
- **Amber** (`#A16207`): Warning / attention pills.

### Named Rules
**The One Signal Rule.** Enki Ember occupies a small share of any screen. If ember is everywhere, the Clear Desk failed.

**The Light Chrome Rule.** Ship light appearance only this phase. Do not follow system dark mode for app chrome.

**The No Hex Escape Rule.** Palette colors come from Uniwind tokens (`bg-primary`, `text-ink`, etc.) or `lib/tokens.ts` hex for native headers/tabs/icons — never one-off `bg-[#…]` for palette roles.

## Typography

**Display Font:** Manrope (with system-ui sans fallback)  
**Body Font:** Manrope  
**Label/Mono Font:** JetBrains Mono (code / monospace moments only)

**Character:** Geometric, friendly sans with clear weight steps. On React Native, weight utilities map to loaded faces (`Manrope-Medium`, `Manrope-SemiBold`, `Manrope-Bold`, `Manrope-ExtraBold`) — do not rely on `fontWeight` alone to switch Manrope cuts. JetBrains Mono Bold uses `font-mono-bold` so `font-bold` never clobbers mono with Manrope.

**API:** `Text` variants in `components/ui/text.tsx` — `display` | `headline` | `title` | `body` | `meta` | `label` | `mono`. Color stays on `className`.

### Hierarchy
- **Display** (`variant="display"`, ExtraBold face, `text-2xl` ~24px): Auth and hub brand moments (“Enki”, large greetings), primary metrics.
- **Headline** (`variant="headline"`, ExtraBold, `text-xl` ~20px): Screen titles, offer card titles, settings display name.
- **Title** (`variant="title"`, semibold, `text-base` ~16px): Card/row titles, primary button labels, section headers.
- **Body** (`variant="body"`, regular, `text-base` ~16px): Message text, supporting prose, thread titles. Text inputs also use `text-base` (≥16px iOS floor).
- **Meta** (`variant="meta"`, regular, `text-sm` ~14px): Previews, FAQ answers, empty-state hints, secondary copy.
- **Label** (`variant="label"`, semibold, `text-xs` ~12px; add `uppercase tracking-wider` for eyebrows/chips): Role eyebrows (SUPPORT / AGENT / ADMIN), “Sponsored”, chip labels, section kickers, settings role pill, form labels.
- **Mono** (`variant="mono"`, JetBrains Mono medium, `text-sm` ~14px): Rare code-like UI only (`font-mono-bold` when bold mono is required).

Use the Uniwind scale (`text-xs` / `text-sm` / `text-base` / `text-xl` / `text-2xl`). Do not invent `text-[Npx]` one-offs. Do not use orphan `text-lg` / `text-3xl` — map to headline / display.

### Named Rules
**The Weight Face Rule.** Use `font-medium` / `font-semibold` / `font-bold` / `font-extrabold` utilities so Manrope faces resolve correctly on native. Prefer `Text` role variants over hand-rolled size+weight stacks.

**The Role Eyebrow Rule.** Role labels are uppercase `label` variants in the greeting block (and settings active-role pill via `hubEyebrow`), never competing with the Enki header wordmark.

## Layout

Mobile-first portrait Expo client. Horizontal rhythm is typically `px-4` (16px). Hub/inbox lists stack soft cards with ~12–14px gaps, not hairline separator rows. Headerless screens (hub, search, chat) share `screenTopPad(insets.top)` = safe-area top + 12px. Bottom chrome respects safe-area + the floating tab capsule, shared by Agent, Admin, and Customer. Hide scrollbars. Offers carousel: edge pad 16 both ends, ~78% card width with next-slide peek.

### Named Rules
**The Safe Desk Rule.** Content stays inside safe areas; Android edge-to-edge + inset padding is mandatory — do not invent a second status-bar stack.

## Elevation & Depth

**5-Tier Structured Elevation.** Depth across Enki is defined by a clean, physical lighting hierarchy that balances sunken negative space (divits) with crisp positive lift (cards, buttons, floating bars) without adding new palette colors:

```
Level 3: Overlays & Floating Capsule  [▲ +16px lift, shadow-xl / shadow-2xl + rim border]
Level 2: Interactive Controls & Pills   [▲ +4px lift, shadow-sm / shadow-primary/25]
Level 1: Cards & Popped-Out Surfaces    [▲ +2px lift, shadow-md shadow-black/8 + border-line/70]
-----------------------------------------------------------------------------------------
Level 0: Base Desk Canvas               [— 0px flat, bg-bg / #FFFFFF]
-----------------------------------------------------------------------------------------
Level -1: Divits & Recessed Wells       [▼ -2px sunken, bg-line/35 / #F4F6FA + border-line/80]
```

### Shadow & Depth Vocabulary
- **Level -1 Divit Well** (`border border-line/80 bg-line/35`): Inputs, search bars, chat composer text area, and metric sparkline wells. Feels carved into the desk canvas.
- **Level 1 Card Lift** (`shadow-md shadow-black/8 border border-line/70 bg-surface`): Conversation rows, hub action tiles, FAQ/knowledge cards, metric containers, and incoming chat bubbles.
- **Level 2 Tactile Button** (`shadow-sm shadow-primary/25` / `shadow-xs shadow-black/8`): Primary and secondary buttons; depresses flush into the desk (`scale-[0.98]` + flattened shadow) on tap.
- **Level 3 Floating Capsule & Overlays** (`shadow-xl shadow-black/15 border border-line/80 bg-surface/95` / `shadow-2xl shadow-black/20`): Floating tab bar capsule, reaction tray, attachment sheet, and modals.

### Named Rules
**The Pop-Out & Divit Rule.** Inputs and tracks are recessed divits (Level -1); cards and interactive containers pop out above the desk (Level 1–3). The desk plane (Level 0) serves as the calm negative foundation.


## Shapes

Friendly continuous corners. Buttons default to 12px (`rounded-xl`); small controls 8px; list/auth cards ~24px (`rounded-3xl`); hub cards often `rounded-2xl`/`rounded-3xl`. Chat bubbles ~22px with a tighter corner on the trailing side (`rounded-br-md` / `rounded-bl-md`). Filter chips, pills, and icon buttons go fully round. Logo mark ~12px radius. No sharp zero-radius chrome.

### Named Rules
**The Soft Continuity Rule.** Prefer the shared radius steps; do not mix sharp cards with pill everything on the same surface without reason.

## Components

Friendly and direct: obvious primary, soft secondary, clear press feedback (tactile scale ~0.97).

### Buttons
- **Shape:** 12px radius default (`rounded-xl`); large ~16px; icon buttons fully round (44px).
- **Primary:** Enki Ember fill, white label, height 48px, semibold — main CTAs (auth submit, Join Offers).
- **Secondary:** Ember Mist fill, Enki Ember text.
- **Outline:** Surface + `line` border, Graphite text.
- **Ghost / Link:** No fill; ghost tints Ember Mist on press; link uses Enki Ember.
- **Hover / Focus / Active:** Slightly darker primary on press; web focus ring uses Enki Ember; disabled at 50% opacity.

### Chips
- **Selected:** Enki Ember fill, white semibold label (or Ember Mist + primary text on some hub filters — prefer one pattern per screen).
- **Idle:** Surface or light border, Ink Soft text.
- **Pills:** Ember Mist / success / amber soft washes with matching text; optional status dot.

### Cards / Containers
- **Corner Style:** ~24px for conversation/auth cards; ~16–24px for hub tiles.
- **Background:** Surface on Bg.
- **Shadow Strategy:** Card lift (see Elevation).
- **Border:** `line` hairline.
- **Internal Padding:** typically 16px (`p-4`).

### Inputs / Fields
- **Style:** Bg field, `line` border, ~16px radius on auth/search (`rounded-2xl`), 48px height common; base Input primitive is shorter/md radius — screens often override to match friendly auth chrome.
- **Focus:** Ring / border shift to Enki Ember (web); native relies on system caret + border tokens.
- **Error:** Danger text and border cues; no scary full-bleed red panels.

### Navigation
- **Hub header:** Enki logo + extrabold “Enki” wordmark; settings gear. Agent avatar stack is **Agent/Admin only** — Customer header is brand + settings (Clear Desk). Role eyebrow lives in the greeting, not the header.
- **Tabs (Agent/Admin):** Floating Clear Desk capsule (inset from sides + home indicator), surface fill, `line` hairline, soft lift shadow. Icon-only — no visible text label. Active item = Ember Mist inner pill behind the Enki Ember icon; idle = Muted icon, no pill. Unassigned / Conversations may show Enki Ember count badges. Destination names live in the accessible name (`aria-label`/`accessibilityLabel`) only, not as rendered text — the stack header title (e.g. **Messages**) is independent of that accessible name. Host tab bar chrome is transparent — the capsule is the only visible nav.
- **Stacks:** Flat header (no shadow), Graphite title in Manrope-SemiBold, surface background.
- **Customer:** Same floating capsule as Agent/Admin — tabs Home | Messages | Help.

### Hub ops (Agent / Admin)
- Overview **StatTile** values stay Graphite; unassigned attention uses amber alert dot, not Enki Ember value tint.
- Quick **ActionTile** / secondary **ActionRow** icon chips prefer `neutral` (or amber for unassigned); primaryFilled Enki Ember chips are reserved for rare filled signals, not default hub chrome.
- Admin “Create New Offer” uses Ember Mist (`tone="primary"`), not filled ember.

### Conversation rows
- Soft card lift; Offers avatar = Ember Mist + Enki Ember megaphone (not filled ember).
- Unread: bold Graphite title; timestamp Ink Soft; **one** Enki Ember count badge as the unread signal.

### Composer
- Resting: surface + top `line` border; no resting shadow.
- Reply banner may use Ember Mist wash + Enki Ember accent bar.

### Message bubbles (signature)
- **Outgoing:** Enki Ember fill, white text, ~22px radius, tighter bottom-right.
- **Incoming:** White / bubble-in + `line` border, Graphite text, tighter bottom-left.
- **Receipts:** Tick icons only; read tint Enki Ember.
- **Reactions / reply:** Same-window overlay tray (not Modal-as-cell); honor reduced motion.

### Offers carousel (signature)
- Local image + dark gradient overlay; white “View offer”; primary pill “Join Offers chat”. `"Sponsored"` is a section label only — not stories UI.

### Settings
- Active role pill shows `hubEyebrow` labels (SUPPORT / AGENT / ADMIN), not raw `session.role` strings.

### Motion
**Thesis: settle onto the Clear Desk.** Tokens in `lib/motion.ts`; recipes in `lib/motion-enter.ts`.
- **Focal:** outbound bubble desk spring (scale + opacity; no Y on inverted lists).
- **Continuity:** hub/settings `settleDownEnter`; lists capped `listItemEnter`.
- **Feedback:** press spring; tray/pop for reactions, unread, role check; send button readiness scale.
- **Overlay:** sheets, tab indicator, and swipe snap-back share `motion.springs.overlay`.
- **Presence:** optional breathe on hub live dots only — never inside long FlatLists.
- Transform/opacity only; honor reduced motion at every call site.

## Do's and Don'ts

### Do:
- **Do** keep the Clear Desk: white Bg/Surface, Graphite type, Enki Ember as sparse signal.
- **Do** use Ember Mist for soft selected/avatar/secondary moments.
- **Do** put SUPPORT / AGENT / ADMIN in the greeting block and settings pill; brand the header as Enki only.
- **Do** use hybrid elevation — `line` at rest (including composer), stronger shadow on overlays only.
- **Do** keep Agent/Admin hub stats and tiles quiet (Graphite / neutral / amber attention).
- **Do** honor reduced-motion paths for animated transitions.
- **Do** add new colors to `@theme` **and** both `@variant light` and `@variant dark` when extending tokens.
- **Do** use the type ramp utilities (`text-xs` … `text-2xl`); no arbitrary `text-[Npx]`.

### Don't:
- **Don't** invent palette hex via arbitrary classes when a token exists.
- **Don't** ship Messenger-dark chrome, nsave maroon, or red outgoing bubbles.
- **Don't** build stories, case-status steppers, or Casewire branding.
- **Don't** put role labels in the header wordmark or theme whole hubs per role color.
- **Don't** show the agent avatar stack on the Customer hub.
- **Don't** stack Enki Ember on unread time + badge + Offers avatar in the same row.
- **Don't** put overlay-weight shadow on the resting composer.
- **Don't** enable system dark mode for app chrome this phase.
- **Don't** treat Offers as an ad SDK, checkout, or Instagram stories surface.
