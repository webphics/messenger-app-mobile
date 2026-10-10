# Publishing to the App Store — checklist

What stands between the current state and an App Store release. iOS is further from shipping
than Android: there is no device build profile, no APNs, no CI, and no Mac in the loop. Facts come
from the README, `eas.json` and `app.config.js`.

## Today

- Bundle ID `com.thechatroute.app`, `supportsTablet: true`, version `1.0.5`.
- `eas.json` `development` profile has `"ios": { "simulator": true }`: a simulator binary only,
  for a Mac. No profile builds for a device, no `production` iOS block, no CI job.
- Google sign-in: the iOS OAuth client exists and is in every `env` block; the URL scheme is
  derived in `app.config.js`. No `GoogleService-Info.plist` is needed (README).
- Push: **not wired on iOS**. APNs needs an Apple Developer account and a key uploaded to EAS
  (`docs/scope.md` Phase 5d, ADR-0009). The client code is platform-neutral.
- Magic links: production wants an HTTPS universal-link origin with an `apple-app-site-association`
  file served from it (`EXPO_PUBLIC_MAGIC_LINK_ORIGIN`, README). Today the link uses the
  `chatroute://` scheme, which iOS Mail will not linkify.

## Blockers, in order

1. **Apple Developer Program** membership (organisation, not individual, so the seller name is
   Zeest Global). Register the bundle ID with Push Notifications and Associated Domains
   capabilities.
2. **Credentials on EAS.** `eas credentials --platform ios`: let EAS create the distribution
   certificate and App Store provisioning profile, and upload an **APNs key** (.p8) from the
   developer portal while there.
3. **Device build profile.** Add to `eas.json`:
   ```json
   "production": {
     "ios": { "distribution": "store" }
   }
   ```
   alongside the Android block. Keep `simulator: true` only in `development`.
4. **Push for iOS.** With the APNs key on EAS, `expo-notifications` reads a token on a device
   build; the API's `POST /push/devices` already accepts an Expo token regardless of platform.
   Verify on a real iPhone; the simulator receives no remote push. Then restore the _Built to be
   reachable_ paragraph and the push screenshot in `listing.md` / `images.md`.
5. **Universal links.** Serve `/.well-known/apple-app-site-association` from the magic-link origin
   with the Team ID + bundle ID, add `associatedDomains` to `app.config.js`, and set
   `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` in the iOS env. Without it, magic-link sign-in works on iOS only
   by pasting the link; the reviewer should be given password accounts regardless.
6. **Account deletion (guideline 5.1.1(v)).** Apple requires an in-app path to start account
   deletion for any app with account creation. ChatRoute has no in-app creation, which exempts it
   on paper, but reviewers often ask anyway; give the web/admin request URL in the review notes and
   expect to add a _Delete account_ request row in Settings if they push back.
7. **App Store Connect record.** Create the app against the bundle ID, SKU `chatroute-ios`,
   primary language en-GB. Fill App Information, Pricing (free), App Privacy from `listing.md`.
8. **Build and upload.** From any machine (EAS builds in the cloud, no Mac needed for this step):
   ```bash
   eas build --platform ios --profile production
   ```
   ```bash
   eas submit --platform ios
   ```
   `eas submit` wants an App Store Connect API key (`eas credentials` → App Store Connect API Key)
   or an Apple ID login.
9. **TestFlight.** Internal testers (up to 100, no review) first. Install on a real iPhone and run
   sign-in, a thread, an attachment, a voice note, a push, and a magic link.
10. **Screenshots.** Need a Mac for simulator captures (`images.md`). If none is available, the
    fallback there is documented; do it knowingly.
11. **Submit for review** with the three demo accounts and the notes below. First review of a
    sign-in-gated business app typically takes 24–72 h.

## Per-release

```bash
pnpm release patch
```

```bash
git push --follow-tags
```

```bash
eas build --platform ios --profile production --auto-submit
```

`appVersionSource` is `local`, so `expo.version` in `app.json` is the marketing version; EAS
auto-increments `buildNumber` when `autoIncrement` is set on the profile. Add
`"autoIncrement": true` to the iOS production block so a resubmitted version does not collide.

## Review notes (paste into App Review Information → Notes)

```
ChatRoute is an internal support messenger used by organisations that run it. Accounts are created by an organisation Admin, so there is no sign-up screen in the app. Please use these test accounts with password sign-in:

Customer: <email> / <password>
Agent:    <email> / <password>
Admin:    <email> / <password>

Magic-link and Google sign-in are alternative routes to the same accounts; password sign-in reaches every screen. Two-factor is off on these accounts.

Account deletion: accounts are managed by the organisation's Admin. A person can request deletion at <URL or email>.

Camera, photo library and microphone are used only to attach a photo, a document or a voice note to a support conversation (see the purpose strings in Info.plist).
```

## Not done yet (mobile-side)

- No iOS push, no universal links, no device build profile, no CI job: items 3–5 above.
- `expo-navigation-bar` and the Android-only config plugins are harmless on iOS; the backup
  exclusion plugin writes the iOS `isExcludedFromBackup` flag too (ADR-0011).
- `userInterfaceStyle: light` is set, so no dark-mode screenshots are required and none should be
  submitted.
