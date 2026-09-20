import Constants from "expo-constants";

/**
 * Where the link in the sign-in email points.
 *
 * The API builds the link as `${origin}/auth/magic-link?token=…` from whatever
 * origin this client hands it (`magic-link-mail.ts`), so the origin is the whole
 * of what is configurable and the path is fixed on both sides. That split is
 * deliberate: the production answer is a real HTTPS domain with app-link
 * association files served from it, and the custom scheme is what is wired now —
 * but the route that reads the token is the same one either way, so moving
 * between them is a value in `.env` and a manifest, never a rewrite.
 *
 * Unlike `lib/api-config` this refuses to take the app down when it is unset.
 * The API's address is load-bearing for every screen, so failing at import is a
 * service; the link origin is load-bearing for one flow, and ending password
 * sign-in over the second line of a `.env` would be the worse trade. It reports
 * null instead, and the sign-in screen says so rather than sending a link that
 * opens nothing.
 */

/**
 * Read literally, never through a computed key: Metro inlines
 * `process.env.EXPO_PUBLIC_*` by textual substitution at build time, so
 * `process.env[name]` is `undefined` in a release bundle.
 */
const ENV_VAR = "EXPO_PUBLIC_MAGIC_LINK_ORIGIN";

/**
 * The path the API appends, and so the route in this app that has to answer to
 * it. Fixed here because the API fixes it — see `buildVerificationUrl`.
 */
export const MAGIC_LINK_PATH = "/auth/magic-link";

/** The query parameter the token arrives in, on the link and on the verify call. */
export const MAGIC_LINK_TOKEN_PARAM = "token";

/**
 * An origin has to carry a scheme and the `//` that starts an authority, and
 * nothing more: `joychat://` is as valid a target as `https://app.example.com`, and
 * insisting on a host would rule out the custom scheme this ships with. What it
 * must not be is a bare host or a path — those produce a link no OS will route.
 */
const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^\s?#]*$/i;

/**
 * Trailing slashes are stripped the way the API strips them, rather than merely
 * tidily, so `magicLinkUrl` below predicts the link that is actually sent. It is
 * why `joychat://` normalises to `joychat:` and the link reads `joychat:/auth/magic-link`
 * — one slash, an empty authority, which every deep-link parser in the path
 * treats as the same route as two.
 */
function normalise(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/**
 * The configured origin, the app's own scheme when nothing is configured, or
 * null when neither can answer.
 *
 * The scheme fallback is read from the app config rather than written here, so
 * there is still no origin hardcoded in this client — renaming the scheme in
 * `app.json` moves the link with it.
 */
export function readMagicLinkOrigin(
  configured: string | undefined,
  scheme: string | string[] | undefined | null,
): string | null {
  const value = configured?.trim() ?? "";
  if (value !== "") return ORIGIN.test(value) ? normalise(value) : null;

  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  const trimmed = first?.trim() ?? "";
  return trimmed === "" ? null : normalise(`${trimmed}://`);
}

/**
 * The link the API will send for a token, given an origin. Mirrors
 * `buildVerificationUrl` in the API's `magic-link-mail.ts`.
 *
 * Nothing in the app builds a magic link — the API does — so the only caller is
 * the contract test beside this file, and that is the point of it. The join
 * between what this client sends as an origin, what the API appends to it, and
 * what expo-router turns the result back into is the one part of this feature
 * that no single repo can check on its own, and where a wrong value looks
 * perfectly fine and opens nothing. Written down here, it can be asserted.
 */
export function magicLinkUrl(origin: string, token: string): string {
  const query = `${MAGIC_LINK_TOKEN_PARAM}=${encodeURIComponent(token)}`;
  return `${normalise(origin)}${MAGIC_LINK_PATH}?${query}`;
}

/** What to say when there is no origin to send. Names the variable, since only a build can fix it. */
export const MAGIC_LINK_UNCONFIGURED_NOTICE =
  `Sign-in links are not configured for this build. Set ${ENV_VAR} and try again.`;

export const MAGIC_LINK_ORIGIN = readMagicLinkOrigin(
  process.env.EXPO_PUBLIC_MAGIC_LINK_ORIGIN,
  Constants.expoConfig?.scheme,
);
