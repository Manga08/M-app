import { describe, expect, it } from "vitest";
import {
  accessibleAccentOnWhite,
  contrastRatio,
  customPwaTheme,
  customThemeTokens,
  monevaIconSvg,
  normalizeHexColor,
} from "@/lib/custom-theme";

describe("custom theme", () => {
  it("normalizes safe HEX values and rejects everything else", () => {
    expect(normalizeHexColor("5b6ef5")).toBe("#5B6EF5");
    expect(normalizeHexColor("#0af")).toBe("#00AAFF");
    expect(normalizeHexColor("#12345g")).toBeNull();
    expect(normalizeHexColor("url(javascript:alert(1))")).toBeNull();
  });

  it.each(["#FFFF00", "#000000", "#FFFFFF", "#22C55E", "#7C3AED"])("creates a visible PWA mark from %s", (color) => {
    const theme = customPwaTheme(color);
    expect(contrastRatio(theme.accent, theme.background)).toBeGreaterThanOrEqual(3);
    expect(theme.background).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.themeLight).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("derives a complete light and dark semantic palette", () => {
    const light = customThemeTokens("#C026D3", "light");
    const dark = customThemeTokens("#C026D3", "dark");
    expect(Object.keys(light)).toHaveLength(22);
    expect(Object.keys(dark)).toEqual(Object.keys(light));
    expect(light.primary).not.toBe(dark.primary);
    expect(light.background).not.toBe(dark.background);
  });

  it.each(["#FFFF00", "#F8FAFC", "#36D399"])("keeps exported report headers readable for %s", (color) => {
    expect(contrastRatio(accessibleAccentOnWhite(color), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("escapes the icon input by accepting only normalized color output", () => {
    const svg = monevaIconSvg("\"><script>alert(1)</script>");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("aria-label=\"Moneva\"");
  });
});
