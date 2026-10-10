# Publishing to Google Play — checklist

What stands between the current build pipeline and a Play Store release. Facts come from the
README, `eas.json` and `credentials/README.md`; the order is the order the blockers bite.

## Today

- Builds: `pnpm build:apk:eas` / CI on a `chatroute-v*` tag produce an `arm64-v8a` **APK** signed
  with the **template debug keystore** (`credentials/debug.keystore`). That is internal
  distribution only. Play rejects debug-signed uploads and, for new apps, wants an **AAB**.
- Package: `com.thechatroute.app`. Version `1.0.5` in `app.json` (must match the release tag).
- Push: Android wired through Expo's push service; needs the FCM service-account key uploaded to EAS.
- Google sign-in: works only for builds signed with a SHA-1 registered on the Android OAuth client.

## Blockers, in order

1. **Upload keystore.** Generate a real keystore, keep its password out of git
   (`credentials.json` and `credentials/*.keystore` go into `.gitignore`), rebuild both files in
   CI from secrets, and register the new SHA-1 on the Android OAuth client or Google sign-in
   silently fails on every store build. All four steps are in `credentials/README.md`.
   Recommended: let Play App Signing hold the app signing key and use the new keystore as the
   _upload_ key only; then also register Play's **app signing** SHA-1 (shown in Play Console →
   Setup → App signing) on the OAuth client, because that is the certificate on the phone.
2. **AAB build profile.** Add a `store` profile to `eas.json`:
   ```json
   "store": {
     "extends": "production",
     "distribution": "store",
     "credentialsSource": "local",
     "android": { "buildType": "app-bundle" }
   }
   ```
   and drop the `gradleCommand` override so Gradle produces the bundle for every ABI.
3. **FCM key on EAS.** `eas credentials --platform android` → _Push Notifications: Manage your
   FCM Api Key_ → upload the service-account JSON from Firebase project `messenger-app-508309`.
   Without it registration succeeds and dispatch fails silently (README).
4. **Play Console record.** Create the app, package `com.thechatroute.app`, default language
   en-GB, app (not game), free. Set up _Play App Signing_ on first upload.
5. **Store listing.** `listing.md` copy, assets from `images.md`: icon 512, feature graphic
   1024 × 500, 2–8 phone screenshots, tablet screenshots if tablets stay targeted.
6. **App content.** Every declaration in `listing.md` → App content. App access needs the three
   demo accounts; Data safety needs the form filled as written there; privacy policy URL and an
   account-deletion request URL must exist and be public.
7. **Tracks.** Internal testing first (up to 100 testers, no review), then closed testing, then
   production. New personal developer accounts must run a closed test with 12+ testers for 14 days
   before production is unlocked; organisation accounts skip that.
8. **Release.** Upload the AAB, attach release notes from `listing.md`, roll out.

## Per-release

```bash
pnpm release patch
```

```bash
git push --follow-tags
```

Then build the store bundle (once the profile exists):

```bash
eas build --platform android --profile store
```

Submit with `eas submit --platform android` once a Play service-account JSON is configured, or
upload the AAB by hand in Play Console → Production → Create new release.

## Review notes (paste into App access)

```
ChatRoute is an internal support messenger; accounts are created by an organisation Admin, so there is no sign-up screen. Use these test accounts with password sign-in:

Customer: <email> / <password>
Agent:    <email> / <password>
Admin:    <email> / <password>

Magic-link and Google sign-in are alternatives to the password; the password route is enough to reach every screen. Two-factor is off on these accounts.
```

## Not done yet (mobile-side)

- Account deletion is Admin-only on web; Play's deletion-request URL must point at the web flow
  or a support address until a self-service path ships.
- `blockedPermissions` already excludes `READ_MEDIA_AUDIO`; review the permission list in the
  final manifest against the Play _Permissions declaration_ before upload.
