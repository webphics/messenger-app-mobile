/**
 * An API impersonator that exists to answer one question: on iOS, does the
 * `Cookie` header `lib/api-client.ts` sets by hand actually reach the server?
 *
 * `NSHTTPCookieStorage` can silently overwrite a manually-set `Cookie` header,
 * which is why every request sets `credentials: "omit"`. That failure is
 * invisible on Android and in Expo Go, and a real API cannot expose it either:
 * signing in would succeed whichever cookie arrived, as long as the one that
 * arrived was valid.
 *
 * So this server plants decoys. It sets `better-auth.session_token` to values
 * the client never adopts, which means the native cookie store and the client
 * end up holding *different* values for the same name. Whichever one shows up on
 * the next request says who won:
 *
 *   - `GET /csrf` plants DECOY_BEFORE_LOGIN. The client holds no Session cookie
 *     at this point, so the login request that follows must carry the CSRF pair
 *     and nothing else. A decoy in it means the native store injected one.
 *   - `GET /auth/session` plants DECOY_AFTER_LOGIN on every response. The client
 *     never reads a Session cookie off this endpoint — `interpretSession` passes
 *     through the one it already holds — so only the native store takes it. The
 *     *next* cold start must still send the value from the keychain.
 *
 * Every request's `Cookie` header is recorded and served from `/__report` for
 * `assert-report.mjs` to judge. Nothing here is reachable from the app in normal
 * use: it runs only on a CI runner, bound to loopback.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8099);

/** The value the client is handed at sign-in, and the only one it should ever replay. */
export const CLIENT_HELD_COOKIE = "client-held-session-value";

/** Planted before sign-in, when the client holds no Session cookie at all. */
const DECOY_BEFORE_LOGIN = "decoy-planted-before-login";

/** Planted after sign-in, on an endpoint whose cookies the client deliberately ignores. */
const DECOY_AFTER_LOGIN = "decoy-planted-after-login";

const SESSION_COOKIE = "better-auth.session_token";

/** Shaped like the API's real payload, trimmed to the fields the client parses. */
const USER = {
  id: "6f1d4e0c-9a3b-4c21-8f77-0d5b2e9a1c44",
  publicId: "6f1d4e0c-9a3b-4c21-8f77-0d5b2e9a1c44",
  name: "CI Agent",
  email: "ci-agent@joychat.test",
  emailVerified: true,
  image: null,
  phone: null,
  // Drives the Hub eyebrow the Maestro flow asserts on, so a wrong role fails visibly.
  role: "agent",
  twoFactorEnabled: false,
  hasPassword: true,
};

/** Every request that arrived, in order, with the `Cookie` header exactly as sent. */
const received = [];

function envelope(data, message) {
  return JSON.stringify({
    statusCode: 200,
    message,
    data,
    timestamp: new Date().toISOString(),
    path: "/",
  });
}

function send(response, body, setCookie = []) {
  response.writeHead(200, {
    "Content-Type": "application/json",
    ...(setCookie.length > 0 ? { "Set-Cookie": setCookie } : {}),
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const path = (request.url ?? "").split("?")[0];
  const cookie = request.headers.cookie ?? "";

  if (path === "/__report") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ received }, null, 2));
    return;
  }

  received.push({ method: request.method, path, cookie });
  // The runner log is the first place anyone looks when this fails.
  console.log(`${request.method} ${path} — Cookie: ${cookie || "(none)"}`);

  if (path === "/csrf") {
    send(response, envelope("csrf-token-value", "Success"), [
      "csrf-token=csrf-cookie-value; Path=/",
      `${SESSION_COOKIE}=${DECOY_BEFORE_LOGIN}; Path=/`,
    ]);
    return;
  }

  if (path === "/auth/login") {
    // Consume the body so the client's request completes cleanly.
    request.resume();
    send(response, envelope(USER, "Login successful"), [
      `${SESSION_COOKIE}=${CLIENT_HELD_COOKIE}; Path=/; HttpOnly; Max-Age=604800`,
    ]);
    return;
  }

  if (path === "/auth/session") {
    send(response, envelope(USER, "Session retrieved successfully"), [
      `${SESSION_COOKIE}=${DECOY_AFTER_LOGIN}; Path=/`,
    ]);
    return;
  }

  if (path === "/auth/logout") {
    request.resume();
    send(response, envelope(true, "Logged out successfully"));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ statusCode: 404, message: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`fake API listening on http://localhost:${PORT}`);
});
