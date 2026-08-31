/**
 * Where the API lives, and the refusal to guess when nobody said.
 *
 * A default here would be a trap: `localhost` is the phone itself, so a fallback
 * would build cleanly, install cleanly, and fail at the first request with a
 * connection error that says nothing about the missing configuration. Failing at
 * module load instead puts the explanation on screen before anything is typed.
 */

/**
 * Read literally, never through a computed key: Metro inlines
 * `process.env.EXPO_PUBLIC_*` at build time by textual substitution, so
 * `process.env[name]` would be `undefined` in a release bundle.
 */
const ENV_VAR = "EXPO_PUBLIC_API_URL";

const HINT =
  "Set it in .env — the Android emulator reaches the host at http://10.0.2.2:8080, " +
  "a physical device needs the host's LAN address.";

/**
 * Validate a configured base URL, or explain what is wrong with it.
 *
 * Matched with a pattern rather than `new URL`: React Native ships its own `URL`
 * shim whose constructor never throws for a single-argument call, so a check
 * built on `try { new URL(value) }` passes on device for input it rejects under
 * Node — the branch would only ever fire in Jest. This is deliberately loose
 * about the path; it only insists on the parts a device needs to reach a host.
 *
 * Returns the URL without a trailing slash, so callers can join paths with `+`.
 */
const ORIGIN = /^https?:\/\/[^/?#\s]+(\/[^?#\s]*)?$/i;

export function readApiBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? "";

  if (value === "") {
    throw new Error(`${ENV_VAR} is not set. ${HINT}`);
  }

  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      `${ENV_VAR} must be an http or https URL, not "${value}". ${HINT}`,
    );
  }

  if (!ORIGIN.test(value)) {
    throw new Error(`${ENV_VAR} is not a valid URL: "${value}". ${HINT}`);
  }

  return value.replace(/\/+$/, "");
}

/** Evaluated at import, so a missing value fails at startup rather than at first request. */
export const API_BASE_URL = readApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
