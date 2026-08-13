import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from "@/lib/haptics";

describe("haptics helpers", () => {
  it("executes all haptics without throwing", () => {
    expect(() => hapticLight()).not.toThrow();
    expect(() => hapticMedium()).not.toThrow();
    expect(() => hapticSelection()).not.toThrow();
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticWarning()).not.toThrow();
  });
});
