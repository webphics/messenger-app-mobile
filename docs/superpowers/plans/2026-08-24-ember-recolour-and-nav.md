# Ember Recolour, Android System Bars, Contact Nav & Icon-Only Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SUB-SKILL (UI tasks):** Before editing any UI file in Tasks 2, 4, 6, or 7, load `reference/craft-floor.md` from the `impeccable` skill.

**Goal:** Replace Enki Blue with an ember palette derived from the logo, stop Android 15+ painting black strips behind the system bars, give the Contact role the floating tab capsule, and strip text labels from that capsule across all three roles.

**Architecture:** Colour lives in two hand-synced places (`global.css` `@theme` for Tailwind/uniwind classes, `lib/tokens.ts` for native header/tab props that cannot take a `className`). Task 1 adds a test that pins those two together so the swap in Task 2 cannot half-land. The system-bar fix paints `window.decorView` — the surface exposed by the existing native inset padding — rather than the `statusBarColor`/`navigationBarColor` setters, which are no-ops on API 35+. Contact converts from a flat `Stack` to `Tabs` + a nested `(home)` `Stack`, mirroring the existing `(agent)` structure exactly, so no route URL changes.

**Tech Stack:** Expo SDK 57, expo-router (typed routes), React Native 0.86, uniwind + Tailwind v4, react-native-reanimated 4, lucide-react-native, jest-expo.

**Spec:** This document, § *Agreed design* below — captured from the grilling session of 2026-08-24. `docs/adr/ADR-0002` (written in Task 8) is the durable record of the navigation half.

---

## Agreed design

| Decision | Value |
|---|---|
| Primary | `#B83E0B` (Enki Ember) — 5.63:1 on white, 4.86:1 on ember-mist |
| Primary soft | `#FEEBDC` (Ember Mist), replacing Beacon Mist `#E8EDFB` |
| Danger | `#B3261E`, was `#D64545` |
| Amber | `#A16207`, was `#E2831C` |
| Success | `#1F9D6C` — **unchanged** |
| Neutrals | warmed: `line #E4E6EC → #EAE6E2`, `muted #6B7280 → #6E6862`, `ink #14161F → #1A1714` |
| System bars | `window.decorView` painted `#FFFFFF` from the prebuild plugin **and** from JS |
| Native inset padding | **left alone** this pass — deliberately out of scope |
| Contact nav | `Tabs` + nested `(home)` stack; tabs = Home / Messages / Help |
| Tab labels | removed for all three roles; icons 22→24; row height 44→48dp |
| Logo | **not touched** — `assets/images/logo.png` is already the ember mark at HEAD |

## Global Constraints

- **Every colour must be changed in BOTH `global.css` and `lib/tokens.ts`.** They are hand-duplicated; `lib/tokens.test.ts` (Task 1) enforces it.
- **`global.css` carries the palette three times**: the `@theme` block, the `@variant light` block, and the `@variant dark` block. All three get updated. Dark is currently dead code (`app/_layout.tsx` hard-locks `Uniwind.setTheme("light")`) but must not be left blue.
- **Never import from `lucide-react-native` root.** Add icons to `components/icons.ts` only, using a `lucide-react-native/icons/<kebab-name>` subpath. The root barrel pulls ~1750 modules into the bundle.
- **Do not install any package.** `expo-system-ui@~57.0.2` is already a dependency. Phase discipline (PRODUCT.md) forbids later-phase packages.
- **Import alias is `@/*` → repo root.** Tests use it (`lib/motion.test.ts:1`).
- **Touch targets ≥ 48dp** on Android (Material 3), ≥ 44px per `AGENTS.md`.
- **Reduced motion is a product requirement** (ADR-0001 §4). Do not add motion without a reduced path.
- **Do not animate layout props.** `AGENTS.md`: `transform`/`opacity` only.
- **Do not touch `applySystemBarInsets`** in `plugins/with-system-bar-insets.js`. Only `applyLightSystemBars` changes.
- **Run `pnpm test` after every task that touches `lib/`.**

---

### Task 1: Contrast helper and the token-parity test

Pins `global.css` and `lib/tokens.ts` together before we edit either, and encodes the contrast floor that drove the palette choice. Written against the **current blue** values so it goes green on today's code, then re-pointed in Task 2.

**Files:**
- Create: `lib/contrast.ts`
- Create: `lib/contrast.test.ts`
- Create: `lib/tokens.test.ts`

**Interfaces:**
- Consumes: `colors` from `lib/tokens.ts` (existing).
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number` — both take 6-digit `#RRGGBB` strings and throw on anything else. Task 2 relies on `lib/tokens.test.ts` failing loudly if a colour is changed in one file but not the other.

- [ ] **Step 1: Write the failing contrast tests**

Create `lib/contrast.test.ts`:

```ts
import { contrastRatio, relativeLuminance } from "@/lib/contrast";

describe("relativeLuminance", () => {
  test("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  test("is case-insensitive", () => {
    expect(relativeLuminance("#b83e0b")).toBeCloseTo(
      relativeLuminance("#B83E0B"),
      10,
    );
  });

  test("rejects shorthand and malformed hex", () => {
    expect(() => relativeLuminance("#FFF")).toThrow();
    expect(() => relativeLuminance("rebeccapurple")).toThrow();
  });
});

describe("contrastRatio", () => {
  test("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  test("is 1 for a colour against itself", () => {
    expect(contrastRatio("#B83E0B", "#B83E0B")).toBeCloseTo(1, 10);
  });

  test("is order-independent", () => {
    expect(contrastRatio("#B83E0B", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#B83E0B"),
      10,
    );
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm exec jest lib/contrast.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '@/lib/contrast'`.

- [ ] **Step 3: Implement the helper**

Create `lib/contrast.ts`:

```ts
/**
 * WCAG 2.1 relative luminance and contrast ratio for the sRGB hex strings in
 * `lib/tokens.ts`. Used by the token tests to keep the palette legible — see
 * the contrast floors asserted in `lib/tokens.test.ts`.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function channel(v: number): number {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) {
    throw new Error(`relativeLuminance: expected #RRGGBB, got "${hex}"`);
  }
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(parseInt(hex.slice(i, i + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm exec jest lib/contrast.test.ts --watchAll=false`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing token-parity test**

Create `lib/tokens.test.ts`. Note the CSS-side names differ from the TS-side camelCase keys, hence the explicit map.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio } from "@/lib/contrast";
import { colors } from "@/lib/tokens";

/** `lib/tokens.ts` key -> `global.css` custom-property suffix. */
const CSS_NAME: Record<keyof typeof colors, string> = {
  bg: "bg",
  surface: "surface",
  ink: "ink",
  inkSoft: "ink-soft",
  muted: "muted",
  line: "line",
  primary: "primary",
  primaryForeground: "primary-foreground",
  success: "success",
  danger: "danger",
  amber: "amber",
};

function readThemeBlock(): Map<string, string> {
  const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");
  const start = css.indexOf("@theme {");
  if (start < 0) throw new Error("global.css: no @theme block found");
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);

  const out = new Map<string, string>();
  for (const [, name, value] of block.matchAll(
    /--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g,
  )) {
    out.set(name, value.toUpperCase());
  }
  return out;
}

describe("colour tokens", () => {
  const theme = readThemeBlock();

  test.each(Object.keys(CSS_NAME) as (keyof typeof colors)[])(
    "%s matches global.css",
    (key) => {
      const cssValue = theme.get(CSS_NAME[key]);
      expect(cssValue).toBeDefined();
      expect(colors[key].toUpperCase()).toBe(cssValue);
    },
  );
});

describe("colour contrast floors", () => {
  test("primary carries white text at AA (4.5:1)", () => {
    expect(
      contrastRatio(colors.primary, colors.primaryForeground),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("primary reads as text on the app background at AA", () => {
    expect(contrastRatio(colors.primary, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("body ink clears AAA on the app background", () => {
    expect(contrastRatio(colors.ink, colors.bg)).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 6: Run it to verify it passes**

Run: `pnpm exec jest lib/tokens.test.ts --watchAll=false`
Expected: PASS. The parity cases match (blue is currently in sync) and the three contrast floors clear against today's palette. The `danger` floor is deliberately NOT asserted here — today's `#D64545` is only 4.38:1 on white, so the assertion would commit a red suite. Task 2 adds it in the same commit that makes it pass.

- [ ] **Step 7: Commit**

```bash
git add lib/contrast.ts lib/contrast.test.ts lib/tokens.test.ts
git commit -m "test: pin colour tokens across global.css and lib/tokens.ts

Adds a WCAG contrast helper and a parity test so the two hand-duplicated
palettes cannot drift, plus contrast floors for primary and ink."
```

---

### Task 2: Swap in the ember palette

**Files:**
- Modify: `global.css` — `@theme` block, `@variant light` block, `@variant dark` block
- Modify: `lib/tokens.ts:19-30` (the `colors` object)

**Interfaces:**
- Consumes: `lib/tokens.test.ts` from Task 1.
- Produces: `colors.primary === "#B83E0B"`, `colors.line === "#EAE6E2"`, `colors.muted === "#6E6862"`, `colors.ink === "#1A1714"`, `colors.danger === "#B3261E"`, `colors.amber === "#A16207"`. Tasks 3 and 7 reference these.

- [ ] **Step 1: Load the craft floor**

Load `reference/craft-floor.md` from the `impeccable` skill before editing.

- [ ] **Step 2: Update the `@theme` block in `global.css`**

Replace the colour lines inside `@theme { ... }` with:

```css
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-ink: #1a1714;
  --color-ink-soft: #453f39;
  --color-muted: #6e6862;
  --color-line: #eae6e2;
  --color-primary: #b83e0b;
  --color-primary-soft: #feebdc;
  --color-bubble-in: #ffffff;
  --color-success: #1f9d6c;
  --color-danger: #b3261e;
  --color-amber: #a16207;

  /* RNR/shadcn aliases → messenger hexes (do not rename tokens above) */
  --color-background: #ffffff;
  --color-foreground: #1a1714;
  --color-muted-foreground: #6e6862;
  --color-destructive: #b3261e;
  --color-primary-foreground: #ffffff;
  --color-secondary: #eae6e2;
  --color-secondary-foreground: #1a1714;
  --color-accent: #eae6e2;
  --color-accent-foreground: #1a1714;
  --color-border: #eae6e2;
  --color-input: #eae6e2;
  --color-ring: #b83e0b;
```

- [ ] **Step 3: Update the `@variant light` block**

Inside `@layer theme { :root { @variant light { ... } } }`, replace its colour lines with the **exact same 24 lines** from Step 2. This block is a duplicate of `@theme` by design; keep them identical.

- [ ] **Step 4: Update the `@variant dark` block**

Replace the colour lines inside `@variant dark { ... }` with warm equivalents:

```css
      --color-bg: #17130f;
      --color-surface: #241d18;
      --color-ink: #f8f5f2;
      --color-ink-soft: #d4ccc4;
      --color-muted: #9c928a;
      --color-line: #3a3129;
      --color-primary: #f0813f;
      --color-primary-soft: #4a2413;
      --color-bubble-in: #3a3129;
      --color-success: #3cbb88;
      --color-danger: #e8695f;
      --color-amber: #e0a53c;

      --color-background: #241d18;
      --color-foreground: #f8f5f2;
      --color-muted-foreground: #9c928a;
      --color-destructive: #e8695f;
      --color-primary-foreground: #17130f;
      --color-secondary: #3a3129;
      --color-secondary-foreground: #f8f5f2;
      --color-accent: #3a3129;
      --color-accent-foreground: #f8f5f2;
      --color-border: #3a3129;
      --color-input: #3a3129;
      --color-ring: #f0813f;
```

Note `--color-primary-foreground` flips to the dark background here: white text on `#F0813F` is only 2.6:1, dark text is 7.4:1. Dark mode is not shipped, but leave it correct.

- [ ] **Step 5: Update `lib/tokens.ts`**

Replace the `colors` object (currently `lib/tokens.ts:19-30`) with:

```ts
/** Hex copies of `global.css` @theme. Native headers/tabs cannot use className. */
export const colors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  ink: "#1A1714",
  inkSoft: "#453F39",
  muted: "#6E6862",
  line: "#EAE6E2",
  primary: "#B83E0B",
  primaryForeground: "#FFFFFF",
  success: "#1F9D6C",
  danger: "#B3261E",
  amber: "#A16207",
} as const;
```

- [ ] **Step 6: Add the danger contrast floor**

`#B3261E` is 6.54:1 on white where `#D64545` was 4.38:1, so this assertion can
now be added green. Append it to the `colour contrast floors` describe block in
`lib/tokens.test.ts`:

```ts
  test("danger reads as text on the app background at AA", () => {
    expect(contrastRatio(colors.danger, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });
```

- [ ] **Step 7: Run the tests — all green**

Run: `pnpm test`
Expected: PASS, including the new danger floor and every parity case.

- [ ] **Step 8: Commit**

```bash
git add global.css lib/tokens.ts lib/tokens.test.ts
git commit -m "feat(theme): replace Enki Blue with Enki Ember

primary #3452D9 -> #B83E0B (5.63:1 on white, 4.86:1 on ember-mist, matching
the old blue's contrast profile). primary-soft, danger, amber retuned; grey
neutrals warmed off their blue tint. Dark tokens updated but still unshipped."
```

---

### Task 3: Update the design-system records

`DESIGN.md` is the human-readable source of visual truth and `.impeccable/design.json` is its generated sidecar; both still name `enki-blue`. Leaving them is worse than not having them.

**Files:**
- Modify: `DESIGN.md` (front-matter `colors:`, plus every `{colors.enki-blue}` / `{colors.beacon-mist}` reference in `components:`)
- Modify: `.impeccable/design.json` (`extensions.colorMeta`)

- [ ] **Step 1: Rewrite the `colors:` map in `DESIGN.md` front-matter**

```yaml
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
```

Also update the `description:` line from `Clear Desk chrome with Beacon accents` to `Clear Desk chrome with Ember accents`.

- [ ] **Step 2: Re-point every token reference in `DESIGN.md`**

Run these two replacements across the whole file:

```bash
sed -i 's/{colors\.enki-blue}/{colors.enki-ember}/g; s/{colors\.beacon-mist}/{colors.ember-mist}/g' DESIGN.md
grep -n "enki-blue\|beacon-mist" DESIGN.md
```

Expected: the `grep` prints nothing.

- [ ] **Step 3: Update the `colorMeta` sidecar**

In `.impeccable/design.json`, rename the `enki-blue` key to `enki-ember` and `beacon-mist` to `ember-mist`, and replace their `displayName`, `canonical`, and `tonalRamp`:

```json
"enki-ember": {
  "role": "primary",
  "displayName": "Enki Ember",
  "canonical": "#B83E0B",
  "tonalRamp": [
    "#3A1303", "#571C05", "#7A2807", "#99330B",
    "#B83E0B", "#DC5A22", "#F09163", "#FEEBDC"
  ]
},
"ember-mist": {
  "role": "primary",
  "displayName": "Ember Mist",
  "canonical": "#FEEBDC",
  "tonalRamp": [
    "#4A2413", "#6B3A22", "#9A5C3C", "#C4886A",
    "#F0B894", "#FBD8BC", "#FEEBDC", "#FFF7F1"
  ]
}
```

Then update `graphite`, `muted`, `line`, `danger`, and `amber` canonicals in the same block to the Task 2 values. Leave `generatedAt` and `schemaVersion` alone.

- [ ] **Step 4: Verify the JSON still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('.impeccable/design.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md .impeccable/design.json
git commit -m "docs(design): rename Enki Blue to Enki Ember across the design system"
```

---

### Task 4: Recolour the offer artwork

The three carousel cards are deep-blue lightning renders — the loudest remaining blue on the hub. This is an inspect-and-judge task, not a blind filter run.

**Files:**
- Modify: `assets/offers/payouts.png`, `assets/offers/verify.png`, `assets/offers/zero-fee.png`

`ffmpeg` is the available converter on this machine. Originals are recoverable from git, so no backups are needed.

- [ ] **Step 1: Rotate hue on all three into a scratch dir**

```bash
mkdir -p .tmp-offers
for f in payouts verify zero-fee; do
  ffmpeg -y -loglevel error -i "assets/offers/$f.png" \
    -vf "hue=h=200:s=1.05" ".tmp-offers/$f.png"
done
ls -la .tmp-offers
```

`h=200` moves the ~215° blues to ~55°/warm; `s=1.05` compensates for the slight desaturation rotation causes.

- [ ] **Step 2: Look at all three before accepting them**

Read each of `.tmp-offers/payouts.png`, `.tmp-offers/verify.png`, `.tmp-offers/zero-fee.png` with the Read tool and judge honestly against two questions:
1. Does the dominant field read as ember/orange, in the same family as `#B83E0B`?
2. Did any secondary element go somewhere ugly? `payouts.png` contains **gold coins** which a 200° rotation will push toward blue-cyan. A few cool accents on a warm field is acceptable; coins that read as alien blue blobs are not.

If the result is good, continue to Step 3. If any image fails, try `hue=h=170:s=1.05` and `hue=h=225:s=1.05` and re-inspect. **If none of the three rotations produce something you would ship, stop, delete `.tmp-offers`, leave the originals in place, and report to the user that these need real artwork rather than a filter.** Shipping ugly promo art is worse than shipping blue promo art.

- [ ] **Step 3: Move the accepted images into place**

```bash
mv .tmp-offers/payouts.png .tmp-offers/verify.png .tmp-offers/zero-fee.png assets/offers/
rmdir .tmp-offers
git status --short assets/offers
```

- [ ] **Step 4: Commit**

```bash
git add assets/offers
git commit -m "feat(offers): recolour promo artwork from blue to ember"
```

---

### Task 5: Stop Android painting black behind the system bars

**Root cause, verified:** `android/app/src/main/res/values/styles.xml` gives `AppTheme` the parent `Theme.AppCompat.DayNight.NoActionBar` and sets **no `android:windowBackground`**, so the window background resolves to black whenever the phone's system theme is dark. `applySystemBarInsets()` pads `android.R.id.content`, and the padded strips at top and bottom expose exactly that window background. `applyLightSystemBars()` was meant to cover them via `window.statusBarColor` / `navigationBarColor`, but **both setters have been no-ops since API 35** and this app targets SDK 36.

The fix paints `window.decorView` instead. Confirmed viable by reading `node_modules/expo-system-ui/android/src/main/java/expo/modules/systemui/SystemUIModule.kt`, whose `setBackgroundColor` does `activity.window?.decorView?.setBackgroundColor(colorInt)` — it never touches the dead setters.

Two layers, deliberately: the plugin covers frame zero before JS boots; the JS call covers the dev client (where the prebuild plugin has not run) and re-asserts after any night-mode change.

**Files:**
- Modify: `plugins/with-system-bar-insets.js` (the `METHODS` template string and the header comment)
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `colors.bg` from `lib/tokens.ts` (Task 2).
- Produces: nothing importable. Behavioural change only.

- [ ] **Step 1: Replace the dead setters in the plugin**

In `plugins/with-system-bar-insets.js`, inside the `METHODS` template literal, replace the whole `applyLightSystemBars` function with:

```js
  /**
   * `window.statusBarColor` / `navigationBarColor` are NO-OPS on API 35+, and
   * AppTheme's DayNight parent resolves `windowBackground` to BLACK when the
   * phone's system theme is dark. `applySystemBarInsets` pads the content view,
   * so those strips expose the window background — hence black bars on
   * dark-mode devices only. Paint the decor view instead; it is the surface the
   * strips actually show. Mirrored in app/_layout.tsx for the dev client.
   * DO NOT reinstate the statusBarColor setters; they silently do nothing.
   */
  private fun applyLightSystemBars() {
    val bg = Color.parseColor("#FFFFFF")
    window.decorView.setBackgroundColor(bg)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
  }
```

`isAppearanceLight*Bars` still works on API 35+ — it controls icon tint, not bar fill. Keep it. Do not touch `applySystemBarInsets`.

- [ ] **Step 2: Update the plugin's file header**

In the same file, replace the numbered item 1 in the top doc comment:

```js
 * 1. `applyLightSystemBars` — paint `window.decorView` white so the strips left
 *    by the inset padding below match the hub background. AppTheme's DayNight
 *    parent would otherwise resolve them to black on dark-mode phones.
```

- [ ] **Step 3: Add the JS layer in `app/_layout.tsx`**

Add the import alongside the other expo imports:

```ts
import * as SystemUI from "expo-system-ui";
```

Then, immediately below the existing `Appearance.setColorScheme("light");` line at module scope, add:

```ts
// The decor view is what shows through the strips MainActivity pads for the
// system bars; AppTheme's DayNight parent paints it black on dark-mode phones.
// The prebuild plugin does this natively for frame zero — this covers the dev
// client, where that plugin has not run.
void SystemUI.setBackgroundColorAsync(colors.bg);
```

`colors` is already imported at `app/_layout.tsx` (`import { colors } from "@/lib/tokens";`). Module scope, not an effect: it must land before first paint.

- [ ] **Step 4: Verify the plugin is still valid JS and still idempotent**

```bash
node -e "const p=require('./plugins/with-system-bar-insets.js'); console.log(typeof p === 'function' ? 'ok' : 'BAD')"
grep -c "statusBarColor" plugins/with-system-bar-insets.js
```

Expected: `ok`, and the `grep -c` prints `1` — the single mention inside the new warning comment, with no assignment left.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/with-system-bar-insets.js app/_layout.tsx
git commit -m "fix(android): paint decor view white so system-bar strips stop rendering black

statusBarColor/navigationBarColor have been no-ops since API 35 and this app
targets SDK 36, so applyLightSystemBars silently did nothing. AppTheme's
DayNight parent then resolved windowBackground to black on dark-mode phones,
which is what showed through the strips MainActivity pads for the bars."
```

Device verification is Task 9 — this bug only reproduces in a release build.

---

### Task 6: Give the Contact role a tab bar

Contact is a flat `Stack` today. It becomes `Tabs` with a nested `(home)` `Stack`, mirroring `app/(agent)/` exactly. Because `(home)` is a route group, **every existing URL is unchanged** — `/(contact)/faq` still resolves.

**Files:**
- Modify: `app/(contact)/_layout.tsx`
- Create: `app/(contact)/(home)/_layout.tsx`
- Move: `app/(contact)/index.tsx` → `app/(contact)/(home)/index.tsx`
- Move: `app/(contact)/faq.tsx` → `app/(contact)/(home)/faq.tsx`
- Move: `app/(contact)/search.tsx` → `app/(contact)/(home)/search.tsx`
- Move: `app/(contact)/settings.tsx` → `app/(contact)/(home)/settings.tsx`
- Unchanged: `app/(contact)/messages.tsx`, `app/(contact)/help.tsx` (they become tab roots)

**Interfaces:**
- Consumes: `useTabChrome` from `lib/use-tab-chrome.ts`, `FloatingTabBar` from `components/nav/floating-tab-bar.tsx` — both already used by `(agent)` and `(admin)`, both used here unchanged.
- Produces: three Contact tab route names — `"(home)"`, `"messages"`, `"help"`. Task 7 does not depend on these names, but `badgeForRoute` in `floating-tab-bar.tsx` returns `undefined` for all three, so Contact renders no badges. That is correct and needs no change.

- [ ] **Step 1: Load the craft floor**

Load `reference/craft-floor.md` from the `impeccable` skill before editing.

- [ ] **Step 2: Move the four screens with `git mv`**

```bash
mkdir -p "app/(contact)/(home)"
git mv "app/(contact)/index.tsx"    "app/(contact)/(home)/index.tsx"
git mv "app/(contact)/faq.tsx"      "app/(contact)/(home)/faq.tsx"
git mv "app/(contact)/search.tsx"   "app/(contact)/(home)/search.tsx"
git mv "app/(contact)/settings.tsx" "app/(contact)/(home)/settings.tsx"
ls "app/(contact)" "app/(contact)/(home)"
```

Expected: `(contact)` holds `_layout.tsx`, `help.tsx`, `messages.tsx`, `(home)/`; `(home)` holds the four moved files. The file *contents* need no edits — each is a 3-line wrapper.

- [ ] **Step 3: Create the nested home stack**

Create `app/(contact)/(home)/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

import { stackChrome } from "@/lib/tokens";

export default function ContactHomeLayout() {
  return (
    <Stack screenOptions={stackChrome}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="faq" options={{ title: "FAQ" }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}
```

- [ ] **Step 4: Convert the Contact layout to tabs**

Replace the entire contents of `app/(contact)/_layout.tsx`:

```tsx
import { Tabs } from "expo-router";
import { HelpCircle, House, MessageCircle } from "@/components/icons";
import { FloatingTabBar } from "@/components/nav/floating-tab-bar";

import { useTabChrome } from "@/lib/use-tab-chrome";

export default function ContactLayout() {
  const chrome = useTabChrome();

  return (
    <Tabs
      screenOptions={chrome}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: "Help",
          tabBarIcon: ({ color, size }) => (
            <HelpCircle color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
```

`title` stays even though Task 7 removes the visible label — it is what `accessibilityLabel` falls back to for screen readers.

- [ ] **Step 5: Regenerate typed routes and typecheck**

```bash
pnpm exec expo customize tsconfig.json >/dev/null 2>&1 || true
pnpm exec tsc --noEmit
```

Expected: no errors. If `tsc` complains about an `Href` literal (e.g. `settingsHref="/(contact)/settings"` in `components/hub/contact-hub.tsx:31`), the generated `.expo/types` are stale — run `pnpm start` once to let expo-router regenerate them, stop it, and re-run `tsc`. Only widen an href to `as Href` if regeneration genuinely does not resolve it; do not blanket-cast.

- [ ] **Step 6: Confirm no route URL moved**

```bash
grep -rn '"/(contact)/' app components lib | sort
```

Expected: every href listed still points at `/(contact)/index|messages|help|faq|search|settings` and none needed editing, because `(home)` is a group segment.

- [ ] **Step 7: Run the test suite**

Run: `pnpm test`
Expected: PASS — no lib helper changed, this is a guard against collateral damage.

- [ ] **Step 8: Commit**

```bash
git add -A "app/(contact)"
git commit -m "feat(nav): give the Contact role a tab bar

Contact converts from a flat Stack to Tabs + a nested (home) Stack, mirroring
(agent). Tabs are Home / Messages / Help — the two hub action tiles plus the
hub itself. FAQ, Search and Settings stay pushed inside (home). Because (home)
is a route group, every existing URL is unchanged."
```

---

### Task 7: Strip the labels from the tab capsule

One shared component serves all three roles, so this lands everywhere at once.

**Files:**
- Modify: `components/nav/floating-tab-bar.tsx`

**Interfaces:**
- Consumes: `colors.primary` (Task 2), the three role layouts from Task 6 and the existing `(agent)`/`(admin)` layouts.
- Produces: no exported API change — `FloatingTabBar` keeps its signature. The `labelFor` helper is deleted.

**Correction to the agreed design, from inspecting the actual glyphs:** I said I would change Admin's Unassigned icon because `Inbox` and `MessageCircle` would rhyme once labels were gone. Looking at the real set — `House`, `Users`, `Inbox` (an open tray), `MessageCircle` (a speech bubble) — those four silhouettes are already distinct, and the substitutes worth considering (`UserX`) would rhyme with `Users` far more than `Inbox` rhymes with anything. **Keep every icon as-is.** No change to `components/icons.ts`, `app/(agent)/_layout.tsx`, or `app/(admin)/_layout.tsx`.

- [ ] **Step 1: Load the craft floor**

Load `reference/craft-floor.md` from the `impeccable` skill before editing.

- [ ] **Step 2: Delete the `labelFor` helper**

Remove the entire `labelFor` function (`components/nav/floating-tab-bar.tsx:34-48`) and its now-unused import of `Text` — but **only if** `Text` has no other use in the file. It does: the badge count uses it. Keep the `Text` import; delete only `labelFor`.

- [ ] **Step 3: Replace the tab item body**

Inside `state.routes.map(...)`, replace the `const label = labelFor(...)` line with:

```tsx
          const label = options.title ?? route.name;
```

Then replace the `<View className="min-h-11 items-center justify-center px-1 py-1.5">` block and everything inside it with:

```tsx
              <View className="min-h-12 items-center justify-center px-1 py-2.5">
                <View className="relative items-center">
                  {options.tabBarIcon?.({ focused, color, size: 24 })}
                  {badge != null ? (
                    <View className="absolute -right-2.5 -top-1 min-w-4 items-center rounded-full bg-primary px-1 py-px">
                      <Text variant="label" className="text-primary-foreground tabular-nums">
                        {badge > 99 ? "99+" : String(badge)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
```

Three changes: the `<Text>` label element is gone, icon size 22→24, and the row is `min-h-12` (48dp, Material's floor) with `py-2.5` so the capsule keeps its proportions without the label's height.

- [ ] **Step 4: Raise the pressable's minimum height to match**

On the `TactilePressable`, change `className="z-10 min-h-11 flex-1"` to:

```tsx
              className="z-10 min-h-12 flex-1"
```

- [ ] **Step 5: Update the component doc comment**

Replace the JSDoc above `export function FloatingTabBar` with:

```tsx
/**
 * Floating Clear Desk tab capsule for Contact/Agent/Admin.
 * Icon-only: `options.title` is not rendered, but still feeds the
 * `accessibilityLabel` below so screen readers keep every destination name.
 */
```

- [ ] **Step 6: Confirm accessible names survived**

```bash
grep -n "accessibilityLabel" components/nav/floating-tab-bar.tsx
```

Expected: the existing `options.tabBarAccessibilityLabel ?? (badge != null ? \`${label}, ${badge}\` : label)` is intact — every tab still announces its name and unread count.

- [ ] **Step 7: Typecheck and lint**

```bash
pnpm exec tsc --noEmit
pnpm lint
```

Expected: no errors, and no "declared but never read" warning (`labelFor` is gone, `Text` is still used by the badge).

- [ ] **Step 8: Commit**

```bash
git add components/nav/floating-tab-bar.tsx
git commit -m "feat(nav): make the tab capsule icon-only

Removes the visible labels and the labelFor helper across all three roles.
Icons 22->24 and rows 44->48dp so the capsule keeps its weight without the
text. options.title still feeds accessibilityLabel, so screen readers are
unaffected. Icons stay as-is: House/Users/Inbox/MessageCircle are already
distinct silhouettes."
```

---

### Task 8: Update the domain records

Three files assert "Contact has no tab bar" as domain law. Task 6 made all three false.

**Files:**
- Modify: `CONTEXT.md` (the **Contact** entry and the **Hub** entry)
- Modify: `PRODUCT.md` (the **Users** entry and the **Positioning** bullet)
- Create: `docs/adr/ADR-0002-contact-tab-nav-and-icon-only-chrome.md`

- [ ] **Step 1: Fix the two false `CONTEXT.md` entries**

Replace the **Contact** entry:

```markdown
**Contact**:
End-user role that only sees their own conversations. Reaches Home, Messages, and Help from the tab capsule; FAQ, Search, and Settings stay inside the home stack.
_Avoid_: Customer, client, user (when meaning this role)
```

Replace the **Hub** entry:

```markdown
**Hub**:
Role home screen (Contact / Agent / Admin variants). The first tab destination in every role.
_Avoid_: Dashboard, home feed
```

- [ ] **Step 2: Add the tab capsule to the glossary**

`CONTEXT.md` has no term for the nav itself, and this change makes it a shared concept across all three roles. Append:

```markdown
**Tab capsule**:
The floating rounded nav bar at the bottom of every role. Icon-only — destination names live in the accessible name, not on screen.
_Avoid_: Tab bar (that is the host navigator's own bar, kept invisible beneath), dock, bottom nav
```

- [ ] **Step 3: Fix `PRODUCT.md`**

In the **Users** section, replace the Contact line:

```markdown
**Contact** — internal person seeking help or participating in support conversations; sees only their own threads. Reaches Home, Messages, and Help from the tab capsule.
```

In **Positioning**, replace the first bullet:

```markdown
- Role-shaped hubs and RBAC: every role uses a tab hub, with a role-specific destination set (Contact: Home/Messages/Help; Agent: Home/Unassigned/Conversations; Admin: Home/Users/Unassigned/Conversations); capabilities follow role (view rules, unassigned pool, notes, delete, assign, broadcast — capability ≠ ship UI this phase).
```

In **Capabilities and Constraints**, replace the first bullet:

```markdown
- Confirmed roles and navigation model as in scope (all roles use tab hubs; Settings via hub gear).
```

- [ ] **Step 4: Write ADR-0002**

Create `docs/adr/ADR-0002-contact-tab-nav-and-icon-only-chrome.md`:

```markdown
# ADR-0002: Contact tab nav and icon-only chrome

- Status: Accepted
- Date: 2026-08-24
- Supersedes: ADR-0001 §1–3 (partially — hub branding and greeting copy stand)

## Context

ADR-0001 fixed hub chrome on the premise that Contact is a stack hub with no
tab bar, and `CONTEXT.md` and `PRODUCT.md` both recorded that as domain law.
In practice Contact's two most-used destinations — Messages and Help — were
reachable only by returning to the hub and tapping an action tile, one level
deeper than the equivalent journey for Agent or Admin.

Separately, the shared tab capsule carried a text label under every icon.
Admin's four labels ("Home", "Users", "Unassigned", "Conversations") set the
capsule's width and height budget, and the longest of them drove a layout the
other roles did not need.

## Decision

1. Contact gains the same floating tab capsule as Agent and Admin. Its route
   tree mirrors `(agent)`: a `Tabs` layout wrapping a nested `(home)` stack.
2. Contact's destinations are Home, Messages, Help — the hub itself plus the
   two action tiles the hub already leads with. FAQ, Search and Settings stay
   pushed inside the home stack; they are one tap from the hub and do not earn
   peer status with Messages.
3. The tab capsule is icon-only for all three roles. `options.title` is no
   longer rendered but still feeds `accessibilityLabel`, so every destination
   keeps its accessible name and unread count.
4. Because `(home)` is an expo-router route group, no public route URL changed.

## Consequences

- `CONTEXT.md`'s Contact and Hub entries and `PRODUCT.md`'s Users and
  Positioning sections were rewritten; "Contact is a stack hub" is no longer
  true anywhere in the repo.
- Contact reaches Messages and Help in one tap from any screen instead of two.
- Wayfinding for Admin's four tabs now rests entirely on icon recognition. The
  four glyphs (House, Users, Inbox, MessageCircle) were reviewed as silhouettes
  and kept; if Admin gains a fifth destination, revisit this before adding it.
- Sighted users lose the text labels; screen-reader users lose nothing.
```

- [ ] **Step 5: Verify nothing still claims Contact has no tabs**

```bash
grep -rni "no tab bar\|stack hub\|no tabs" CONTEXT.md PRODUCT.md AGENTS.md docs/   --exclude-dir=superpowers --exclude="ADR-000*"
```

Expected: no output at all. The plan file and both ADRs are excluded — ADR-0001 is a historical record and ADR-0002 quotes the old premise in its Context section, so both correctly still contain the phrase.

- [ ] **Step 6: Commit**

```bash
git add CONTEXT.md PRODUCT.md docs/adr/ADR-0002-contact-tab-nav-and-icon-only-chrome.md
git commit -m "docs: record the Contact tab nav decision

Rewrites the Contact and Hub glossary entries and PRODUCT.md's navigation
model, both of which asserted Contact has no tab bar. Adds ADR-0002."
```

---

### Task 9: Verify on device

Nothing above is proven until it renders. The bar fix in particular **cannot** be verified in a dev client — that build path skips the prebuild plugin, and the DayNight window background is a release-theme behaviour.

**Files:** none — verification only.

- [ ] **Step 1: Full static gate**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

Expected: all three clean. Fix anything red before continuing.

- [ ] **Step 2: Run the dev client and capture the colour and nav work**

```bash
pnpm android
```

Once loaded, capture a screenshot per role. Switch roles via Settings → role switch.

```bash
adb exec-out screencap -p > .tmp-shots/contact-hub.png
adb exec-out screencap -p > .tmp-shots/agent-hub.png
adb exec-out screencap -p > .tmp-shots/admin-hub.png
```

(`mkdir -p .tmp-shots` first; add `-s <serial>` if several devices are attached.)

- [ ] **Step 3: Inspect the three captures in one batched pass**

Read all three and check, in one round:
- No blue survives anywhere in chrome — buttons, active tab pill, links, avatar initials, badges, the search field.
- The Contact capsule shows three icons and **no text**; Agent shows three; Admin shows four.
- The Admin capsule's four icons are individually identifiable without labels.
- Badge pills sit correctly on the icons now that the label is gone — not clipped by the capsule edge.
- Offer cards read ember, not blue.
- Warm neutrals do not make the greys look muddy or yellow-cast against white.

Fix everything this pass surfaces in **one batch**, then re-capture once to confirm. Do not iterate beyond that second round.

- [ ] **Step 4: Check the font-scale edge case**

```bash
adb shell settings put system font_scale 1.3
```

Re-capture one hub. The capsule has no text left, so it should be immune — confirm it is, and that hub headings and action tiles still fit. Then restore:

```bash
adb shell settings put system font_scale 1.0
```

- [ ] **Step 5: Build the release APK — this is the only test of the bar fix**

```bash
pnpm build:apk
```

Install it on the device, then **put the phone's system theme into dark mode** (Settings → Display → Dark theme, or `adb shell cmd uimode night yes`). This is the condition that produced the user's screenshot; testing in light mode proves nothing.

- [ ] **Step 6: Confirm the bars**

```bash
adb exec-out screencap -p > .tmp-shots/release-dark-mode.png
```

Read it. Expected: the strip behind the status bar and the strip behind the gesture pill are **white**, matching the hub background, with dark status icons and a dark gesture pill. If either strip is still black, the decor-view paint is not landing — check that the APK was rebuilt after Task 5 (`grep -n "decorView.setBackgroundColor" android/app/src/main/java/com/anonymous/enki/MainActivity.kt` must hit; if it does not, the plugin did not re-run, so `pnpm exec expo prebuild --clean -p android` and rebuild).

Restore the phone: `adb shell cmd uimode night no`.

- [ ] **Step 7: Clean up and report**

```bash
rm -rf .tmp-shots
```

Report to the user: what each screenshot showed, which device and Android version produced the release evidence, and anything the batched pass could not fix. State plainly if any check did not pass.

---

## Self-review

**Spec coverage.** Colour swap → Tasks 1–3. Offer artwork → Task 4. Black bars → Task 5 (+ Task 9 Step 6). Contact nav → Task 6. Icon-only nav → Task 7. Domain records → Task 8. Verification → Task 9. Every row of the *Agreed design* table maps to a task.

**Deliberate omissions**, all agreed with the user: the launch animation is not recoloured; dark mode stays locked off; the native inset padding in `MainActivity` is not unwound; the logo is untouched because HEAD already carries the ember mark.

**One pre-existing issue found and not fixed:** `success #1F9D6C` is 3.44:1 on white, below AA for text. It predates this work and is unchanged by it, so Task 1's contrast block deliberately does not assert on it — adding that assertion would have made Task 1 fail for a reason outside this scope. Worth raising with the user separately.

**Type consistency.** `relativeLuminance` / `contrastRatio` are named identically in `lib/contrast.ts`, `lib/contrast.test.ts`, and `lib/tokens.test.ts`. `colors` keys used in `lib/tokens.test.ts`'s `CSS_NAME` map exactly match the object written in Task 2 Step 5 — eleven keys, no more. `bubble-in` and `primary-soft` exist in `global.css` but not in `lib/tokens.ts`, and are correctly absent from the map.
