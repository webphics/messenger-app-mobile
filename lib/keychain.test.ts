import * as SecureStore from "expo-secure-store";

import {
  clearKeptPerson,
  clearRetiredCredential,
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
  test("asks the keystore for nothing while the retired list is empty", async () => {
    // The list emptied when the application id moved with the rename: a
    // keystore belongs to an application id, so the previous brand's keys are
    // another app's keys and unreachable from here. Nothing to clear is the
    // correct behaviour, not a missing case.
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearRetiredCredential();
    expect(store.deleteItemAsync).not.toHaveBeenCalled();
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

describe("the Kept person", () => {
  test("is stored under its own key, as the four fields and the assignment switch", async () => {
    store.setItemAsync.mockResolvedValueOnce(undefined);
    await writeKeptPerson(AGENT);

    const [key, value] = store.setItemAsync.mock.calls[0];
    expect(key).toBe(KEPT_PERSON_KEY);
    // The four identity fields and the assignment switch, and nothing else,
    // which `lib/kept-person` decides and this only repeats.
    expect(JSON.parse(value)).toEqual({
      id: AGENT.id,
      name: AGENT.name,
      email: AGENT.email,
      role: AGENT.role,
      supportAssignmentEnabled: AGENT.supportAssignmentEnabled,
    });
  });

  test("reads back as the person who was written", async () => {
    store.getItemAsync.mockResolvedValueOnce(JSON.stringify(AGENT));
    await expect(readKeptPerson()).resolves.toEqual(AGENT);
    expect(store.getItemAsync).toHaveBeenCalledWith(KEPT_PERSON_KEY);
  });

  test("an empty keystore keeps nobody", async () => {
    store.getItemAsync.mockResolvedValueOnce(null);
    await expect(readKeptPerson()).resolves.toBeNull();
  });

  // The fallback is Unreachable, which is where a build with no Kept person at
  // all already lands — never a session signed in as half a person.
  test("a value this build cannot read keeps nobody", async () => {
    store.getItemAsync.mockResolvedValueOnce("{ not json");
    await expect(readKeptPerson()).resolves.toBeNull();
  });

  test("a native-module failure keeps nobody rather than throwing", async () => {
    store.getItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(readKeptPerson()).resolves.toBeNull();
  });

  test("a write the keystore refuses is silent — the next cold start is Unreachable", async () => {
    store.setItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(writeKeptPerson(AGENT)).resolves.toBeUndefined();
  });

  test("clearing removes the person and nothing else", async () => {
    store.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearKeptPerson();
    expect(store.deleteItemAsync).toHaveBeenCalledWith(KEPT_PERSON_KEY);
    expect(store.deleteItemAsync).not.toHaveBeenCalledWith(SESSION_COOKIE_KEY);
  });

  test("a delete the keystore refuses is silent rather than thrown", async () => {
    store.deleteItemAsync.mockRejectedValueOnce(NATIVE_MODULE_FAILURE);
    await expect(clearKeptPerson()).resolves.toBeUndefined();
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

  test("the cookie and the person go in and come back together", async () => {
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
    await expect(readKeptPerson()).resolves.toEqual(AGENT);

    await clearSessionCookie();
    await clearKeptPerson();
    await expect(readKeptPerson()).resolves.toBeNull();
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

    await writeSessionCookie(COOKIE);

    await clearRetiredCredential();

    // The point of this test is the live credential, and it survives whether
    // the retired list has entries or none.
    await expect(readSessionCookie()).resolves.toBe(COOKIE);
  });
});
