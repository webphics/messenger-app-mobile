/**
 * Whether a URL somebody else wrote may be handed to `Linking.openURL`.
 *
 * `openURL` opens whatever app claims the scheme, so an author-supplied
 * `chatroute://account/delete`, `intent:`, `market:` or `tel:` would act on
 * the reader's phone the moment they tap a button that says something else.
 * Only a web address with a host passes: `https:`, and `http:` because the API
 * accepts one on a Post and chat linkification already opens one, and both end
 * in the browser rather than in an app.
 *
 * Userinfo is refused outright. `https://example.com@evil.test/` reads as one
 * host and goes to another, and no real Post link needs a username in it.
 *
 * Pure, so the table of refusals lives beside it rather than in a running app.
 */
export function isWebLink(url: string): boolean {
  const value = url.trim()
  // Whitespace and control characters inside a URL are how a second scheme
  // gets past a prefix check.
  if (/[\u0000- \u007f]/.test(value)) return false
  return /^https?:\/\/[^/?#@\\]+(?:[/?#]|$)/i.test(value)
}
