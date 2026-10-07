# App Store images — ChatRoute

GPT makes the frames, backgrounds and illustrations. The app UI is never generated: every phone
and iPad screen is a real simulator capture composited into GPT's frame afterwards. Apple's
guideline 2.3.3 wants screenshots that show the app as it runs, and a generated UI drifts from the
brand.

## Deliverables

| Asset | Size | Source | Status |
|---|---|---|---|
| App icon | 1024 × 1024 PNG, **no alpha**, square corners (Apple masks it) | `assets/images/icon.png` flattened onto #FFFFFF | done, flatten on export |
| iPhone 6.9" screenshots | 1320 × 2868 portrait; 1–10 images; required | prompt P1 + captures | needed |
| iPhone 6.5" screenshots | 1284 × 2778; optional, Apple scales 6.9" down if absent | skip | — |
| iPad 13" screenshots | 2064 × 2752 portrait; required while `supportsTablet` is true | prompt P3 + captures | needed |
| App preview video | 15–30 s, optional | — | skip for v1 |
| In-app empty states | 1200 × 1200 PNG, transparent | prompt P4 | optional |
| Offers carousel art | 1536 × 1024 PNG | prompt P5 | replaces current off-brand `assets/offers/*.png` |

No feature graphic on iOS. If iPad support is dropped (`supportsTablet: false`) the iPad set is
not needed; decide before the first submission because adding iPad later is a new review.

Attach to the GPT conversation:
- `assets/images/brand-lockup.png` (mark + wordmark)
- `../../new-logo and name/just-logo-transparent.png` (mark only)
- `assets/images/icon.png`

---

## Brief (paste as the first message)

You are producing App Store artwork for **ChatRoute**, an internal support messenger for
organisations (iPhone and iPad, built with Expo). Three roles use it: Customer (asks for help),
Agent (answers, claims unassigned threads), Admin (oversight). It is a work tool, not a consumer
chat app: no stories, no stickers, no social feed.

**Visual identity: "The Clear Desk."** Calm, light, sparse. White and warm off-white surfaces,
graphite text, one lavender accent used sparingly, a sage-green secondary that appears only in the
logo and small status cues. Friendly and direct. Soft rounded corners, hairline borders, soft
shadows. No glassmorphism, no neon, no dark mode, no 3D glossy blobs, no gradients heavier than a
faint lavender-to-off-white wash.

**Palette (use exactly):**

| Role | Hex |
|---|---|
| ChatRoute Lavender (accent, buttons, outgoing bubbles) | #6253A3 |
| Primary Lavender (lighter accent, logo left half) | #7C6BC4 |
| Lavender Mist (soft wash, selected states) | #EEEAF8 |
| Sage Green (logo right half, success, online dot) | #7FA68A |
| Light Sage (success wash) | #E8F0EA |
| Warm Off-White (page background) | #FAF9F7 |
| Soft Grey (borders, dividers) | #E7E4E2 |
| Graphite (headlines, body text) | #29272D |
| Muted (secondary text) | #858187 |
| White (cards) | #FFFFFF |
| Amber (attention only, tiny) | #D09033 |

Lavender is the one signal. If lavender covers more than about 15% of any image, it is wrong.

**Typography:** Manrope. Headlines in Manrope ExtraBold, tight tracking (-0.02em). Sub-lines in
Manrope Regular. Graphite text on light backgrounds; white text only on a lavender panel. No other
typefaces, no italics, no all-caps headlines.

**Logo:** use the attached files unchanged. Do not redraw, recolour, outline, add a glow or a drop
shadow, or put it on a dark background. Clear space around it equals the height of the three dots
in the speech bubble. The icon is final: do not generate a new one.

**Devices:** draw a generic modern iPhone-class phone with slim uniform bezels, rounded corners, a
small centred pill cut-out at the top of the screen, no brand, no visible buttons. The screen area
must be a flat solid placeholder (#EEEAF8) with no UI drawn in it; a real screenshot is composited
there later. Return the screen's pixel rectangle (x, y, width, height) with each frame. Do not draw
the Apple logo or any Apple trade dress.

**Shapes and depth:** cards with ~24px radius, chips fully round, hairline #E7E4E2 borders, one
soft shadow (ambient, low opacity, large blur). Nothing sharp-cornered.

**Illustration style:** flat, two-tone, lavender and sage on off-white, simple geometric shapes,
no faces, no detailed people, no stock-photo realism, no isometric offices, no robots. Abstract
speech-bubble motifs are fine because the logo is one.

**Never:** dark UI, red or orange, emoji, stock photos of call centres, headsets, chat-bot mascots,
"Sponsored" labels, case-status steppers, the words Messenger, Casewire, ISM, or Zeest.

**Output:** PNG, the exact pixel size stated in each prompt, no watermark, no border, sRGB. Text in
images must be spelled exactly as given.

---

## Prompts (one message each)

### P1 — iPhone screenshot frames, 7 variants

Size: 1320 × 2868.

Portrait store screenshot. Background #FAF9F7 with a very faint radial Lavender Mist wash
(#EEEAF8) behind the phone, fading to the page colour by the edges. Top 22% of the canvas holds
the caption: headline in Manrope ExtraBold, Graphite, about 88px, left-aligned with 96px side
margins, balanced over two lines at most; sub-line beneath it in Manrope Regular, Muted, about
44px. Below the text, a phone frame per the brief, centred, scaled so its bottom edge runs off the
canvas by about 8% (cropped, not floating). One soft shadow under the phone. No other decoration.

Produce 7 variants with these captions (headline / sub-line):

1. Help, in one thread / Ask your organisation and get the reply where you asked
2. Photos, documents, voice notes / Attach what explains it faster than typing
3. Claim it. Reply. Done. / Agents work the Unassigned pool with one tap
4. Oversight that fits in a pocket / Directory, organisations, audit log and charts for Admins
5. Opens on what your phone last knew / Conversations stay on the device, with or without a signal
6. Announcements and groups / The Wall and Communities, for every role
7. Sign in your way / Password, magic link, Google, two-factor

Variant 5 only: add a small round pill above the phone, white with a hairline border, a tiny
aeroplane glyph in Graphite and the text "No signal" in Manrope Regular, Muted. Everything else
identical across variants. Return the screen rectangle.

(An eighth variant, "Reaches you when the app is closed / A reply lands on the lock screen and
opens the thread", is added once iOS push ships. Do not generate it yet.)

### P3 — iPad screenshot frames

Size: 2064 × 2752.

Same composition and rules as P1 with a tablet frame: slim uniform bezels, rounded corners,
portrait, no cut-out. Headline about 120px. Produce captions 1, 3 and 4 only. Return the screen
rectangle.

### P4 — In-app empty-state illustrations (optional)

Size: 1200 × 1200 each, transparent background, flat two-tone per the brief. Six images:

1. `empty-inbox`: a single open speech bubble outline in Lavender with three sage dots inside, on a faint sage ground line.
2. `empty-unassigned`: three small bubble outlines in a row, the middle one filled Lavender Mist, a small amber dot above the first.
3. `no-signal`: a bubble outline with a short dashed line trailing off it, one dash sage.
4. `empty-wall`: a rounded "post" card outline with a Lavender header bar and two Soft Grey text bars.
5. `empty-search`: a magnifier circle in Lavender, handle sage, a tiny bubble inside the lens.
6. `notifications-off`: a bell outline in Lavender with one sage slash, no red.

Same stroke weight throughout (about 24px at this size), rounded corners, 10% padding so they
scale to 160px cleanly.

### P5 — Offers carousel art

Size: 1536 × 1024 each, two images.

1. `zero-fee`: a large off-white circle with a lavender "0" cut-out and two sage bubble shapes behind it.
2. `payouts`: three ascending rounded bars in Lavender Mist, Lavender, Sage, on off-white.

No text, no coins, no lightning bolts, no photography.

(P2, the feature graphic, is Android-only. P4 and P5 are shared; generate them once in whichever
conversation runs first.)

---

## Captures (real screenshots, simulator)

The iOS simulator runs only on a Mac. This half cannot be done on the Windows machine.

### With a Mac

Build a simulator binary and install it on an iPhone 16 Pro Max simulator (6.9") and an iPad Pro
13" simulator. Auth needs the development client, not Expo Go (README).

```bash
eas build --platform ios --profile development
```

Or locally with Xcode installed:

```bash
npx expo run:ios --device "iPhone 16 Pro Max"
```

Clean the status bar, then capture:

```bash
xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4 --operatorName ""
```

```bash
xcrun simctl io booted screenshot shot.png
```

Clear the override afterwards with `xcrun simctl status_bar booted clear`.

### Without a Mac

Use the Android captures from `../android/images.md` inside the iOS frames for a first
submission and replace them once a Mac is available. Guideline 2.3.3 is about the app's own UI
rather than the OS, and a generic frame with real app screens usually passes, but Android chrome
(keyboard, Material share sheet, lock screen) in a capture is a likely rejection. For this route,
crop captures 2 and 7 so no keyboard or system sheet is visible, and do not submit a lock-screen
image at all.

### Screens

| # | Role | Screen | State |
|---|---|---|---|
| 1 | Customer | `chat/[id]` support thread | 5–7 messages, incoming and outgoing, one read receipt, no errors |
| 2 | Customer | same thread | one photo bubble, one document, one voice note; composer with a staged attachment |
| 3 | Agent | `(agent)/unassigned` | 3–4 rows, one amber attention; second capture: thread with the Engage button in the composer slot |
| 4 | Admin | `(admin)/(home)/index` | overview tiles + charts carousel with next-card peek. **Recaptured 2026-10-07** alongside Android phone capture 04 on the rebuilt dev client with the StatTile fix; `04-admin-overview-android.png` replaced and composed into `iphone-04.png`. iPad capture unchanged |
| 5 | Customer | `(customer)/messages` | airplane mode on, list drawn from the Store, no error strip |
| 6 | any | `(customer)/wall` | 2–3 Posts with an image collage; second capture: Communities tab expanded |
| 7 | signed out | `(auth)/sign-in` | empty form, Google button enabled, no error |

iPad: captures 1, 3 and 4 on the iPad Pro 13" simulator in portrait.

Seed data: plainly fictional names, one organisation name throughout, no real emails.

After any recapture, overwrite the file in `captures/` with the same name and re-run the compose
script below; it is idempotent and re-verifies every output size.

Compositing is scripted: `compose-captures.py` crops the Android status bar off each capture,
pads the top so the Dynamic Island sits over empty space, pastes it into the generated frame at
native resolution fitted by width, and writes `screenshots/`. Run the Android taskbar trim first,
since it also trims the iPad-sized captures here. `composited/` and the zip were GPT's own
upscaled pass and are superseded.

```bash
python docs/store/android/trim-taskbar.py; python docs/store/ios/compose-captures.py
```
