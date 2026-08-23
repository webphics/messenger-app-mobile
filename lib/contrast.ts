/**
 * WCAG 2.1 relative luminance and contrast ratio for the sRGB hex strings in
 * `lib/tokens.ts`. Used by the token tests to keep the palette legible — see
 * the contrast floors asserted in `lib/tokens.test.ts`.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

function channel(v: number): number {
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) {
    throw new Error(`relativeLuminance: expected #RRGGBB, got "${hex}"`);
  }
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(parseInt(hex.slice(i, i + 2), 16) / 255),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
