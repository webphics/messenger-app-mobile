# Internal Support Messenger (Expo)

iOS/Android client. Roles: Admin / Agent / Customer. This repo is Expo-only.

```bash
pnpm install
cp .env.example .env   # then point EXPO_PUBLIC_API_URL at your running API
pnpm expo start
```

`EXPO_PUBLIC_API_URL` is required — the app refuses to start without it rather than defaulting to an
address no device can reach. The Android emulator reaches the host at `http://10.0.2.2:8080`.

Signing in is real: the API verifies the password and the app stores the Session cookie in the device
keychain, replaying it by hand on every request the way the web client does. Role comes from the
server, not from the client. Conversations are still mock data. Scope: `docs/scope.md`. Credential
pattern: `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`.

There is also no password: **a magic link is how a Customer account comes into existence on mobile.**
The API has no registration endpoint, and verifying a first link is what creates the account — staff
accounts are made by an Admin on web. `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` says where the link in the
email points; leave it unset and the app uses its own scheme from `app.json`. Production wants an
HTTPS origin with app-link association files served from it, which cannot be arranged against
localhost — the in-app route that reads the token is the same either way, so that switch is
configuration and manifest work.

Testing the tap end to end needs a dev build: a custom scheme does not open from Expo&nbsp;Go, and
several mail clients decline to linkify a non-HTTPS scheme. Requesting a link works in Expo Go; with
no Brevo key configured the API prints the link to its own console, which is the quickest way to open
one by hand.

## Builds

`Actions → Build → Run workflow`, pick `android`, `ios`, or `both`. Manual only — nothing builds on push.

| | Where it runs | Output | Signing |
| --- | --- | --- | --- |
| Android | EAS Build (Expo's servers) | APK, from the EAS install page linked in the run summary | EAS-managed release keystore |
| iOS | `macos-latest` runner | `enki-unsigned.ipa`, attached to the run as an artifact | **Unsigned** |

The iOS IPA will not install via TestFlight or the App Store. Sideload it with AltStore or Sideloadly; on a free Apple ID the signature expires after 7 days. A signed build needs a paid Apple Developer account, at which point iOS should move to EAS too.

`pnpm build:apk` still builds an APK locally on Windows (needs JDK 17 + Android SDK) and is the escape hatch when the EAS quota runs out.

### Costs

Android costs ~1 GitHub minute per run plus one of the **15 free EAS Android builds/month** — no overage charges, the quota just resets on the 1st. iOS is the expensive one: `macos-latest` bills at **10×** on a private repo. A run measures ~13 minutes, so ~130 billable minutes — roughly 15 iOS builds against the 2,000 free monthly minutes.

### One-time setup

The EAS project (`extra.eas.projectId` in `app.json`) is already linked. Two steps remain, both interactive:

```bash
npm install --global eas-cli
eas login
eas build --platform android --profile preview
```

Answer *yes* to generate a keystore — EAS refuses to create one in `--non-interactive` mode, so CI cannot do this for you. Then add the CI token from **expo.dev → Account Settings → Access Tokens**:

```bash
gh secret set EXPO_TOKEN
```

A token in a local `.env` does not reach CI; it has to be a repository secret. Confirm with `gh secret list` before dispatching.
