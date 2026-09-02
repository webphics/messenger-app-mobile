/**
 * Judge what `fake-api.mjs` recorded.
 *
 * Two assertions carry the whole check; the rest exist so that a flow which
 * silently did nothing fails as loudly as a flow that failed.
 */
const REPORT_URL = process.env.REPORT_URL ?? "http://localhost:8099/__report";

const CLIENT_HELD_COOKIE = "client-held-session-value";
const DECOY_BEFORE_LOGIN = "decoy-planted-before-login";
const DECOY_AFTER_LOGIN = "decoy-planted-after-login";

const response = await fetch(REPORT_URL);
const { received } = await response.json();

const failures = [];
const notes = [];

function check(label, condition, detail) {
  if (condition) {
    notes.push(`  ok   ${label}`);
  } else {
    failures.push(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

const logins = received.filter((r) => r.path === "/auth/login");
const sessions = received.filter((r) => r.path === "/auth/session");

console.log("Requests the simulator sent:");
for (const r of received) {
  console.log(`  ${r.method} ${r.path} — Cookie: ${r.cookie || "(none)"}`);
}
console.log("");

// Without these the interesting assertions would pass vacuously.
check("the app signed in", logins.length > 0, "no POST /auth/login arrived at all");
check(
  "the app hydrated at least twice after signing in",
  sessions.length >= 2,
  `saw ${sessions.length} GET /auth/session; the flow relaunches the app so a decoy has something to poison`,
);

if (logins.length > 0) {
  const login = logins[0];

  check(
    "the CSRF pair this client set reached the server",
    login.cookie.includes("csrf-token=csrf-cookie-value"),
    `login carried: ${login.cookie || "(no Cookie header)"}`,
  );

  // The load-bearing one. A decoy here means NSHTTPCookieStorage wrote the
  // header instead of the client — the exact iOS-only failure this design
  // exists to prevent.
  check(
    "no cookie the native store planted before sign-in leaked into the request",
    !login.cookie.includes(DECOY_BEFORE_LOGIN),
    `login carried the planted decoy: ${login.cookie}`,
  );
}

if (sessions.length >= 2) {
  // The first session call is where the after-login decoy gets planted, so the
  // one that proves anything is the cold start after it.
  const later = sessions[sessions.length - 1];

  check(
    "a later cold start replayed the Session cookie held in the keychain",
    later.cookie.includes(`better-auth.session_token=${CLIENT_HELD_COOKIE}`),
    `hydration carried: ${later.cookie || "(no Cookie header)"}`,
  );

  // The other load-bearing one. The client never adopts a Session cookie from
  // /auth/session; only the native store would.
  check(
    "no cookie the native store planted after sign-in displaced the stored one",
    !later.cookie.includes(DECOY_AFTER_LOGIN),
    `hydration carried the planted decoy: ${later.cookie}`,
  );
}

console.log(notes.join("\n"));

if (failures.length > 0) {
  console.error("\n" + failures.join("\n"));
  console.error(
    "\nThe platform sent a Cookie header this client did not write. On iOS that " +
      "is the NSHTTPCookieStorage overwrite ADR-0004 describes: check that every " +
      'fetch in lib/api-client.ts still passes credentials: "omit".',
  );
  process.exit(1);
}

console.log("\nEvery request carried the Cookie header this client wrote, and nothing else.");
