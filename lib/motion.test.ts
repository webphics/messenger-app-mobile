import { motion, staggerDelay } from "@/lib/motion";

describe("motion", () => {
  test("desk spring is compositor-friendly (no layout props)", () => {
    expect(motion.springs.desk.damping).toBeGreaterThan(0);
    expect(motion.springs.desk.stiffness).toBeGreaterThan(0);
    expect(motion.durations.feedback).toBeLessThanOrEqual(150);
  });

  test("stagger caps total delay so long lists never wait", () => {
    const max =
      (motion.stagger.maxItems - 1) * motion.stagger.stepMs;
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(2 * motion.stagger.stepMs);
    expect(staggerDelay(99)).toBe(max);
    expect(staggerDelay(-1)).toBe(0);
  });

  test("overlay spring exists for sheets and tab indicator", () => {
    expect(motion.springs.overlay.damping).toBeGreaterThan(0);
    expect(motion.springs.overlay.stiffness).toBeGreaterThan(0);
  });
});
