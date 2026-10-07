# Emulator captures

Captured October 7, 2026 from the real Android app on the separate `emulator-5556`, using temporary fictional Northstar Studio data. No real accounts, credentials or conversations were used. These are draft Android captures for the iOS artwork workflow, not native iOS simulator screenshots.

| File | Screen |
|---|---|
| `01-support-thread-android.png` | Customer support thread, six messages |
| `02-attachments-android.png` | Image, document and voice-note bubbles |
| `03-unassigned-android.png` | Agent queue with three conversations |
| `03b-engage-android.png` | Unassigned thread with Engage control |
| `04-admin-overview-android.png` | Admin overview and charts carousel |
| `05-offline-list-android.png` | Cached Messages list after an offline cold start |
| `06-wall-android.png` | Wall with fictional announcement and artwork |
| `06b-communities-android.png` | Expanded Community and its threads |
| `07-sign-in-android.png` | Empty sign-in form with Google button |
| `ipad-1-support-android.png` | Customer support in tablet layout |
| `ipad-3-unassigned-android.png` | Agent queue in tablet layout |
| `ipad-4-admin-android.png` | Admin overview in tablet layout |

Phone captures are 1080 × 2400. The Admin phone capture uses 360 dpi to keep the overview labels whole; other phone captures use the emulator's 420 dpi. Tablet captures are 1600 × 2133 at 320 dpi. Remove Android system chrome, including the tablet taskbar, when compositing into frames. No keyboard is visible in the selected captures.

The attachment example has no staged attachment in the composer; the Wall capture shows one image rather than an image collage. The Engage example reuses the sample support exchange and is a draft content variant. These can be refined with a populated demo backend or native simulator session before final store submission.

Cleanup completed: the temporary local data service was stopped and removed; the original APK was restored in `dist`, the native output folder, and on the screenshot emulator; the temporary manifest allowance and cached screenshot JavaScript bundle were removed. No application source or `.env` changes remain. The original emulator was left alone.
