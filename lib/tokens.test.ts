import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio } from "@/lib/contrast";
import { colors } from "@/lib/tokens";

/** `lib/tokens.ts` key -> `global.css` custom-property suffix. */
const CSS_NAME: Record<keyof typeof colors, string> = {
  bg: "bg",
  surface: "surface",
  ink: "ink",
  inkSoft: "ink-soft",
  muted: "muted",
  line: "line",
  primary: "primary",
  primaryForeground: "primary-foreground",
  success: "success",
  danger: "danger",
  amber: "amber",
};

function readThemeBlock(): Map<string, string> {
  const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");
  const start = css.indexOf("@theme {");
  if (start < 0) throw new Error("global.css: no @theme block found");
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);

  const out = new Map<string, string>();
  for (const [, name, value] of block.matchAll(
    /--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g,
  )) {
    out.set(name, value.toUpperCase());
  }
  return out;
}

describe("colour tokens", () => {
  const theme = readThemeBlock();

  test.each(Object.keys(CSS_NAME) as (keyof typeof colors)[])(
    "%s matches global.css",
    (key) => {
      const cssValue = theme.get(CSS_NAME[key]);
      expect(cssValue).toBeDefined();
      expect(colors[key].toUpperCase()).toBe(cssValue);
    },
  );
});

describe("colour contrast floors", () => {
  test("primary carries white text at AA (4.5:1)", () => {
    expect(
      contrastRatio(colors.primary, colors.primaryForeground),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("primary reads as text on the app background at AA", () => {
    expect(contrastRatio(colors.primary, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("body ink clears AAA on the app background", () => {
    expect(contrastRatio(colors.ink, colors.bg)).toBeGreaterThanOrEqual(7);
  });

  test("danger reads as text on the app background at AA", () => {
    expect(contrastRatio(colors.danger, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
