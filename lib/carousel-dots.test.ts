import {
  DOT_ACTIVE_SIZE,
  DOT_GAP,
  DOT_SIZE,
  dotDistance,
  dotOffset,
  dotWidth,
  paginationWidth,
} from "@/lib/carousel-dots";

const SNAP = 300;

function totalWidth(scrollX: number, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i += 1) sum += dotWidth(scrollX, i, SNAP, count);
  return sum + (count - 1) * DOT_GAP;
}

describe("dotDistance", () => {
  it("is zero under its own card and one a card away", () => {
    expect(dotDistance(SNAP, 1, SNAP, 4)).toBe(0);
    expect(dotDistance(SNAP, 0, SNAP, 4)).toBe(1);
    expect(dotDistance(SNAP, 3, SNAP, 4)).toBe(1);
  });

  it("splits evenly between two dots mid-scroll", () => {
    expect(dotDistance(SNAP * 0.25, 0, SNAP, 4)).toBeCloseTo(0.25);
    expect(dotDistance(SNAP * 0.25, 1, SNAP, 4)).toBeCloseTo(0.75);
  });

  it("pins past either end, so overscroll does not shrink a dot", () => {
    expect(dotDistance(-400, 0, SNAP, 4)).toBe(0);
    expect(dotDistance(SNAP * 3 + 400, 3, SNAP, 4)).toBe(0);
  });

  it("survives nonsense rather than propagating it", () => {
    expect(dotDistance(Number.NaN, 0, SNAP, 4)).toBe(1);
    expect(dotDistance(0, 0, 0, 4)).toBe(1);
    expect(dotDistance(0, 0, SNAP, 0)).toBe(1);
  });
});

describe("dotWidth", () => {
  it("is full under its own card and at rest a card away", () => {
    expect(dotWidth(SNAP, 1, SNAP, 4)).toBe(DOT_ACTIVE_SIZE);
    expect(dotWidth(SNAP, 3, SNAP, 4)).toBe(DOT_SIZE);
  });
});

describe("paginationWidth", () => {
  // The container is this wide and the dots are absolute inside it, so a total
  // that moved would leave the row clipped at one end or floating off-centre.
  it("matches the dots laid end to end, wherever the carousel is", () => {
    for (const count of [2, 3, 5, 8]) {
      const expected = paginationWidth(count);
      for (let step = -2; step <= (count + 1) * 4; step += 1) {
        const at = (step / 4) * SNAP;
        expect(totalWidth(at, count)).toBeCloseTo(expected);
      }
    }
  });

  it("is nothing for a carousel with nothing in it", () => {
    expect(paginationWidth(0)).toBe(0);
    expect(paginationWidth(Number.NaN)).toBe(0);
  });
});

describe("dotOffset", () => {
  it("starts the first dot at zero", () => {
    expect(dotOffset(0, 0, SNAP, 4)).toBe(0);
  });

  it("places each dot after the one in front of it", () => {
    expect(dotOffset(0, 1, SNAP, 4)).toBeCloseTo(DOT_ACTIVE_SIZE + DOT_GAP);
    expect(dotOffset(0, 2, SNAP, 4)).toBeCloseTo(
      DOT_ACTIVE_SIZE + DOT_GAP + DOT_SIZE + DOT_GAP,
    );
  });

  it("keeps the last dot inside the container", () => {
    for (const count of [2, 3, 5, 8]) {
      for (let step = 0; step <= (count - 1) * 4; step += 1) {
        const at = (step / 4) * SNAP;
        const last = count - 1;
        const right = dotOffset(at, last, SNAP, count) + dotWidth(at, last, SNAP, count);
        expect(right).toBeCloseTo(paginationWidth(count));
      }
    }
  });
});
