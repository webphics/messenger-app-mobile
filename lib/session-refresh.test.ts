import { SESSION_REFRESH_INTERVAL_MS, shouldRefreshSessionUser } from "@/lib/session-refresh";

describe("shouldRefreshSessionUser", () => {
  const now = 1_000_000;

  test.each([
    ["never read", null, now, true],
    ["read just now", now, now, false],
    ["read inside the window", now - SESSION_REFRESH_INTERVAL_MS + 1, now, false],
    ["read exactly one window ago", now - SESSION_REFRESH_INTERVAL_MS, now, true],
    ["read long ago", now - 10 * SESSION_REFRESH_INTERVAL_MS, now, true],
    ["read in the future, after the clock moved back", now + 5_000, now, true],
  ])("%s", (_case, lastRefreshAt, at, expected) => {
    expect(shouldRefreshSessionUser(lastRefreshAt, at)).toBe(expected);
  });

  test("takes its window from the caller", () => {
    expect(shouldRefreshSessionUser(now - 500, now, 1_000)).toBe(false);
    expect(shouldRefreshSessionUser(now - 1_000, now, 1_000)).toBe(true);
  });
});
