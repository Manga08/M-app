import pwaThemes from "../../config/pwa-themes.json";
import type { ColorTheme } from "@/lib/finance/types";

export const PWA_THEME_STORAGE_KEY = "moneva:color-theme";
export const DEFAULT_PWA_THEME: ColorTheme = "moneva";
export const PWA_ASSET_VERSION = pwaThemes.version;

export type PwaThemeDefinition = {
  label: string;
  accent: string;
  accentDark: string;
  background: string;
  themeLight: string;
};

export const PWA_THEMES = pwaThemes.themes satisfies Record<ColorTheme, PwaThemeDefinition>;

export function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === "string" && Object.hasOwn(PWA_THEMES, value);
}

export function pwaAssetPath(theme: ColorTheme, asset: "icon" | "apple") {
  const version = `v=${PWA_ASSET_VERSION}`;
  if (asset === "icon") return `/pwa/${theme}/icon.svg?${version}`;
  return `/pwa/${theme}/apple-touch-icon.png?${version}`;
}

export function pwaManifestPath(theme: ColorTheme, dark: boolean) {
  return `/pwa/${theme}/manifest-${dark ? "dark" : "light"}.webmanifest?v=${PWA_ASSET_VERSION}`;
}

export function pwaBrowserColor(theme: ColorTheme, dark: boolean) {
  const definition = PWA_THEMES[theme];
  return dark ? definition.background : definition.themeLight;
}
