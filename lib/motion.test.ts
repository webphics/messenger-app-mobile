import { motion, rubberBand } from "@/lib/motion";

describe("motion", () => {
  test("desk spring is compositor-friendly (no layout props)", () => {
    expect(motion.springs.desk.damping).toBeGreaterThan(0);
    expect(motion.springs.desk.stiffness).toBeGreaterThan(0);
    expect(motion.durations.feedback).toBeLessThanOrEqual(150);
  });

  test("a disclosure is feedback rather than an entrance", () => {
    expect(motion.durations.disclosure).toBeLessThanOrEqual(150);
  });

  test("overlay spring exists for sheets and tab indicator", () => {
    expect(motion.springs.overlay.damping).toBeGreaterThan(0);
    expect(motion.springs.overlay.stiffness).toBeGreaterThan(0);
  });
});

describe("rubberBand", () => {
  test("tracks the finger exactly up to the limit", () => {
    expect(rubberBand(0, 80)).toBe(0);
    expect(rubberBand(40, 80)).toBe(40);
    expect(rubberBand(80, 80)).toBe(80);
  });

  test("keeps only a fraction of every pixel past it", () => {
    expect(rubberBand(180, 80)).toBeCloseTo(80 + 100 * motion.rubberBand);
    // Still moving, still monotonic — an edge that reads as real, not as a stall.
    expect(rubberBand(300, 80)).toBeGreaterThan(rubberBand(180, 80));
  });

  test("a backwards or nonsense drag is no drag", () => {
    expect(rubberBand(-40, 80)).toBe(0);
    expect(rubberBand(Number.NaN, 80)).toBe(0);
  });
});
