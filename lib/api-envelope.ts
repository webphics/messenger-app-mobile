/**
 * The little the transport and the interpreters both have to know about an API
 * body.
 *
 * `lib/api-client` reads a body only far enough to tell a CSRF refusal from any
 * other 403; `lib/auth-response` reads it the whole way. Both start from the same
 * narrowing and both recognise the same refusal code, and neither is the natural
 * owner of the other's copy — so the shared part lives here rather than being
 * kept in step by hand.
 */

/** The API's code for a request the CSRF guard turned away. From `csrf.error.ts`. */
export const CSRF_REFUSED_CODE = "csrf_invalid";

/**
 * A parsed body as a readable object, or null when it is not one.
 *
 * Arrays are excluded deliberately: `typeof [] === "object"`, so without the
 * check a JSON array would answer to `.code` and `.data` with `undefined` rather
 * than being rejected as the wrong shape.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
