import AsyncStorage from "@react-native-async-storage/async-storage";

import { purgeMockSession } from "@/lib/legacy-session";

jest.mock("@react-native-async-storage/async-storage", () => ({
  removeItem: jest.fn(),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

beforeEach(() => {
  storage.removeItem.mockReset();
});

test("removes the mock shell's stored session", async () => {
  storage.removeItem.mockResolvedValueOnce(undefined);
  await purgeMockSession();
  expect(storage.removeItem).toHaveBeenCalledWith("ism.session");
});

test("a native-module failure leaves the key for next launch rather than throwing", async () => {
  storage.removeItem.mockRejectedValueOnce(
    new Error("Native module is null, cannot access legacy storage"),
  );
  await expect(purgeMockSession()).resolves.toBeUndefined();
});
