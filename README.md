# JoyChat mobile

The iOS and Android client for JoyChat, built with Expo. Three roles use it: Admin, Agent and
Customer. The developer console stays on web (`docs/adr/ADR-0014-the-developer-console-is-not-a-mobile-surface.md`).

```bash
pnpm install
cp .env.example .env   # then point EXPO_PUBLIC_API_URL at your running API
pnpm start
```

`EXPO_PUBLIC_API_URL` is required. The app refuses to start without it rather than defaulting to an
address no device can reach. The Android emulator reaches the host at `http://10.0.2.2:8080`; the
other cases are listed in `.env.example`.

## What works

- **Sign-in** by password, magic link or Google. The API verifies the credential, and the app keeps
  the Session cookie in the device keychain and replays it by hand on every request, the way the web
  client does. The role comes from the server, never from the client. See
  `docs/adr/ADR-0004-mirror-the-web-credential-pattern.md`.
- **Conversations** for every role: the list, threads, sending, unread counts and live delivery over
  Socket.IO. Staff also get Engage and Takeover, staff DMs and System notices.
- **The Store**, a SQLite database on the device holding Conversations, recent Messages and the
  Outbox. A cold start draws what the phone last knew before any request answers, and a phone with
  no signal still opens on its conversations. Signing out destroys it. See
  `docs/adr/ADR-0008-the-store-is-the-source-of-truth-except-for-assignment.md`.
- **Attachments**: photos, documents and voice notes, sent and received.
- **Account self-service** from Settings: active sessions, setting or changing a password, and
  two-factor sign-in, including turning it off and replacing backup codes. See ADR-0012 and ADR-0013.
- **Push notifications** on Android, in a development client or a release build.

Scope and phases: `docs/scope.md`. Architecture decisions: `docs/adr/`. Domain terms: `CONTEXT.md`.

## Checks

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

Typecheck needs Metro to have run once, because Metro generates `uniwind-types.d.ts` and the
expo-router typed routes. Run `pnpm start` first on a fresh clone.

## Accounts and magic links

There is no registration form. **A magic link or a first Google sign-in is how a Customer account
comes into existence on mobile.** The API has no registration endpoint, and verifying either one
creates the account. Staff accounts are made by an Admin on web.

`EXPO_PUBLIC_MAGIC_LINK_ORIGIN` says where the link in the email points. Leave it unset and the app
uses its own scheme from `app.json` (`joychat://`). Production wants an HTTPS origin with app-link
association files served from it, which cannot be arranged against localhost. The in-app route that
reads the token is the same either way, so that switch is configuration and manifest work.

Testing the tap end to end needs a development client. A custom scheme does not open from Expo Go,
and several mail clients decline to linkify a non-HTTPS scheme. Requesting a link works in Expo Go;
with no Brevo key configured, the API prints the link to its own console, which is the quickest way
to open one by hand.

## Expo Go and the development client

Google sign-in and push notifications need native modules, and native modules do not run in Expo Go.
Everything else runs in Expo Go.

| | Expo Go | Development client |
| --- | --- | --- |
| Password sign-in | yes | yes |
| Requesting a magic link | yes | yes |
| Opening a magic link (`joychat://`) | no | yes |
| Google sign-in | **no** | yes |
| Push notifications | **no** | yes |
| Everything after sign-in | yes | yes |

Build one and install it once. After that, `pnpm start` serves it the same way it serves Expo Go.

```bash
eas build --profile development --platform android
```

The `development` profile in `eas.json` sets `developmentClient: true` with internal distribution.
Android comes back as an APK from the EAS install page. On iOS the same profile builds for the
simulator; a device build needs an Apple Developer account and a device registered with
`eas device:create`.

## Google sign-in

### Configuration

Two OAuth clients from the Google Cloud console, both set in `.env`:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=…apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=…apps.googleusercontent.com
```

**The web one is not a new value to invent.** It is the same OAuth client the web app sets as
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` and the API verifies against as `GOOGLE_CLIENT_ID`. Copy it from
either. If the three ever disagree, mobile is the one that is wrong.

**A web client identifier in a mobile app is deliberate.** The API checks a Google ID token's
audience against that one client, and Google's native libraries mint the token with the web client
as the audience when given it. That is what lets mobile Google sign-in ship with no API change. Do
not remove it. Full reasoning: `docs/adr/ADR-0005-the-google-audience-arrangement.md`.

Leave either unset and the app still starts. The Google button is disabled and names the missing
variable, the same call the web app makes when its client id is absent. Set either to something
that is not a client identifier and the app refuses to start. Android runs on the web client alone;
iOS needs both, and until an iOS client exists the button is disabled there and says so.

### Android: the signing certificate fingerprint

Android's OAuth client is identified by the package name (`com.zeestglobal.joychat`) **plus the
SHA-1 of the certificate the build was signed with**. Every fingerprint that signs a build people
sign in from has to be registered against the Android OAuth client in the Google console. A build
signed with an unregistered certificate fails Google sign-in with nothing on screen to explain it.

Two certificates sign builds of this app:

| Build | Signed with | SHA-1 |
| --- | --- | --- |
| CI release, `pnpm build:apk`, `pnpm build:apk:eas`, `pnpm build:apk:emulator` | The Android template debug keystore, committed as `credentials/debug.keystore` | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| EAS cloud builds (`development`, `preview` profiles, `pnpm build:android`) | The keystore EAS holds for this project | Shown by `eas credentials --platform android` |

The first is already registered. Check the second before blaming anything else when Google sign-in
fails in a development client.

`google-services.json` is **not** part of sign-in. It is the Firebase config for push, its
`oauth_client` array is empty, and nothing in the sign-in path reads it. The root copy is tracked on
purpose: EAS builds from a git archive, so an untracked file never reaches the build and Android
push would lose its configuration there while working on your machine. It carries no secret; a
Firebase Android API key is an identifier restricted by package name and SHA-1, and it ships inside
the APK either way. The copy under `android/app/` is generated and ignored with the rest of
`android/`.

### iOS: the client, and the plist you do not need

An iOS OAuth client is created against the **bundle identifier**, and that is all it needs. The
config plugin takes `iosUrlScheme` (the client id reversed, which `app.config.js` derives), and that
selects its without-Firebase path, which writes to `Info.plist` and nothing else. So:

- **No `GoogleService-Info.plist`.** Adding one configures a Firebase iOS app that nothing here reads.
- **No `ios/` directory.** It is generated at build time like `android/`.
- **No API change.** The token's audience is still the web client (ADR-0005).

Settle two things before creating the client, because both are expensive to change afterwards. The
bundle identifier is `com.zeestglobal.joychat`; once it exists in the Apple Developer portal and an
OAuth client, changing it means a new OAuth client, a new Firebase Android app and a new App Store
record. And `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` goes into `eas.json` only once there is a real value
for it. EAS rejects an empty string in an `env` block, and an absent variable is already what the
app reads as "no iOS client".

## Push notifications

`expo-notifications` is a native module, so push needs a development client or a release build.
Expo Go has carried no remote push since SDK 53, so there no token is read and no device is
registered, and the rest of the app works as before.

Only Android is wired. APNs needs an Apple Developer account. Nothing in the client is
Android-specific; iOS needs a key uploaded to Expo and a device build profile.

Dispatch goes through Expo's push service, so the EAS project needs FCM credentials before a
notification reaches a phone. Run `eas credentials --platform android`, pick *Push Notifications:
Manage your FCM Api Key*, and upload the service-account key from Firebase project
`messenger-app-508309`. Without it a token still reads and still registers; the dispatch fails at
Expo, with nothing on the phone to say so.

The API side is `POST /push/devices`, documented in the API repo's `docs/api/push.md`. For why
mobile has a transport of its own rather than the browser subscription route, see
`docs/adr/ADR-0009-mobile-push-is-a-second-transport.md`.

## Builds

### CI: the Android Release workflow

`.github/workflows/android-release.yml` builds a release APK on every push to `main`, `dev` and
`release`, and can be run by hand from *Actions → Android Release → Run workflow*. The manual run
takes an optional version override and a *dry run* switch that builds without publishing.

The branch picks the GitHub environment the build reads its values from, and where the APK goes:

| Branch | Environment | Release tag | Pre-release |
| --- | --- | --- | --- |
| `main` | Production | `joychat-v<version>` | no |
| `dev` | Development | `joychat-development-v<version>` | yes |
| `release` | Release | `joychat-release-v<version>` | yes |
| any other (manual run) | Development | none, nothing is published | |

Each published run attaches `joychat-release.apk` to a GitHub Release and uploads the same file to
the project's builds page on expo.dev. The version comes from `expo.version` in `app.json`. A push
that does not bump it replaces the APK on the existing tag.

The build runs `eas build --platform android --profile production --local` on an `ubuntu-latest`
runner, which is the same command as `pnpm build:apk:eas`. It uses no EAS build credits, but the NDK
compile takes tens of minutes; `~/.gradle` is cached between runs. The APK is `arm64-v8a` only,
signed with the template debug keystore (see the fingerprint table above). That is fine for
internal distribution and sideloading, and it cannot go to the Play Store. What moving to a real
upload keystore involves is in `credentials/README.md`.

There is no iOS build in CI.

### CI setup

Each of the three environments (Production, Development, Release) needs:

| Name | Kind | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | variable | Required. The run fails in its first minute without it. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | variable | Optional. Without it the build succeeds and Google sign-in is disabled. |
| `EXPO_TOKEN` | secret | From *expo.dev → Account Settings → Access Tokens*. |

```bash
gh variable set EXPO_PUBLIC_API_URL --env Production
gh variable set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --env Production
gh secret set EXPO_TOKEN --env Production
```

Repeat for `Development` and `Release`, and confirm with `gh variable list --env <environment>` and
`gh secret list --env <environment>` before pushing to that branch. A value in a local `.env` does
not reach CI. The workflow writes the environment's variables into the `production` profile of
`eas.json` before it builds, because EAS lays a profile's `env` over the runner's.

The two `EXPO_PUBLIC_*` values are variables rather than secrets because Metro inlines them into
the shipped bundle, so anyone holding the APK can read them anyway.

### Local builds

| Command | Where it builds | Output |
| --- | --- | --- |
| `pnpm build:apk` | Gradle on this machine. Windows, needs JDK 17 and the Android SDK. | `dist/joychat-release.apk`, `arm64-v8a` + `x86_64` |
| `pnpm build:apk:eas` | EAS local build, same as CI. Builds `HEAD`, not the working tree. | `dist/joychat-release.apk`, `arm64-v8a` |
| `pnpm build:apk:emulator` | EAS local build, `emulator` profile | `dist/joychat-emulator.apk`, `arm64-v8a` + `x86_64` |
| `pnpm build:android` | EAS cloud, `preview` profile. Uses a build credit. | APK on the EAS install page |

An `arm64-v8a`-only APK crashes on launch on an x86_64 emulator. Use `pnpm build:apk` or
`pnpm build:apk:emulator` for an emulator. Set `ANDROID_ABIS` to override the ABIs `pnpm build:apk`
builds.

### Native configuration

`app.json`, `app.config.js` and `plugins/` are the native project. `android/` and `ios/` are
generated from them and gitignored. A change to any of them reaches a phone only through a build
(`pnpm build:apk --prebuild`, or a fresh development client), so nothing in `plugins/` takes effect
on a running Metro. That includes the backup rules keeping the Store out of a device backup
(ADR-0011): the exclusion is real in the build, not in the bundle.
