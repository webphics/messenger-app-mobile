# Floating Bubble — Phase 4 Implementation Spec

> **Status:** Not started. Prerequisite: Phase 4 (Socket.IO + real-time messages).
> Do not begin until `socket.io-client` and the message event stream are wired.

---

## What it is

A Facebook Messenger-style chat-head bubble that floats over all other apps on
Android. When a new message arrives while the app is backgrounded, the bubble
appears with an unread count badge. Tapping it brings the app back and opens
the relevant conversation.

iOS is not supported — Apple's sandbox prohibits drawing over other apps.

---

## Prerequisites (must exist before starting)

- [ ] Socket.IO `message:new` event firing from the backend
- [ ] App can receive messages while backgrounded (foreground service or push)
- [ ] `conversationId` is a stable identifier in the real data model
- [ ] `SYSTEM_ALERT_WINDOW` permission UX is designed (explain value to user before requesting)

---

## Permission strategy

Request `SYSTEM_ALERT_WINDOW` **only when the user explicitly enables
"Notify me when backgrounded"** in Settings — not on app launch. This keeps
the permission prompt contextual and honest.

---

## JS bridge API  (`lib/floating-bubble.ts`)

```ts
FloatingBubble.show({ count: number; conversationId: string })
FloatingBubble.hide()
FloatingBubble.update({ count: number })
FloatingBubble.openChat(conversationId: string)
FloatingBubble.hasPermission(): Promise<boolean>
FloatingBubble.requestPermission(): Promise<boolean>
```

All methods are no-ops on iOS (guard with `Platform.OS !== 'android'`).

---

## Android native files to create

Eject to bare workflow first (`npx expo prebuild --clean`).
**Never run prebuild again after this** — it wipes the `android/` folder.

```
android/app/src/main/java/com/<package>/
├── modules/
│   ├── FloatingBubbleModule.kt       ← ReactContextBaseJavaModule; exposes show/hide/update/openChat
│   └── FloatingBubblePackage.kt      ← ReactPackage; registers the module
├── service/
│   └── FloatingBubbleService.kt      ← Foreground Service; keeps bubble alive when app is killed
└── utils/
    ├── FloatingBubbleManager.kt      ← WindowManager; renders/moves/removes the ImageView overlay
    └── OverlayPermissionHelper.kt    ← SYSTEM_ALERT_WINDOW check + Settings intent
```

Register `FloatingBubblePackage` in `MainApplication.kt` and declare the
service + permission in `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<service
  android:name=".service.FloatingBubbleService"
  android:exported="false" />
```

---

## FloatingBubbleModule.kt — exposed methods

| JS call | Kotlin `@ReactMethod` | What it does |
|---|---|---|
| `show({ count, conversationId })` | `showBubble(count, conversationId, promise)` | Checks permission, starts service, passes args via Intent extras |
| `hide()` | `hideBubble(promise)` | Stops the service |
| `update({ count })` | `updateBubble(count, promise)` | Sends a broadcast to the running service to refresh badge |
| `openChat(conversationId)` | N/A (handled inside service tap listener) | Launches MainActivity with `conversationId` extra |
| `hasPermission()` | `hasPermission(promise)` | `Settings.canDrawOverlays(context)` |
| `requestPermission()` | `requestPermission(promise)` | Opens `ACTION_MANAGE_OVERLAY_PERMISSION`; resolves on `onActivityResult` |

---

## FloatingBubbleManager.kt — key implementation notes

- Use `WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY` (API 26+).
- All `WindowManager` calls **must run on the main thread** — use `Handler(Looper.getMainLooper()).post { }`.
- Drag: `ACTION_MOVE` → `windowManager.updateViewLayout`.
- Snap on release: `ValueAnimator` + `OvershootInterpolator` snapping to nearest horizontal edge.
- Tap (no drag): `getLaunchIntentForPackage` + `FLAG_ACTIVITY_REORDER_TO_FRONT` + put `conversationId` extra.
- Badge: `TextView` layered over the bubble `ImageView`; update via `hideBadge/showBadge(count)`.
- Close zone: show a red `X` target at screen bottom-center during drag; dropping bubble on it calls `hideBubble()`.

---

## FloatingBubbleService.kt — key implementation notes

- Extend `Service`, return `START_STICKY` so Android restarts it if killed.
- Register a `BroadcastReceiver` for `ACTION_UPDATE_COUNT` to handle `update()` calls from JS without restarting the service.
- Android 8+ requires a foreground notification to keep the service alive — use `IMPORTANCE_LOW` channel so it is silent.

---

## Trigger point in app code

In the Socket.IO message handler (Phase 4, wherever `message:new` is consumed):

```ts
import { AppState } from 'react-native';
import FloatingBubble from 'lib/floating-bubble';

// Inside message:new handler
if (AppState.currentState !== 'active') {
  const hasPerm = await FloatingBubble.hasPermission();
  if (hasPerm) {
    FloatingBubble.show({ count: unreadTotal, conversationId });
  }
}
```

On app foregrounded (AppState `active`): call `FloatingBubble.hide()`.

---

## What NOT to do

- Do not request `SYSTEM_ALERT_WINDOW` on app launch.
- Do not wire to mock data — the bubble has no value without a real message stream.
- Do not build this before Phase 4's Socket.IO layer exists.
- Do not run `npx expo prebuild` after the initial eject.
- Do not implement iOS fallback — there is none; `Platform.OS` guard is sufficient.
