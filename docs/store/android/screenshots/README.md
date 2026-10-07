# Captured store screenshots

Eight phone screenshots and six tablet screenshots, composited into the generated frames. Raw captures are in `../captures`; rerun `python docs/store/android/compose-captures.py` from the mobile project to rebuild these images.

The app's existing screens rendered fictional Northstar data through a temporary local API/authentication stub. The stub and configuration were removed after capture. The two modified source files were restored byte-for-byte from their pre-capture copies, and TypeScript checking passed after restoration. No backend was started and no existing emulator was changed. The separate capture emulator, Metro server, and loopback bridge were stopped afterwards.

`phone-05-local-demo.png` shows a real Android notification generated locally by ChatRoute. It does not verify FCM delivery; replace it with a real remote-push capture when that service is available.

On 2026-10-07, phone capture 04 and its iOS-frame copy were recaptured with the StatTile label fix after rebuilding the development client. The local-notification lock-screen image was also recaptured at 9:41 using the rootable emulator's system clock. Both compose scripts were rerun and verified all output sizes. Temporary fictional-data source changes were restored from byte-for-byte backups.

Tablet captures use the separate emulator with 1200 × 1920 and 1600 × 2560 display overrides at 320 dpi. They show the app's actual tablet-sized rendering. They are not captures from separate physical 7-inch and 10-inch devices.

The attachment image is fictional brand artwork, the document and audio metadata are fixtures, and the offline inbox was photographed with airplane mode enabled. These are artwork captures, not backend or offline acceptance tests.
