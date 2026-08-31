import * as SecureStore from "expo-secure-store";

import {
  clearSessionToken,
  readSessionToken,
  SESSION_TOKEN_KEY,
  writeSessionToken,
} from "@/lib/keychain";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;

/** What a missing native module actually throws, verbatim enough to be recognisable. */
const NATIVE_MODULE_FAILURE = new Error(
  "Cannot find native module 'ExpoSecureStore'",
);

beforeEach(() => {
  store.getItemAsync.mockReset();
  store.setItemAsync.mockReset();
  store.deleteItemAsync.mockReset();
});

describe("readSessionToken", () => {
  test("returns the stored token", async () => {
    store.getItemAsync.mockResolvedValueOnce("session-token-value");
    await expect(readSessionToken()).resolves.toBe("session-token-value");
    expect(store.getItemAsync).toHaveBeenCalledWith(SESSION_TOKEN_KEY);
  });

  test("trims what the keystore returns", async () => {
    store.getItemAsync.mockResolvedValueOnce("  token  ");
    await expect(readSessionToken()).resolves.toBe("token");
  });

  test("an absent key reads as no token", async () => {
    store.getItemAsync.mockResolvedValueOnce(null);
    await expect(readSessionToken()).resolves.toBeNull();
  });

  test("a blank stored value reads as no token, not as an empty credential", async () => {
    store.getItemAsync.mockResolvedValueOnce("   ");
    await expect(readSessionToken()).resolves.toBeNull();
  });

  test("a native-module failure reads as no token rather than throwing", async () => {
    store.getItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(readSessionToken()).resolves.toBeNull();
  });
});

describe("writeSessionToken", () => {
  test("stores under the namespaced key and reports success", async () => {
    store.setItemAsync.mockResolvedValueOnce(undefined);
    await expect(writeSessionToken("fresh-token")).resolves.toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith(SESSION_TOKEN_KEY, "fresh-token");
  });

  test("a native-module failure reports failure rather than throwing", async () => {
    store.setItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(writeSessionToken("fresh-token")).resolves.toBe(false);
  });
});

describe("clearSessionToken", () => {
  test("deletes the key and reports success", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await expect(clearSessionToken()).resolves.toBe(true);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(SESSION_TOKEN_KEY);
  });

  test("a native-module failure reports failure rather than throwing", async () => {
    store.deleteItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(clearSessionToken()).resolves.toBe(false);
  });
});

describe("round trip", () => {
  test("what is written is what is read back", async () => {
    const disk: Record<string, string> = {};
    store.setItemAsync.mockImplementation(async (key, value) => {
      disk[key] = value;
    });
    store.getItemAsync.mockImplementation(async (key) => disk[key] ?? null);
    store.deleteItemAsync.mockImplementation(async (key) => {
      delete disk[key];
    });

    await writeSessionToken("round-trip-token");
    await expect(readSessionToken()).resolves.toBe("round-trip-token");

    await clearSessionToken();
    await expect(readSessionToken()).resolves.toBeNull();
  });
});
