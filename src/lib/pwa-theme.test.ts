import { describe, expect, it } from "vitest";
import { isColorTheme, PWA_THEMES, pwaAssetPath, pwaBrowserColor, pwaManifestPath } from "@/lib/pwa-theme";

describe("identidad PWA por paleta", () => {
  it("reconoce únicamente las cinco paletas disponibles", () => {
    expect(Object.keys(PWA_THEMES)).toEqual(["moneva", "crimson", "ocean", "violet", "amber"]);
    expect(isColorTheme("crimson")).toBe(true);
    expect(isColorTheme("custom")).toBe(true);
    expect(isColorTheme("neon")).toBe(false);
  });

  it("genera rutas versionadas para no conservar assets antiguos", () => {
    expect(pwaAssetPath("ocean", "icon")).toBe("/pwa/ocean/icon.svg?v=1");
    expect(pwaAssetPath("ocean", "apple")).toBe("/pwa/ocean/apple-touch-icon.png?v=1");
    expect(pwaManifestPath("ocean", false)).toBe("/pwa/ocean/manifest-light.webmanifest?v=1");
    expect(pwaManifestPath("ocean", true)).toBe("/pwa/ocean/manifest-dark.webmanifest?v=1");
    expect(pwaAssetPath("custom", "icon", "#123ABC")).toBe("/pwa/custom/icon.svg?color=123ABC&v=2");
    expect(pwaAssetPath("custom", "apple", "#123ABC")).toBe("/pwa/custom/icon.png?size=180&color=123ABC&v=2");
    expect(pwaManifestPath("custom", false, "#123ABC")).toBe("/pwa/custom/manifest.webmanifest?dark=0&color=123ABC&v=2");
  });

  it("usa un fondo apropiado para cada modo del navegador", () => {
    expect(pwaBrowserColor("moneva", false)).toBe("#f7f5ef");
    expect(pwaBrowserColor("crimson", true)).toBe("#17080c");
  });
});
