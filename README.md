# Internal Support Messenger (Expo)

iOS/Android client. Roles: Admin / Agent / Customer. This repo is Expo-only.

```bash
pnpm install
cp .env.example .env   # then point EXPO_PUBLIC_API_URL at your running API
pnpm expo start
```

`EXPO_PUBLIC_API_URL` is required — the app refuses to start without it rather than defaulting to an
address no device can reach. The Android emulator reaches the host at `http://10.0.2.2:8080`.

Signing in is real, three ways — password, magic link, and Google. The API verifies the credential
and the app stores the Session cookie in the device keychain, replaying it by hand on every request
the way the web client does. Role comes from the server, not from the client. Conversations are real — the list, the threads,
sending, unread and live delivery over Socket.IO — and the Conversation list is kept in a SQLite
Store on the device, so a cold start draws what this phone last knew before any request answers and
a phone with no signal still opens on its conversations. Scope: `docs/scope.md`. Credential
pattern: `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`. Where the screens read from:
`docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`.

There is no registration form: **a magic link or a first Google sign-in is how a Customer account
comes into existence on mobile.** The API has no registration endpoint, and verifying either is what
creates the account — staff accounts are made by an Admin on web. `EXPO_PUBLIC_MAGIC_LINK_ORIGIN` says where the link in the
email points; leave it unset and the app uses its own scheme from `app.json`. Production wants an
HTTPS origin with app-link association files served from it, which cannot be arranged against
localhost — the in-app route that reads the token is the same either way, so that switch is
configuration and manifest work.

Testing the tap end to end needs a development client: a custom scheme does not open from Expo&nbsp;Go, and
several mail clients decline to linkify a non-HTTPS scheme. Requesting a link works in Expo Go; with
no Brevo key configured the API prints the link to its own console, which is the quickest way to open
one by hand.

## Google sign-in, and the development client

Google sign-in is the third way in, and it is the reason this project no longer develops entirely in
Expo&nbsp;Go. It needs a native module, native modules do not run in Expo&nbsp;Go, so **exercising
sign-in needs a development client installed on the device**. Everything else — every other screen in
the app — still runs in Expo&nbsp;Go exactly as it did.

| | Expo Go | Development client |
| --- | --- | --- |
| Password sign-in | yes | yes |
| Requesting a magic link | yes | yes |
| Opening a magic link (`enki://`) | no | yes |
| Google sign-in | **no** | yes |
| Push notifications | **no** | yes |
| Everything after sign-in | yes | yes |

Build one and install it once; after that `pnpm start` serves it the same way it serves Expo Go.

```bash
eas build --profile development --platform android
```

Use `--platform ios` for iOS. The `development` profile in `eas.json` is internal-distribution with
`developmentClient: true`; Android comes back as an APK from the EAS install page, iOS needs a device
registered with `eas device:create` first.

### Configuration

Two OAuth clients from the Google Cloud console, both supplied by `.env`:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=…apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=…apps.googleusercontent.com
```

**The web one is not a new value to invent.** It is the same OAuth client the web client sets as
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` and the API verifies against as `GOOGLE_CLIENT_ID` — copy it from
either. If the three ever disagree, mobile is the one that is wrong.

**And a web client identifier in a mobile app is deliberate.** The API verifies a Google ID token's
audience against that one client, and Google's native libraries mint the token with the web client as
the audience when given it — which is what lets mobile Google sign-in ship with no API change. Do not
remove it. Full reasoning:
`docs/adr/ADR-0005-the-google-audience-arrangement.md`.

Leave either unset and the app still starts — the Google button is disabled and names the variable
that is missing. That is the same call the web client makes: its client id is `.optional()` where the
API URL is required, and it renders no Google section without one. Set either to something that is
*not* a client identifier and the app refuses to start, because there is no honest reading of a
malformed one. Android runs on the web client alone; iOS needs both, and until an iOS client exists
the button is disabled there and says so.

### Android: the signing certificate fingerprint

Android's OAuth client is identified by the app's package name **plus the SHA-1 fingerprint of the
certificate the build was signed with**. That fingerprint has to be registered against the Android
OAuth client in the Google console, and the certificate belongs to EAS:

```bash
eas credentials --platform android
```

Read the SHA-1 from the keystore it shows and add it to the Android OAuth client. This is worth doing
before writing anything else off as broken: a build signed with different credentials — a different
machine, a rotated keystore, a local `pnpm build:apk` — produces a Google sign-in that fails with
nothing on screen to explain it, because there is nothing to say.

`google-services.json` is **not** part of this. It is the Firebase config for push, its `oauth_client`
array is empty, and nothing in the sign-in path reads it. The root copy is tracked deliberately — EAS
builds from a git archive, so a file left untracked never reaches the build server and Android push
loses its configuration on cloud builds while working perfectly on your machine. It carries no secret:
a Firebase Android API key is an identifier restricted by package name and SHA-1, and it ships inside
the APK either way. The copy under `android/app/` is generated and stays ignored with the rest of
`android/`.

### iOS: the client, and the plist you do not need

An iOS OAuth client is created against the **bundle identifier**, and that is the whole of it. The
config plugin takes `iosUrlScheme` — the client id reversed, which `app.config.js` derives — and that
selects its without-Firebase path, which writes to `Info.plist` and nothing else. So:

- **No `GoogleService-Info.plist`.** Adding one configures a Firebase iOS app that nothing here reads.
- **No `ios/` directory.** It is generated at build time like `android/`.
- **No API change.** The token's audience is still the web client — see ADR-0005.

Two things are worth settling before the client is created, because both are expensive afterwards.
The bundle identifier is still `com.anonymous.enki`, the `create-expo-app` placeholder; once it exists
in the Apple Developer portal and an OAuth client, changing it means a new OAuth client, a new
Firebase Android app, and a new App Store record. And `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` goes into
`eas.json` only once there is a real value for it — EAS rejects an empty string in an `env` block
outright, and an absent variable is already what the app reads as “no iOS client”.

## Push notifications

`expo-notifications` is a native module too, so a Push notification is the second thing that needs a
development client. Everything around it degrades rather than breaks: Expo&nbsp;Go has carried no
remote push since SDK&nbsp;53, so no token can be read there, no device is registered, and the app is
exactly the app it is without any of this.

Android is the only platform wired — there is no iOS build profile in this repo and APNs needs an
Apple Developer account. Nothing in the client is Android-specific; iOS is a key uploaded to Expo and
a build profile.

Dispatch goes through Expo's push service, so the EAS project needs FCM credentials before a
notification reaches a phone:

```bash
eas credentials --platform android
```

Pick *Push Notifications: Manage your FCM Api Key* and upload the service-account key from the
Firebase project. Without it a token still reads and still registers — the dispatch is what fails,
at Expo, with nothing on the phone to say so.

The API side is `POST /push/devices`; see the API repo's `docs/api/push.md`, and
`docs/adr/ADR-0009-mobile-push-is-a-second-transport.md` for why mobile has a transport of its own
rather than the browser subscription route beside it.

## Builds

`Actions → Build → Run workflow`, pick `android`, `ios`, or `both`. Manual only — nothing builds on push.

| | Where it runs | Output | Signing |
| --- | --- | --- | --- |
| Android | EAS Build (Expo's servers) | APK, from the EAS install page linked in the run summary | EAS-managed release keystore |
| iOS | `macos-latest` runner | `enki-unsigned.ipa`, attached to the run as an artifact | **Unsigned** |

The iOS IPA will not install via TestFlight or the App Store. Sideload it with AltStore or Sideloadly; on a free Apple ID the signature expires after 7 days. A signed build needs a paid Apple Developer account, at which point iOS should move to EAS too.

`pnpm build:apk` still builds an APK locally on Windows (needs JDK 17 + Android SDK) and is the escape hatch when the EAS quota runs out.

### Native configuration

`app.json` and `plugins/` are the native project; `android/` and `ios/` are generated from them and
gitignored. A change to either only reaches a phone through a build — `pnpm build:apk --prebuild`, or
a fresh development client — so nothing in `plugins/` takes effect on a running Metro. That includes
the backup rules keeping the Store out of a device backup (ADR-0011): the exclusion is real in the
build, not in the bundle.

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
