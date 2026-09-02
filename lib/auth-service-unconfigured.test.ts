import { apiRequest } from "@/lib/api-client";
import { requestMagicLink } from "@/lib/auth-service";
import { MAGIC_LINK_UNCONFIGURED_NOTICE } from "@/lib/magic-link-config";

/**
 * A build with nowhere for its sign-in links to point.
 *
 * Its own file because the origin is resolved once, at import, from `.env` and
 * the app config — so "this build has no origin" is a property of the whole
 * module graph rather than something a test can set partway through a run.
 */
jest.mock("@/lib/api-client", () => ({
  apiRequest: jest.fn(),
  setSessionCookie: jest.fn(),
  getSessionCookie: jest.fn(() => null),
  clearCsrfPair: jest.fn(),
}));

jest.mock("@/lib/keychain", () => ({
  readSessionCookie: jest.fn(async () => null),
  writeSessionCookie: jest.fn(async () => true),
  clearSessionCookie: jest.fn(async () => true),
  clearRetiredCredential: jest.fn(async () => undefined),
}));

jest.mock("@/lib/legacy-session", () => ({
  purgeMockSession: jest.fn(async () => undefined),
}));

jest.mock("@/lib/magic-link-config", () => ({
  ...jest.requireActual("@/lib/magic-link-config"),
  MAGIC_LINK_ORIGIN: null,
}));

test("a build with no origin sends nothing, rather than a link that opens nothing", async () => {
  await expect(requestMagicLink("first-timer@talo.test")).resolves.toEqual({
    kind: "refused",
    message: MAGIC_LINK_UNCONFIGURED_NOTICE,
  });

  // Without an origin the API falls back to its own base URL, and a link to the
  // API is a link to nowhere on a phone. Saying the build is misconfigured beats
  // confirming an address that cannot be acted on.
  expect(apiRequest).not.toHaveBeenCalled();
});
