import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Clean up after the mock auth shell.
 *
 * Phase 2 kept `{ email, role }` in AsyncStorage under this key. Real auth stopped
 * reading it, which is not the same as it being gone: an upgrading install would
 * otherwise leave the previous person's email address sitting in plain storage
 * indefinitely, with nothing left in the app that would ever clear it.
 *
 * Removing it is a one-line write on a key nobody reads, so it is best-effort and
 * silent — a failure means the value stays for one more launch, which is exactly
 * where it already was.
 */
const MOCK_SESSION_KEY = "ism.session";

export async function purgeMockSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    // Expo Go only ships AsyncStorage 2.x; on a mismatch the native module is null.
  }
}
