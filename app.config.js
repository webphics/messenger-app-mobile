/**
 * The half of the app config that cannot be static.
 *
 * Everything else stays in `app.json`; Expo reads that first and hands it here
 * as `config`, so this file is only the plugin that needs a value from `.env`.
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
 */

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

module.exports = ({ config }) => {
  const scheme = iosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(scheme
        ? [["@react-native-google-signin/google-signin", { iosUrlScheme: scheme }]]
        : []),
    ],
  };
};
