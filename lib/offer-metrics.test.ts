import { offerCardMetrics } from "@/lib/offer-metrics";

describe("offerCardMetrics", () => {
  test("full-bleed: no edge pad, card ~78% width, snap includes gap", () => {
    const m = offerCardMetrics(400);
    expect(m.edgePad).toBe(0);
    expect(m.cardWidth).toBe(312);
    expect(m.gap).toBe(12);
    expect(m.snap).toBe(324);
  });
});
