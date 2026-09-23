# Signing material for `eas build --local`

`credentials/debug.keystore` is the **Android template debug keystore** — the fixed,
publicly known key that `expo prebuild` writes to `android/app/debug.keystore`, byte
for byte. Its fingerprint is

    SHA1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25

which is the same debug fingerprint every React Native project has, and the one
registered against this app's Android OAuth client. Nothing here is a secret, which
is why it and `credentials.json` are committed rather than ignored.

## Why it is committed at all

`android/` is gitignored, and `eas build --local` builds from a git archive, so
`android/app/debug.keystore` does not exist at the moment EAS resolves credentials —
it is written later, by the prebuild EAS runs inside the build. A committed copy is
what makes `--non-interactive` possible: without a credentials source, EAS aborts
with "Generating a new Keystore is not supported in --non-interactive mode", and with
the default `remote` source it would sign with whatever keystore sits on the EAS
servers for this project, under a **different SHA-1**, which breaks Google sign-in.

`eas.json`'s `production` profile sets `"credentialsSource": "local"` to point at it.

## What this is not

This is the same debug-signed, internal-distribution APK the Gradle pipeline produced
before, and it still cannot go to the Play Store. A real upload keystore is a
different arrangement, and switching to one means **all** of:

1. Generating the keystore yourself and choosing its passwords.
2. Adding `credentials.json` and `credentials/*.keystore` to `.gitignore` — a real
   keystore password must not be committed.
3. Rebuilding both files in CI from repository secrets before `eas build` runs.
4. Registering the new SHA-1 against the Android OAuth client, or Google sign-in
   stops working on every build signed with it.
