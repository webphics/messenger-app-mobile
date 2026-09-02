import * as SecureStore from "expo-secure-store";

import {
  clearRetiredCredential,
  clearSessionCookie,
  readSessionCookie,
  SESSION_COOKIE_KEY,
  writeSessionCookie,
} from "@/lib/keychain";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;

const COOKIE = "better-auth.session_token=abc.def";

/** What a missing native module actually throws, verbatim enough to be recognisable. */
const NATIVE_MODULE_FAILURE = new Error(
  "Cannot find native module 'ExpoSecureStore'",
);

beforeEach(() => {
  store.getItemAsync.mockReset();
  store.setItemAsync.mockReset();
  store.deleteItemAsync.mockReset();
});

describe("readSessionCookie", () => {
  test("returns the stored cookie", async () => {
    store.getItemAsync.mockResolvedValueOnce(COOKIE);
    await expect(readSessionCookie()).resolves.toBe(COOKIE);
    expect(store.getItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });

  test("trims what the keystore returns", async () => {
    store.getItemAsync.mockResolvedValueOnce(`  ${COOKIE}  `);
    await expect(readSessionCookie()).resolves.toBe(COOKIE);
  });

  test("an absent key reads as no cookie", async () => {
    store.getItemAsync.mockResolvedValueOnce(null);
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  test("a blank stored value reads as no cookie, not as an empty credential", async () => {
    store.getItemAsync.mockResolvedValueOnce("   ");
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  test("a native-module failure reads as no cookie rather than throwing", async () => {
    store.getItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(readSessionCookie()).resolves.toBeNull();
  });
});

describe("writeSessionCookie", () => {
  test("stores under the namespaced key and reports success", async () => {
    store.setItemAsync.mockResolvedValueOnce(undefined);
    await expect(writeSessionCookie(COOKIE)).resolves.toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY, COOKIE);
  });

  test("a native-module failure reports failure rather than throwing", async () => {
    store.setItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(writeSessionCookie(COOKIE)).resolves.toBe(false);
  });
});

describe("clearSessionCookie", () => {
  test("deletes the key and reports success", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await expect(clearSessionCookie()).resolves.toBe(true);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });

  test("a native-module failure reports failure rather than throwing", async () => {
    store.deleteItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(clearSessionCookie()).resolves.toBe(false);
  });
});

describe("clearRetiredCredential", () => {
  test("removes what the previous slice left behind, under its own key", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearRetiredCredential();
    expect(store.deleteItemAsync).toHaveBeenCalledWith("enki.session_token");
  });

  test("leaves the live credential alone", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearRetiredCredential();
    expect(store.deleteItemAsync).not.toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });

  test("a native-module failure is silent rather than thrown", async () => {
    store.deleteItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(clearRetiredCredential()).resolves.toBeUndefined();
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

    await writeSessionCookie(COOKIE);
    await expect(readSessionCookie()).resolves.toBe(COOKIE);

    await clearSessionCookie();
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  test("clearing the retired key does not disturb the stored cookie", async () => {
    const disk: Record<string, string> = {};
    store.setItemAsync.mockImplementation(async (key, value) => {
      disk[key] = value;
    });
    store.getItemAsync.mockImplementation(async (key) => disk[key] ?? null);
    store.deleteItemAsync.mockImplementation(async (key) => {
      delete disk[key];
    });

    disk["enki.session_token"] = "left over";
    await writeSessionCookie(COOKIE);

    await clearRetiredCredential();

    expect(disk["enki.session_token"]).toBeUndefined();
    await expect(readSessionCookie()).resolves.toBe(COOKIE);
  });
});
