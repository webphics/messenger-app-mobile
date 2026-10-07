# Google Play images — ChatRoute

GPT makes the frames, backgrounds, feature graphic and illustrations. The app UI is never
generated: every phone screen is a real emulator capture composited into GPT's frame afterwards.
Play policy wants screenshots that show the actual app, and a generated UI drifts from the brand.

## Deliverables

| Asset | Size | Source | Status |
|---|---|---|---|
| App icon | 512 × 512, 32-bit PNG with alpha | `assets/images/icon.png` exported | done |
| Feature graphic | 1024 × 500 JPG/PNG, no alpha | prompt P2 | needed |
| Phone screenshots | 1080 × 1920 (9:16); 2–8 images; min 320, max 3840 on the long side | prompt P1 + captures | needed |
| 7" tablet screenshots | 1200 × 1920; up to 8 | prompt P3 + captures | only if tablets stay targeted |
| 10" tablet screenshots | 1600 × 2560; up to 8 | prompt P3 + captures | only if tablets stay targeted |
| Promo video | YouTube link, optional | — | skip for v1 |
| In-app empty states | 1200 × 1200 PNG, transparent | prompt P4 | optional |
| Offers carousel art | 1536 × 1024 PNG | prompt P5 | replaces current off-brand `assets/offers/*.png` |

Attach to the GPT conversation:
- `assets/images/brand-lockup.png` (mark + wordmark)
- `../../new-logo and name/just-logo-transparent.png` (mark only)
- `assets/images/icon.png`

---

## Brief (paste as the first message)

You are producing Google Play store artwork for **ChatRoute**, an internal support messenger for
organisations (Android, built with Expo). Three roles use it: Customer (asks for help), Agent
(answers, claims unassigned threads), Admin (oversight). It is a work tool, not a consumer chat
app: no stories, no stickers, no social feed.

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

**Devices:** draw a generic modern Android phone with slim uniform bezels, rounded corners, a
centred punch-hole camera, no brand, no visible buttons. The screen area must be a flat solid
placeholder (#EEEAF8) with no UI drawn in it; a real screenshot is composited there later. Return
the screen's pixel rectangle (x, y, width, height) with each frame.

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

### P1 — Phone screenshot frames, 8 variants

Size: 1080 × 1920.

Portrait store screenshot. Background #FAF9F7 with a very faint radial Lavender Mist wash
(#EEEAF8) behind the phone, fading to the page colour by the edges. Top 22% of the canvas holds
the caption: headline in Manrope ExtraBold, Graphite, about 72px, left-aligned with 80px side
margins, balanced over two lines at most; sub-line beneath it in Manrope Regular, Muted, about
36px. Below the text, an Android phone frame per the brief, centred, scaled so its bottom edge runs
off the canvas by about 8% (cropped, not floating). One soft shadow under the phone. No other
decoration.

Produce 8 variants with these captions (headline / sub-line):

1. Help, in one thread / Ask your organisation and get the reply where you asked
2. Photos, documents, voice notes / Attach what explains it faster than typing
3. Claim it. Reply. Done. / Agents work the Unassigned pool with one tap
4. Oversight that fits in a pocket / Directory, organisations, audit log and charts for Admins
5. Reaches you when the app is closed / A reply lands on the lock screen and opens the thread
6. Opens on what your phone last knew / Conversations stay on the device, with or without a signal
7. Announcements and groups / The Wall and Communities, for every role
8. Sign in your way / Password, magic link, Google, two-factor

Variant 6 only: add a small round pill above the phone, white with a hairline border, a tiny
aeroplane glyph in Graphite and the text "No signal" in Manrope Regular, Muted. Everything else
identical across variants. Return the screen rectangle.

### P2 — Feature graphic

Size: 1024 × 500, no transparency.

Landscape banner. Background #FAF9F7 with the faint Lavender Mist radial wash centred slightly
left. Left 55%: the attached brand lockup (mark above wordmark) scaled so the wordmark is about
420px wide, vertically centred, with "Support messenger for teams" beneath it in Manrope Regular,
Muted, 30px. Right 45%: two overlapping chat bubbles as abstract shapes, one outgoing (#6253A3,
22px radius, tighter bottom-right corner) and one incoming (white with a #E7E4E2 hairline, tighter
bottom-left), each holding two or three placeholder text bars, no words. A single sage dot
(#7FA68A, 14px) at the incoming bubble's top-left. Nothing else. Keep 48px safe margin on all
sides; Play crops the edges and overlays a play button when a video is attached.

### P3 — Tablet screenshot frames

Sizes: 1600 × 2560 (10") and 1200 × 1920 (7").

Same composition and rules as P1 with a generic Android tablet frame: slim uniform bezels, rounded
corners, portrait. Headline about 96px at 1600 wide. Produce captions 1, 3 and 4 only. Return the
screen rectangle for each size.

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

---

## Captures (real screenshots, emulator)

Pixel 8 Pro emulator (1344 × 2992) or any Pixel at 1080 × 2400+, light appearance, development
client installed (auth and push do not run in Expo Go). Clean the status bar with demo mode:

```bash
adb shell settings put global sysui_demo_allowed 1
```

```bash
adb shell am broadcast -a com.android.systemui.demo -e command enter; adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941; adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false; adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4; adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
```

```bash
adb exec-out screencap -p > shot.png
```

Exit demo mode afterwards with `-e command exit`. For tablets use a Pixel Tablet emulator in
portrait.

| # | Role | Screen | State |
|---|---|---|---|
| 1 | Customer | `chat/[id]` support thread | 5–7 messages, incoming and outgoing, one read receipt, no errors |
| 2 | Customer | same thread | one photo bubble, one document, one voice note; composer with a staged attachment |
| 3 | Agent | `(agent)/unassigned` | 3–4 rows, one amber attention; second capture: thread with the Engage button in the composer slot |
| 4 | Admin | `(admin)/(home)/index` | overview tiles + charts carousel with next-card peek. **Recaptured 2026-10-07** after rebuilding the dev client: “Conversations” and “Awaiting reply” fit on one line with the StatTile fix. Fictional Northstar data; Android and iOS phone capture 04 replaced and composed |
| 5 | any | Android lock screen | **Clock recaptured 2026-10-07 at 9:41**, with a ChatRoute local notification. Remote API/FCM delivery remains outstanding (FCM key must be on EAS). Demo mode does not reach the lock screen; `adb root`, disable automatic time, then `adb shell "date 100709412026.00"` before locking. Restore automatic time afterwards. Capture and composed local-demo image replaced |
| 6 | Customer | `(customer)/messages` | airplane mode on, list drawn from the Store, no error strip |
| 7 | any | `(customer)/wall` | 2–3 Posts with an image collage; second capture: Communities tab expanded |
| 8 | signed out | `(auth)/sign-in` | empty form, Google button enabled, no error |

Seed data: plainly fictional names, one organisation name throughout, no real emails.

After any recapture, overwrite the file in `captures/` with the same name and re-run the compose
script below; it is idempotent and re-verifies every output size.

Compositing is scripted. Tablet captures carry the emulator's launcher taskbar, which
`trim-taskbar.py` cuts off (originals kept in `captures/raw/`); `compose-captures.py` then
pastes every capture into its frame at native resolution, fitted by width so nothing is cropped
at the sides, and writes `screenshots/`.

```bash
python docs/store/android/trim-taskbar.py; python docs/store/android/compose-captures.py
```
