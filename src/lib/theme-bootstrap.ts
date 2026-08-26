import {
  CUSTOM_THEME_STORAGE_KEY,
  CUSTOM_THEME_TOKEN_NAMES,
  CUSTOM_THEME_TOKENS_STORAGE_KEY,
} from "@/lib/custom-theme";
import { PWA_THEME_STORAGE_KEY } from "@/lib/pwa-theme";

const PALETTES = ["moneva", "crimson", "ocean", "violet", "amber", "custom"] as const;

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const root = document.documentElement;
    const allowed = ${JSON.stringify(PALETTES)};
    const stored = localStorage.getItem(${JSON.stringify(PWA_THEME_STORAGE_KEY)}) || localStorage.getItem("moneva:color-theme");
    const palette = allowed.includes(stored) ? stored : "moneva";
    if (palette !== "custom") {
      root.dataset.palette = palette;
      return;
    }

    const color = localStorage.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE_KEY)});
    const cached = JSON.parse(localStorage.getItem(${JSON.stringify(CUSTOM_THEME_TOKENS_STORAGE_KEY)}) || "null");
    const names = ${JSON.stringify(CUSTOM_THEME_TOKEN_NAMES)};
    const validColor = typeof color === "string" && /^#[0-9A-F]{6}$/i.test(color);
    const validCache = cached && cached.color === color && cached.light && cached.dark;
    if (!validColor || !validCache) return;

    for (const mode of ["light", "dark"]) {
      for (const name of names) {
        const value = cached[mode][name];
        if (typeof value !== "string" || !/^oklch\\([0-9.]+ [0-9.]+ [0-9.]+(?: \\/ [0-9.]+)?\\)$/.test(value)) return;
        root.style.setProperty("--custom-" + mode + "-" + name, value);
      }
    }
    root.dataset.customColor = color;
    root.dataset.palette = "custom";
  } catch {}
})();`;

export function themeBootstrapMarkup(nonce?: string) {
  const safeNonce = nonce && /^[A-Za-z0-9+/_=-]+$/.test(nonce) ? nonce : undefined;
  const nonceAttribute = safeNonce ? ` nonce="${safeNonce}"` : "";
  const script = THEME_BOOTSTRAP_SCRIPT.replaceAll("</script", "<\\/script");
  return `<script id="moneva-theme-bootstrap"${nonceAttribute}>${script}</script>`;
}
