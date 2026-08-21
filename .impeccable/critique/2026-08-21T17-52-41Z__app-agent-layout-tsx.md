---
target: bottom tab bar (Expo Router)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-21T17-52-41Z
slug: app-agent-layout-tsx
---
# Critique — Bottom tab bar (Expo Router Tabs)

**Target:** `app/(agent)/_layout.tsx` (+ Admin mirror, `lib/tokens.ts` `tabChrome`)
**Mode:** Operate · Clear Desk
**Scores:** 23/40 · P0=0 · P1=2 · P2=2 · P3=1
**n/a heuristics:** (none)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Active tab clear; no unassigned/unread badges on bar |
| 2 | Match System / Real World | 2 | Messages vs Conversations naming split; generic Inbox icon for Unassigned |
| 3 | User Control and Freedom | 3 | Tabs as escape hatch; chat leaves tab shell (intentional) |
| 4 | Consistency and Standards | 2 | title/tabBarLabel diverge; tab type not Manrope |
| 5 | Error Prevention | 3 | Role-separated layouts; low-stakes mis-tap |
| 6 | Recognition Rather Than Recall | 3 | Labeled tabs; queue load still requires opening a tab |
| 7 | Flexibility and Efficiency | 1 | No badges-as-accelerators; no power shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Clear Desk sparse; under-authored, not cluttered |
| 9 | Error Recovery | 3 | Wrong tab = one tap |
| 10 | Help and Documentation | 1 | No cue for Unassigned vs Conversations on first ops day |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

**LLM:** Partially authored for Enki — role-true IA (Agent 3 / Admin 4, Contact tab-less, chat full-screen) with Clear Desk tokens, but stock React Navigation chrome + Lucide set. Swap labels and it could sit under any SaaS messenger.

**Deterministic scan:** CLI `detect.mjs` returned `[]` (exit 0) on the three files — expected weak coverage on TSX/native. Manual scan confirmed `title: "Messages"` vs `tabBarLabel: "Conversations"` on both Agent and Admin; token-backed tints (active 6.26:1, inactive 4.83:1 on white); no explicit tab height/safe-area in `tabChrome`.

**Visual overlays:** Not available — native Expo Router Tabs; no reliable HTML page for detect.js injection. Fallback = CLI + source inspection.

## Overall Impression

IA is the win: role-shaped destinations and intentional absence of tabs on Contact/chat. The bar itself is a tinted default — calm enough for Clear Desk, too quiet for ops status. Biggest opportunity: make the bar close the status loop (naming + badges) without cluttering the desk.

## What's Working

1. **Role-true IA** — Agent/Admin/Contact nav model matches product; chat correctly leaves the tab shell.
2. **Tokenized Clear Desk chrome** — `tabChrome` centralizes surface / line / Enki Blue / muted; One Signal Rule held.
3. **Labeled destinations** — not icon-only; Unassigned as a named primary tab is structurally right.

## Priority Issues

### [P1] Silent ops tabs — no queue/unread badges
- **Why:** Agents/Admins live on status; a quiet Unassigned tab forces Home hops and creates anxiety after leaving a thread.
- **Fix:** Drive `tabBarBadge` from the same mock helpers hubs already use; Enki Blue counts only (document if amber is allowed on chrome).
- **Suggested command:** `$impeccable harden`

### [P1] Messages vs Conversations naming split
- **Why:** Stack `title: "Messages"` + `tabBarLabel: "Conversations"` (+ hub "Messages") teaches two names for one place.
- **Fix:** One ops term end-to-end for Agent/Admin (recommend **Conversations**); align hub tile, stack title, tab label.
- **Suggested command:** `$impeccable clarify`

### [P2] Tab labels skip Manrope
- **Why:** Persistent chrome breaks the type system vs headers (`headerTitleStyle` gets Manrope; tabs do not).
- **Fix:** Add `tabBarLabelStyle` in `tabChrome` with Manrope-Medium/SemiBold + verified Android face mapping.
- **Suggested command:** `$impeccable typeset`

### [P2] Admin four equal-weight tabs bury the queue
- **Why:** Four peer destinations; long labels risk truncation; Unassigned doesn't win the eye for thumb scan.
- **Fix:** Keep four (spec); shorten/verify labels don't truncate; badge hierarchy so Unassigned wins attention.
- **Suggested command:** `$impeccable layout`

### [P3] Generic selected state (tint only)
- **Why:** Feels like Expo starter + blue tint; no Beacon Mist selected wash / icon weight authorship.
- **Fix:** Optional selected icon weight + subtle Beacon Mist item wash — still sparse.
- **Suggested command:** `$impeccable colorize` or `$impeccable bolder`

## Persona Red Flags

**Alex (power Agent):** Silent Unassigned; no efficiency path; context-switch tax Unassigned ↔ Conversations.

**Casey (one-thumb mobile):** Long Admin labels; fourth tab toward edge; no project-owned 48dp authorship; keyboard may fight default bar.

**Morgan (slim Admin oversight):** Four peer tabs without status → oversight = open each tab; Users between Home and pool interrupts Agent-day triage muscle memory.

## Minor Observations

- Contact correctly uses Stack only (product rule held).
- Android `tabBarStyle` lacks `elevation: 0` — Material may add shadow vs hairline-only intent.
- Hub already computes `unassignedCount` — bar lags the hub on the same data.
- Inactive muted contrast meets WCAG AA; soft risk for tiny tab labels (APCA).

## Questions to Consider

1. If Unassigned is the real work base, should Home still be the default landing tab?
2. Conversations vs Messages — glossary fight, or intentional Agent/Admin dialect?
3. Is a badge-less ops nav honest ("status lives in content") or avoidance?
4. For Admin, is Users a peer tab or a Home tool so the bar stays triage-only?

## Cognitive Load

3 checklist failures (hierarchy, working memory via naming, progressive disclosure of queue) → **moderate**. Admin decision count = 4 (at ceiling, not over).
