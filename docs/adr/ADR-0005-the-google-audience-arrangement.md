# The Google audience arrangement

Google sign-in on mobile configures the native library with a **web** OAuth client identifier
alongside the platform one. This looks like a mistake. It is not, and it is the whole reason mobile
Google sign-in ships without an API change.

The API verifies a Google ID token by checking its `aud` claim against exactly one configured
client — `GOOGLE_CLIENT_ID`, which is the web one. It has to be the web one twice over: Better Auth
registers the Google provider only when a client **id and secret** are both configured
(`auth.factory.ts`), and a native OAuth client has no secret; and the same API serves the web
client, which signs in against that identifier. A token minted for the iOS or Android client would
carry that native client as its audience and be refused by `verifyGoogleIdTokenWithClockSkew`.

Google's native sign-in libraries accept the web client identifier in addition to the platform one,
and when given it they mint the ID token with the **web client as the audience**. That is precisely
the value the API already verifies against. So the device produces a token that validates against
the server's existing configuration, unchanged.

The alternative was to widen the API's accepted audience to a list — the web client plus an iOS
client plus an Android client — and it was rejected. It buys nothing the arrangement above does not
already give, and it costs a coordinated server release for a mobile feature, three secrets to keep
in step instead of one, and a verification step that is permanently harder to reason about.

## Consequences

- **The API is unchanged.** Nothing added, nothing waived, nothing configured. This is the point of
  the decision and the reason to prefer it — mobile Google sign-in is a client release.
- **The web client identifier must stay in the mobile configuration.** It looks wrong, so it is
  commented where it is configured (`lib/google-config.ts`, `lib/google-session.ts`,
  `.env.example`) and not only here, because an ADR is not read during a refactor. Removing it does
  not break the build or the account sheet; it breaks verification, several steps later, in a way
  that reads as a credential problem.
- **iOS additionally needs its own client**, for the native flow and for the reversed URL scheme
  `app.config.js` writes into the Info.plist. Android needs no identifier in the bundle at all: it
  is identified by package name plus the **signing certificate SHA-1 fingerprint** registered
  against the Android OAuth client. A build signed with different credentials — a different machine,
  a rotated EAS keystore — produces a sign-in that fails with nothing on screen to explain it. See
  the README.
- **This is the arrangement's only proof.** It can only be confirmed against a real Google-issued
  token on a device; no test in either repo can check it. If it ever stops holding, the answer is to
  reopen the question, not to widen the audience on the server.
- **Google is a second account-creation path.** Verifying a first Google identity creates a Customer
  account, the same way verifying a first magic link does. The product stance is unchanged — there
  is still no registration endpoint and no registration form — but there are now two ways in, and
  `docs/scope.md` names both.
