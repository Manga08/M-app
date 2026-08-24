"use client";

import { useLayoutEffect } from "react";
import {
  DEFAULT_PWA_THEME,
  isColorTheme,
  PWA_THEME_STORAGE_KEY,
  pwaAssetPath,
  pwaBrowserColor,
  pwaManifestPath,
} from "@/lib/pwa-theme";
import type { ColorTheme } from "@/lib/finance/types";
import { applyCustomThemeToElement, CUSTOM_THEME_STORAGE_KEY, DEFAULT_CUSTOM_THEME_COLOR, normalizeHexColor } from "@/lib/custom-theme";

function readStoredTheme(): ColorTheme {
  try {
    const stored = window.localStorage.getItem(PWA_THEME_STORAGE_KEY) ?? window.localStorage.getItem("moneva:color-theme");
    return isColorTheme(stored) ? stored : DEFAULT_PWA_THEME;
  } catch {
    return DEFAULT_PWA_THEME;
  }
}

function readStoredCustomColor() {
  try {
    return normalizeHexColor(window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)) ?? DEFAULT_CUSTOM_THEME_COLOR;
  } catch {
    return DEFAULT_CUSTOM_THEME_COLOR;
  }
}

function synchronizePwaIdentity(theme: ColorTheme, customColor: string) {
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const icon = pwaAssetPath(theme, "icon", customColor);
  const apple = pwaAssetPath(theme, "apple", customColor);
  const manifest = pwaManifestPath(theme, dark, customColor);
  const browserColor = pwaBrowserColor(theme, dark, customColor);

  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach((link) => {
    link.href = icon;
    link.type = "image/svg+xml";
  });
  ensureLink("icon", icon, { type: "image/svg+xml", sizes: "any" });

  document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]').forEach((link) => {
    link.href = apple;
    link.sizes = "180x180";
  });
  ensureLink("apple-touch-icon", apple, { sizes: "180x180" });

  document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]').forEach((link) => {
    link.href = manifest;
  });
  ensureLink("manifest", manifest);

  const themeColors = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColors.length === 0) ensureMeta("theme-color", browserColor);
  themeColors.forEach((meta) => {
    meta.content = browserColor;
    meta.removeAttribute("media");
  });
  ensureMeta("msapplication-TileColor", browserColor);

  try {
    window.localStorage.setItem(PWA_THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, customColor);
  } catch {
    // La identidad visual sigue funcionando aunque el navegador bloquee storage.
  }
}

function ensureLink(rel: string, href: string, attributes: Record<string, string> = {}) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[data-moneva-pwa="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.dataset.monevaPwa = rel;
    link.rel = rel;
    document.head.append(link);
  }
  link.href = href;
  Object.entries(attributes).forEach(([name, value]) => link?.setAttribute(name, value));
}

function ensureMeta(name: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

export function PwaThemeSync() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const storedTheme = readStoredTheme();
    const storedCustomColor = readStoredCustomColor();
    applyCustomThemeToElement(root, storedCustomColor);
    root.dataset.palette = storedTheme;

    const applyCurrentIdentity = () => {
      const theme = isColorTheme(root.dataset.palette) ? root.dataset.palette : DEFAULT_PWA_THEME;
      const customColor = normalizeHexColor(root.dataset.customColor) ?? storedCustomColor;
      synchronizePwaIdentity(theme, customColor);
    };

    applyCurrentIdentity();
    const rootObserver = new MutationObserver(applyCurrentIdentity);
    rootObserver.observe(root, { attributes: true, attributeFilter: ["class", "data-palette", "data-custom-color"] });

    // Next puede transmitir metadatos después de hidratar o al navegar. Volvemos
    // a aplicar la identidad cuando añade nodos para que nunca gane un fallback.
    const headObserver = new MutationObserver(applyCurrentIdentity);
    headObserver.observe(document.head, { childList: true });

    return () => {
      rootObserver.disconnect();
      headObserver.disconnect();
    };
  }, []);

  return null;
}
