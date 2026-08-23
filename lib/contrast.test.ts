import { contrastRatio, relativeLuminance } from "@/lib/contrast";

describe("relativeLuminance", () => {
  test("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
  });

  test("is case-insensitive", () => {
    expect(relativeLuminance("#b83e0b")).toBeCloseTo(
      relativeLuminance("#B83E0B"),
      10,
    );
  });

  test("rejects shorthand and malformed hex", () => {
    expect(() => relativeLuminance("#FFF")).toThrow();
    expect(() => relativeLuminance("rebeccapurple")).toThrow();
  });
});

describe("contrastRatio", () => {
  test("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  test("is 1 for a colour against itself", () => {
    expect(contrastRatio("#B83E0B", "#B83E0B")).toBeCloseTo(1, 10);
  });

  test("is order-independent", () => {
    expect(contrastRatio("#B83E0B", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#B83E0B"),
      10,
    );
  });
});
