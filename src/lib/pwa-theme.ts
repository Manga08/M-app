import pwaThemes from "../../config/pwa-themes.json";
import type { ColorTheme } from "@/lib/finance/types";
import { customPwaTheme, DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor } from "@/lib/custom-theme";

export const PWA_THEME_STORAGE_KEY = "moneva:color-theme:v2";
export const DEFAULT_PWA_THEME: ColorTheme = "moneva";
export const PWA_ASSET_VERSION = pwaThemes.version;
export type PresetColorTheme = Exclude<ColorTheme, "custom">;

export type PwaThemeDefinition = {
  label: string;
  accent: string;
  accentDark: string;
  background: string;
  themeLight: string;
};

export const PWA_THEMES = pwaThemes.themes satisfies Record<PresetColorTheme, PwaThemeDefinition>;

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === "custom" || (typeof value === "string" && Object.hasOwn(PWA_THEMES, value));
}

function customColorQuery(customColor?: string) {
  const color = normalizeHexColor(customColor) ?? DEFAULT_CUSTOM_THEME_COLOR;
  return `color=${encodeURIComponent(color.slice(1))}&v=${PWA_ASSET_VERSION + 1}`;
}

export function pwaAssetPath(theme: ColorTheme, asset: "icon" | "apple", customColor?: string) {
  if (theme === "custom") {
    const query = customColorQuery(customColor);
    if (asset === "icon") return `/pwa/custom/icon.svg?${query}`;
    return `/pwa/custom/icon.png?size=180&${query}`;
  }
  const version = `v=${PWA_ASSET_VERSION}`;
  if (asset === "icon") return `/pwa/${theme}/icon.svg?${version}`;
  return `/pwa/${theme}/apple-touch-icon.png?${version}`;
}

export function pwaManifestPath(theme: ColorTheme, dark: boolean, customColor?: string) {
  if (theme === "custom") return `/pwa/custom/manifest.webmanifest?dark=${dark ? "1" : "0"}&${customColorQuery(customColor)}`;
  return `/pwa/${theme}/manifest-${dark ? "dark" : "light"}.webmanifest?v=${PWA_ASSET_VERSION}`;
}

export function pwaBrowserColor(theme: ColorTheme, dark: boolean, customColor?: string) {
  if (theme === "custom") {
    const definition = customPwaTheme(customColor ?? DEFAULT_CUSTOM_THEME_COLOR);
    return dark ? definition.background : definition.themeLight;
  }
  const definition = PWA_THEMES[theme];
  return dark ? definition.background : definition.themeLight;
}
