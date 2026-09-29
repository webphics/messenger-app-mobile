import * as SecureStore from "expo-secure-store";

import {
  clearKeptPerson,
  clearSessionCookie,
  KEPT_PERSON_KEY,
  readKeptPerson,
  readSessionCookie,
  SESSION_COOKIE_KEY,
  writeKeptPerson,
  writeSessionCookie,
} from "@/lib/keychain";
import type { SessionUser } from "@/lib/types";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;

const COOKIE = "better-auth.session_token=abc.def";

const AGENT: SessionUser = {
  id: "56e168f0-3b5a-49fb-b475-0063c78a2337",
  name: "QA Agent",
  email: "qa-agent@talo.test",
  role: "agent",
  hasPassword: false,
  twoFactorEnabled: false,
  supportAssignmentEnabled: false,
  capabilities: [],
};

/** What a missing native module actually throws, verbatim enough to be recognisable. */
const NATIVE_MODULE_FAILURE = new Error("Cannot find native module 'ExpoSecureStore'");

beforeEach(() => {
  store.getItemAsync.mockReset();
  store.setItemAsync.mockReset();
  store.deleteItemAsync.mockReset();
});

describe("the session cookie", () => {
  test("reads the stored cookie under its own key", async () => {
    store.getItemAsync.mockResolvedValueOnce(COOKIE);
    await expect(readSessionCookie()).resolves.toBe(COOKIE);
    expect(store.getItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });

  test("a blank stored value reads as no cookie, not as an empty credential", async () => {
    store.getItemAsync.mockResolvedValueOnce("   ");
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  test("a native-module failure reads as no cookie rather than throwing", async () => {
    store.getItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  test("a write stores under the namespaced key and reports failure rather than throwing", async () => {
    store.setItemAsync.mockResolvedValueOnce(undefined);
    await expect(writeSessionCookie(COOKIE)).resolves.toBe(true);
    expect(store.setItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY, COOKIE);

    store.setItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(writeSessionCookie(COOKIE)).resolves.toBe(false);
  });

  test("a clear deletes the key and reports failure rather than throwing", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await expect(clearSessionCookie()).resolves.toBe(true);
    expect(store.deleteItemAsync).toHaveBeenCalledWith(SESSION_COOKIE_KEY);

    store.deleteItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(clearSessionCookie()).resolves.toBe(false);
  });
});

describe("the Kept person", () => {
  test("reads back as the person who was written", async () => {
    store.getItemAsync.mockResolvedValueOnce(JSON.stringify(AGENT));
    await expect(readKeptPerson()).resolves.toEqual(AGENT);
    expect(store.getItemAsync).toHaveBeenCalledWith(KEPT_PERSON_KEY);
  });

  test("a value this build cannot read keeps nobody", async () => {
    store.getItemAsync.mockResolvedValueOnce("{ not json");
    await expect(readKeptPerson()).resolves.toBeNull();
  });

  test("a native-module failure keeps nobody rather than throwing", async () => {
    store.getItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(readKeptPerson()).resolves.toBeNull();
  });

  test("a write the keystore refuses is silent", async () => {
    store.setItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(writeKeptPerson(AGENT)).resolves.toBeUndefined();
  });

  test("clearing removes the person and nothing else", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearKeptPerson();
    expect(store.deleteItemAsync).toHaveBeenCalledWith(KEPT_PERSON_KEY);
    expect(store.deleteItemAsync).not.toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });
});

test("the cookie and the person go in and come back together, and both clear", async () => {
  const disk: Record<string, string> = {};
  store.setItemAsync.mockImplementation(async (key, value) => {
    disk[key] = value;
  });
  store.getItemAsync.mockImplementation(async (key) => disk[key] ?? null);
  store.deleteItemAsync.mockImplementation(async (key) => {
    delete disk[key];
  });

  await writeSessionCookie(COOKIE);
  await writeKeptPerson(AGENT);
  await expect(readSessionCookie()).resolves.toBe(COOKIE);
  await expect(readKeptPerson()).resolves.toEqual(AGENT);

  await clearSessionCookie();
  await clearKeptPerson();
  await expect(readSessionCookie()).resolves.toBeNull();
  await expect(readKeptPerson()).resolves.toBeNull();
});
