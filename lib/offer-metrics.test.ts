import { CARD_MIN_HEIGHT, offerCardMetrics } from "@/lib/offer-metrics";

describe("offerCardMetrics", () => {
  test("card min height is shared", () => {
    expect(CARD_MIN_HEIGHT).toBe(196);
  });

  test("left edge pad 16, card ~78% width, snap includes gap", () => {
    const m = offerCardMetrics(400);
    expect(m.edgePad).toBe(16);
    expect(m.cardWidth).toBe(312);
    expect(m.gap).toBe(12);
    expect(m.snap).toBe(324);
  });
});
