# Internal Support Messenger (Expo)

iOS/Android client. Roles: Admin / Agent / Customer. This repo is Expo-only.

```bash
pnpm install
cp .env.example .env   # then point EXPO_PUBLIC_API_URL at your running API
pnpm expo start
```

`EXPO_PUBLIC_API_URL` is required — the app refuses to start without it rather than defaulting to an
address no device can reach. The Android emulator reaches the host at `http://10.0.2.2:8080`.

Signing in is real: the API verifies the password and the app stores the Session token in the device
keychain, sending it as `Authorization: Bearer`. Role comes from the server, not from the client.
Conversations are still mock data. Scope: `docs/scope.md`. Session transport:
`docs/adr/ADR-0004-bearer-sessions-on-mobile.md`.

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
