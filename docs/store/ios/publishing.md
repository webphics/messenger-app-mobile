# Publishing to the App Store — checklist

What stands between the current state and an App Store release. iOS is further from shipping
than Android: Sign in with Apple is not configured on the API, there are no universal links, and
there is no Mac in the loop. Releases build and
upload through `.github/workflows/ios-release.yml` (1.0.25 reached App Store Connect that way on
2026-11-04). Facts come
from the README, `eas.json`, `app.json` and `app.config.js`.

## Account

The Apple Developer Program membership is a **personal (individual) account**. That decides three
things:

- **Seller name.** The App Store shows the account holder's legal name, not Zeest Global or
  ChatRoute. App Review rarely objects for a support messenger, but say in the review notes that
  the app is operated by the account holder for the organisations that use it.
- **EU trader status (DSA).** App Store Connect asks for it before the app can be offered in the
  EU. Declaring as a trader publishes the account holder's name, address, phone and email on the
  EU storefront. The alternatives are declaring non-trader, which fits only while the app earns
  nothing, or leaving the EU out of Availability.
- **Moving to an organisation later.** Two routes, and they are not equal for this app:
  - _Convert the membership_ (Apple Developer support, needs a D-U-N-S number). The Team ID stays
    the same, so nothing in the app or the API changes. **Prefer this one.**
  - _Transfer the app_ to a new organisation account. The Team ID changes, and Sign in with Apple
    user identifiers are scoped to the team: every Apple-linked user would get a new `sub`. The API
    would have to migrate them with Apple's transfer identifiers within 60 days of the transfer, or
    those people lose their accounts. `APPLE_TEAM_ID` and the keys would change too.

## Today

- Bundle ID `com.thechatroute.app`, `supportsTablet: false` (no iPad screenshots needed),
  `userInterfaceStyle: light`, version from `app.json`.
- `buildNumber` is derived from `expo.version` in `app.config.js` (`1.0.25` → `1000025`), the same
  way Android's `versionCode` is. Every upload therefore needs a version bump (`pnpm release`);
  App Store Connect refuses a build number it has seen.
- `eas.json`: the `store` profile (extends `production`, `distribution: store`) is the one that
  builds for App Store Connect. `production` itself is `distribution: internal`, which on iOS is an
  ad hoc build for registered devices only. `development` builds a simulator binary only.
- Sign in with Apple: `usesAppleSignIn: true` and the `expo-apple-authentication` plugin are set.
  The API verifies the token with the bundle ID as audience and revokes the Apple token when an
  account is deleted (`api/src/modules/auth/apple-sign-in.ts`), which Apple requires. It needs
  `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` set on the production
  API (Coolify). They were set on 2026-11-04: `POST /auth/apple/nonce` answered `503
  apple_sign_in_unavailable` that morning and `200` from 13:27 UTC. A real sign-in on an iPhone,
  then deleting that account, is what proves the key ID, team and key match.
- Apple team: `6X9889N2PN`, an individual team. That is the `APPLE_TEAM_ID` and the prefix in
  `apple-app-site-association`.
- Google sign-in: the iOS OAuth client is in every `env` block; the URL scheme is derived in
  `app.config.js`. No `GoogleService-Info.plist` is needed (README).
- Export compliance: `ITSAppUsesNonExemptEncryption: false` is set, so App Store Connect does not
  ask per build.
- Push: the `expo-notifications` plugin is configured, the client code is platform-neutral, and the
  APNs key `5G966TT6FT` is on EAS (uploaded 2026-11-03). Not yet tested on a real iPhone.
- Signing: the App Store distribution certificate and provisioning profile are on EAS and valid
  until 2027-11-03. Renew them before then with `eas credentials --platform ios`.
- Magic links: production wants an HTTPS universal-link origin with an `apple-app-site-association`
  file served from it (`EXPO_PUBLIC_MAGIC_LINK_ORIGIN`, README). Today the link uses the
  `chatroute://` scheme, which iOS Mail will not linkify.
- Account deletion (guideline 5.1.1(v)): Settings → Account → _Delete account_, for every role
  (`app/account/delete.tsx`, `POST /auth/delete-account`).

## Blockers, in order

1. **Sign in with Apple on the API.** In the developer portal (Certificates, Identifiers &
   Profiles → Keys), use a key with _Sign in with Apple_ enabled and configured against the
   `com.thechatroute.app` App ID. That can be the APNs key `5G966TT6FT` if Sign in with Apple is
   ticked on it; otherwise create one. Then set on the production API in Coolify and redeploy:
   - `APPLE_CLIENT_ID=com.thechatroute.app`
   - `APPLE_TEAM_ID=6X9889N2PN`
   - `APPLE_KEY_ID=<the key's ID>`
   - `APPLE_PRIVATE_KEY=<the .p8 contents, one line with \n for line breaks>` (see
     `api/.env.example`)
   Check it: `POST /auth/apple/nonce` (with a CSRF token from `GET /csrf`) answers `200` instead
   of `503`. Apple shows a `.p8` once. Keep it somewhere other than this repo.
2. **Credentials on EAS.** Done: distribution certificate, App Store profile and APNs key. EAS
   syncs the bundle ID's capabilities (Push Notifications, Sign in with Apple, Associated Domains
   once step 4 adds it) from the build's entitlements.
3. **Google OAuth.** Confirm the iOS OAuth client in Google Cloud project `chat-route-official`
   has bundle ID `com.thechatroute.app`, and add the Team ID to it if the console asks.
4. **Universal links.** Serve `/.well-known/apple-app-site-association` from the magic-link origin
   with `<TeamID>.com.thechatroute.app`, add `ios.associatedDomains` (`applinks:<host>`) to
   `app.json`, and set the GitHub `Production` variable `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` to that HTTPS origin. Without it, magic-link
   sign-in works on iOS only by pasting the link; the reviewer gets password accounts regardless.
5. **App Store Connect record.** Create the app against the bundle ID, SKU `chatroute-ios`,
   primary language en-GB. Fill:
   - App Information: category, age rating questionnaire, content rights.
   - Pricing and Availability (free), and the EU trader declaration from _Account_ above.
   - App Privacy from `listing.md`: the data the app collects and that none of it tracks.
   - Privacy policy URL and support URL.
6. **Build and upload.** From any machine (EAS builds in the cloud, no Mac needed):
   ```bash
   eas build --platform ios --profile store
   ```
   ```bash
   eas submit --platform ios
   ```
   `eas submit` wants an App Store Connect API key (`eas credentials` → App Store Connect API Key,
   created under Users and Access → Integrations) or an Apple ID login. An API key avoids the
   two-factor prompt on every submit.
7. **TestFlight.** Internal testers (up to 100, no review) first. Install on a real iPhone and run
   password, magic-link, Google and Apple sign-in, a thread, an attachment, a voice note, a push
   (the simulator receives no remote push), and account deletion with an Apple-linked account.
8. **Screenshots.** 6.9" iPhone set (1320×2868 or 1290×2796). Needs a Mac or simulator for
   captures (`images.md`). If none is available, the fallback there is documented; do it
   knowingly. Then restore the _Built to be reachable_ paragraph and the push screenshot in
   `listing.md` / `images.md` once push works.
9. **Submit for review** with the demo accounts and the notes below. No tester count or waiting
   period applies, unlike Play. First review of a sign-in-gated business app typically takes
   24–72 h; each rejection adds another 1–2 days.

## Per-release

```bash
pnpm release patch
```

```bash
git push --follow-tags
```

```bash
eas build --platform ios --profile store --auto-submit
```

`appVersionSource` is `local`, so `expo.version` in `app.json` is the marketing version and
`app.config.js` derives `buildNumber` from it. A rejected build is replaced by bumping the version
again, not by rebuilding the same one.

## Review notes (paste into App Review Information → Notes)

```
ChatRoute is a support messenger used by organisations that run it. People can sign up in the app, but a new account belongs to no organisation until one invites it, so please use these test accounts with password sign-in to see every screen:

Customer: <email> / <password>
Agent:    <email> / <password>
Admin:    <email> / <password>

Magic-link, Google and Sign in with Apple are alternative routes to the same accounts; password sign-in reaches every screen. Two-factor is off on these accounts.

Conversations are between a customer and the staff of an organisation they belong to; people cannot message strangers. Staff can close a conversation and Admins can ban an account.

Account deletion: Settings > Account > Delete account deletes the signed-in account after a confirmation, for every role. Please test it with this spare account rather than the three above:

Spare customer: <email> / <password>

The same is available without the app at https://thechatroute.com/delete-account.

Camera, photo library and microphone are used only to attach a photo, a document or a voice note to a conversation or a post (see the purpose strings in Info.plist).
```

## Not done yet (mobile-side)

- Sign in with Apple on the production API and universal links: steps 1 and 4 above. Signing
  credentials, the APNs key and the App Store Connect API key in the GitHub `Production`
  environment are done.
- Both release workflows pass `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` from the GitHub environment into the
  build when it is set. `Production` sets `chatroute://`, the same as the app's fallback, so step 4
  is a change to that variable plus the entitlement and the association file.
- `expo-navigation-bar` and the Android-only config plugins are harmless on iOS; the backup
  exclusion plugin writes the iOS `isExcludedFromBackup` flag too (ADR-0011).
- `userInterfaceStyle: light` is set, so no dark-mode screenshots are required and none should be
  submitted.
