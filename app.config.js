/**
 * The half of the app config that cannot be static.
 *
 * Everything else stays in `app.json`; Expo reads that first and hands it here
 * as `config`, so this file is only the plugin that needs a value from `.env`.
 *
 * ## `slug` is not an ordinary field
 *
 * It is bound to the EAS project in `extra.eas.projectId` for that project's
 * whole life — https://expo.fyi/eas-project-id — so the two move together or
 * not at all. `eas build` refuses outright when they disagree, and so does
 * `eas project:info`, which is how an earlier half-done rename was caught: the
 * slug changed here and the project on expo.dev still had the old one.
 *
 * Each rename has been settled by creating a new project. The current one is
 * `@webphics/chatroute`, created on 2026-10-03. A new project starts with none of the old one's credentials: no
 * remote Android keystore, so a build signed on EAS gets a new SHA-1 that the
 * Android OAuth client and Firebase have to be told about, and no FCM V1 key,
 * so Expo cannot deliver push until one is uploaded with `eas credentials`.
 * Push tokens are scoped to the project too, so an install built against the
 * old one stops receiving push until it is replaced by a new build. Editing
 * this field later is that decision, whether or not it looks like one.
 *
 * The package name and bundle identifier, `com.zeestglobal.chatroute`, are a
 * separate decision with a bigger bill. Firebase and the OAuth clients are
 * registered against them, and a phone treats a new one as a different app: it
 * installs beside the old one rather than upgrading it, with an empty keystore
 * and an empty Store. The name a person sees is `name` in `app.json`; the slug
 * only ever shows on expo.dev.
 *
 * ## Why this exists
 *
 * Google's iOS SDK completes the sign-in by reopening the app on a URL scheme
 * derived from the iOS OAuth client — the client identifier with its two halves
 * reversed. That scheme has to be in the Info.plist at build time, and the
 * identifier is configuration rather than something committed, which is exactly
 * the case `app.json` cannot serve.
 *
 * ## Why it is conditional
 *
 * A checkout with no Google credentials still has to run. The plugin is added
 * only when there is an iOS client to derive a scheme from, so `expo start`
 * against Expo Go works on a machine that has never seen these variables — see
 * the README on what does and does not need the dev client.
 *
 * Android needs nothing here: its native flow is identified by the package name
 * plus the signing certificate fingerprint registered against the Android OAuth
 * client, neither of which lives in the bundle. That fingerprint is the one
 * piece of this feature no build can check for you — see the README.
 *
 * ## And why Firebase joined it
 *
 * Push needs `google-services.json` in the native project, and it is the same
 * shape of problem for the same reason: it comes from a console rather than
 * from the repo, and a checkout without it still has to run. Naming it
 * unconditionally in `app.json` would fail every prebuild on a machine that has
 * never set FCM up — including a checkout that only wants Expo Go, where push
 * does not work anyway. So it is named only when it is there.
 */

const { existsSync } = require("node:fs");
const { join } = require("node:path");

/**
 * `123-abc.apps.googleusercontent.com` becomes
 * `com.googleusercontent.apps.123-abc`, which is what Google registers as the
 * iOS client's redirect scheme.
 *
 * Duplicated from `lib/google-config` rather than imported: this file is CommonJS
 * evaluated by the Expo CLI outside Metro, so it cannot read the app's TypeScript.
 * The shape is fixed by Google, and the config plugin rejects a scheme that does
 * not start with `com.googleusercontent.apps.` — so a wrong value here fails the
 * build rather than shipping.
 */
function iosUrlScheme(clientId) {
  const trimmed = clientId?.trim();
  if (!trimmed) return null;

  const suffix = ".apps.googleusercontent.com";
  return trimmed.endsWith(suffix)
    ? `com.googleusercontent.apps.${trimmed.slice(0, -suffix.length)}`
    : null;
}

/**
 * The Firebase config, if this checkout has one.
 *
 * Resolved against this file rather than the working directory, because the
 * Expo CLI does not promise to be run from the project root.
 */
function googleServicesFile() {
  const relative = "./google-services.json";
  return existsSync(join(__dirname, relative)) ? relative : undefined;
}

module.exports = ({ config }) => {
  const scheme = iosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const services = googleServicesFile();

  return {
    ...config,
    android: {
      ...config.android,
      // Spread conditionally: an explicit `undefined` is a key Expo's schema
      // sees, and it reads it as a path that is empty rather than absent.
      ...(services ? { googleServicesFile: services } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(scheme
        ? [["@react-native-google-signin/google-signin", { iosUrlScheme: scheme }]]
        : []),
    ],
  };
};
