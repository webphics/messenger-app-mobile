/**
 * The public pages on the web that the store listings point to, opened from
 * Settings so the privacy policy is reachable inside the app as well as from
 * the listing, which Google Play's User Data policy asks for.
 *
 * The pages live in the web client (`app/src/features/showcase/legal`); this
 * file only knows where they are.
 */
export const WEB_ORIGIN = "https://thechatroute.com";

export const LEGAL_LINKS = {
  privacy: `${WEB_ORIGIN}/privacy`,
  terms: `${WEB_ORIGIN}/terms`,
  deleteAccount: `${WEB_ORIGIN}/delete-account`,
} as const;

export const SUPPORT_EMAIL = "support@thechatroute.com";
