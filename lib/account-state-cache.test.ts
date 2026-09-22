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

  test("going back and returning to the same identifier is free", () => {
    // The whole reason this exists: the API budgets this route per identifier,
    // and fixing a typo then changing your mind must not spend a second one.
    const cached = cacheAccountState("ada@example.com", NO_PASSWORD, T0);
    expect(
      readCachedAccountState(cached, "ada@example.com", T0 + 30_000),
    ).toEqual(NO_PASSWORD);
  });

  test("nothing cached is nothing known", () => {
    expect(readCachedAccountState(null, "ada@example.com", T0)).toBeNull();
  });
});

describe("an answer about somebody else is no answer", () => {
  test("a different identifier does not read the entry", () => {
    const cached = cacheAccountState("ada@example.com", HAS_PASSWORD, T0);
    expect(readCachedAccountState(cached, "grace@example.com", T0)).toBeNull();
  });

  test("and the entry is not partially trusted — case matters, since the sender lower-cases", () => {
    // `fetchAccountState` sends the lower-cased value and the cache keys on
    // what was sent, so a caller handing this raw input is asking the wrong
    // question and gets no answer rather than a wrong one.
    const cached = cacheAccountState("ada@example.com", HAS_PASSWORD, T0);
    expect(readCachedAccountState(cached, "Ada@Example.com", T0)).toBeNull();
  });
});

describe("how long an answer is worth", () => {
  test("just inside the window still counts", () => {
    const cached = cacheAccountState("ada@example.com", NO_PASSWORD, T0);
    expect(
      readCachedAccountState(
        cached,
        "ada@example.com",
        T0 + ACCOUNT_STATE_CACHE_MS - 1,
      ),
    ).toEqual(NO_PASSWORD);
  });

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

  test("a stale no-password answer is the one that must not be trusted", () => {
    // Somebody can set a password in another tab. Serving the old answer leaves
    // them on a screen that will not take the password they just chose, which
    // is why the ceiling is short rather than generous.
    const cached = cacheAccountState("ada@example.com", NO_PASSWORD, T0);
    expect(
      readCachedAccountState(
        cached,
        "ada@example.com",
        T0 + ACCOUNT_STATE_CACHE_MS + 1,
      ),
    ).toBeNull();
  });

  test("a clock that went backwards does not extend the entry past its window", () => {
    const cached = cacheAccountState("ada@example.com", HAS_PASSWORD, T0);
    expect(readCachedAccountState(cached, "ada@example.com", T0 - 60_000)).toEqual(
      HAS_PASSWORD,
    );
  });
});
