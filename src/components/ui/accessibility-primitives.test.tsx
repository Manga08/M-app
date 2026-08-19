import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InputControl } from "@/components/ui/form-control";
import { Progress, normalizeProgressRange } from "@/components/ui/progress";

type Oklch = [number, number, number];

describe("accessible finance primitives", () => {
  it("keeps exactly one calendar affordance on date controls", () => {
    const date = renderToStaticMarkup(
      <InputControl type="date" aria-label="Fecha" leading={<svg data-calendar="custom" />} />,
    );
    const text = renderToStaticMarkup(
      <InputControl type="text" aria-label="Buscar" leading={<svg data-search="custom" />} />,
    );

    expect(date).toContain('type="date"');
    expect(date).not.toContain("data-calendar");
    expect(text).toContain('data-slot="form-control-leading"');
  });

  it("clamps progress values and exposes the real range to assistive technology", () => {
    expect(normalizeProgressRange(140, 10, 110)).toMatchObject({
      min: 10,
      max: 110,
      value: 110,
      percentage: 100,
      valueText: "100%",
    });

    const markup = renderToStaticMarkup(
      <Progress label="Meta de ahorro" value={60} min={10} max={110} />,
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="Meta de ahorro"');
    expect(markup).toContain('aria-valuemin="10"');
    expect(markup).toContain('aria-valuemax="110"');
    expect(markup).toContain('aria-valuenow="60"');
    expect(markup).toContain('aria-valuetext="50%"');
  });
});

describe("theme contrast contract", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const button = readFileSync(join(process.cwd(), "src/components/ui/button.tsx"), "utf8");
  const root = readOklchVariables(readCssBlock(css, ":root"));
  const dark = { ...root, ...readOklchVariables(readCssBlock(css, ".dark")) };
  const palettes = ["default", "crimson", "ocean", "violet", "amber"] as const;

  for (const palette of palettes) {
    it(`${palette} meets WCAG AA in light mode`, () => {
      const tokens = palette === "default"
        ? root
        : { ...root, ...readOklchVariables(readCssBlock(css, `:root[data-palette="${palette}"]`)) };

      expectContrast(tokens.primary, tokens.background, 4.5, "primary text");
      expectContrast(tokens["primary-foreground"], tokens.primary, 4.5, "primary button label");
      expectPrimaryHoverContrast(tokens, "primary button hover label");
      expectContrast(tokens.destructive, tokens.background, 4.5, "destructive text");
      expectContrast(tokens.ring, tokens.background, 3, "focus ring");
      expectContrast(tokens.input, tokens.background, 3, "input boundary");
      expectContrast(tokens.positive, tokens.background, 4.5, "positive status");
      expectContrast(tokens.warning, tokens.background, 4.5, "warning status");
      expectContrast(tokens.info, tokens.background, 4.5, "informational status");
    });

    it(`${palette} meets WCAG AA in dark mode`, () => {
      const tokens = palette === "default"
        ? dark
        : { ...dark, ...readOklchVariables(readCssBlock(css, `.dark[data-palette="${palette}"]`)) };

      expectContrast(tokens.primary, tokens.background, 4.5, "primary text");
      expectContrast(tokens["primary-foreground"], tokens.primary, 4.5, "primary button label");
      expectPrimaryHoverContrast(tokens, "primary button hover label");
      expectContrast(tokens.destructive, tokens.background, 4.5, "destructive text");
      expectContrast(tokens.ring, tokens.background, 3, "focus ring");
      expectContrast(tokens.input, tokens.background, 3, "input boundary");
      expectContrast(tokens.positive, tokens.background, 4.5, "positive status");
      expectContrast(tokens.warning, tokens.background, 4.5, "warning status");
      expectContrast(tokens.info, tokens.background, 4.5, "informational status");
    });
  }

  it("uses an opaque semantic hover color instead of reducing primary opacity", () => {
    expect(css).toContain("--primary-hover: color-mix(in oklch, var(--primary), var(--foreground) 8%)");
    expect(button).toContain("hover:bg-primary-hover");
    expect(button).not.toMatch(/hover:bg-primary\/\d+/);
  });
});

function readCssBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS block: ${selector}`);
  const openingBrace = css.indexOf("{", start);
  let depth = 0;

  for (let index = openingBrace; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(openingBrace + 1, index);
  }

  throw new Error(`Unclosed CSS block: ${selector}`);
}

function readOklchVariables(block: string) {
  const tokens: Record<string, Oklch> = {};
  const pattern = /--([\w-]+):\s*oklch\(([^)]+)\)/g;

  for (const match of block.matchAll(pattern)) {
    const values = match[2].split(/[\s/]+/).slice(0, 3).map(Number);
    if (values.length === 3 && values.every(Number.isFinite)) {
      tokens[match[1]] = values as Oklch;
    }
  }

  return tokens;
}

function expectContrast(foreground: Oklch, background: Oklch, minimum: number, pair: string) {
  const ratio = contrastRatio(foreground, background);
  expect(ratio, `${pair}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
}

function expectPrimaryHoverContrast(tokens: Record<string, Oklch>, pair: string) {
  const hover = mixOklch(tokens.primary, tokens.foreground, 0.08);
  expectContrast(tokens["primary-foreground"], hover, 4.5, pair);
}

function mixOklch(first: Oklch, second: Oklch, secondWeight: number): Oklch {
  const firstWeight = 1 - secondWeight;
  const hueDelta = ((second[2] - first[2] + 540) % 360) - 180;
  return [
    first[0] * firstWeight + second[0] * secondWeight,
    first[1] * firstWeight + second[1] * secondWeight,
    (first[2] + hueDelta * secondWeight + 360) % 360,
  ];
}

function contrastRatio(first: Oklch, second: Oklch) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function relativeLuminance([lightness, chroma, hue]: Oklch) {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
