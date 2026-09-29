import type { AccountState } from "@/lib/account-state";
import {
  ACCOUNT_STATE_CACHE_MS,
  cacheAccountState,
  readCachedAccountState,
} from "@/lib/account-state-cache";

const HAS_PASSWORD: AccountState = { exists: true, hasPassword: true };
const NO_PASSWORD: AccountState = { exists: true, hasPassword: false };
const T0 = 1_700_000_000_000;

describe("what the form already knows", () => {
  test("an answer just given is used rather than asked for again", () => {
    const cached = cacheAccountState("ada@example.com", HAS_PASSWORD, T0);
    expect(readCachedAccountState(cached, "ada@example.com", T0)).toEqual(
      HAS_PASSWORD,
    );
  });
});

describe("an answer about somebody else is no answer", () => {
  test("a different identifier does not read the entry", () => {
    const cached = cacheAccountState("ada@example.com", HAS_PASSWORD, T0);
    expect(readCachedAccountState(cached, "grace@example.com", T0)).toBeNull();
  });
});

describe("how long an answer is worth", () => {
  test("exactly at the ceiling is asked again", () => {
    const cached = cacheAccountState("ada@example.com", NO_PASSWORD, T0);
    expect(
      readCachedAccountState(
        cached,
        "ada@example.com",
        T0 + ACCOUNT_STATE_CACHE_MS,
      ),
    ).toBeNull();
  });
});
