export const DEFAULT_CUSTOM_THEME_COLOR = "#5B6EF5";

export const CUSTOM_THEME_STORAGE_KEY = "moneva:custom-theme-color:v1";
export const CUSTOM_THEME_TOKENS_STORAGE_KEY = "moneva:custom-theme-tokens:v1";

export const CUSTOM_THEME_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type CustomThemeMode = "light" | "dark";

export type CustomThemeTokens = Record<(typeof CUSTOM_THEME_TOKEN_NAMES)[number], string>;

type Rgb = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  const short = /^#?([\da-f]{3})$/i.exec(clean)?.[1];
  if (short) return `#${short.split("").map((character) => character.repeat(2)).join("")}`.toUpperCase();
  const full = /^#?([\da-f]{6})$/i.exec(clean)?.[1];
  return full ? `#${full.toUpperCase()}` : null;
}

export function isHexColor(value: unknown): value is string {
  return normalizeHexColor(value) !== null;
}

function hexToRgb(value: string): Rgb {
  const normalized = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  const channel = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

export function mixHexColor(from: string, to: string, amount: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const weight = clamp(amount, 0, 1);
  return rgbToHex({
    r: start.r + (end.r - start.r) * weight,
    g: start.g + (end.g - start.g) * weight,
    b: start.b + (end.b - start.b) * weight,
  });
}

function linearChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(value: string) {
  const { r, g, b } = hexToRgb(value);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleAccentOnWhite(value: string) {
  let color = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  for (let step = 0; step < 12 && contrastRatio(color, "#FFFFFF") < 4.5; step += 1) {
    color = mixHexColor(color, "#000000", 0.12);
  }
  return color;
}

function oklchSeed(value: string) {
  const rgb = hexToRgb(value);
  const r = linearChannel(rgb.r);
  const g = linearChannel(rgb.g);
  const b = linearChannel(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.sqrt(a * a + labB * labB);
  const rawHue = Math.atan2(labB, a) * 180 / Math.PI;
  return { hue: round((rawHue + 360) % 360, 2), chroma };
}

function oklch(lightness: number, chroma: number, hue: number, alpha?: number) {
  return `oklch(${round(lightness)} ${round(chroma)} ${round((hue + 360) % 360, 2)}${alpha === undefined ? "" : ` / ${round(alpha)}`})`;
}

export function customThemeTokens(value: string, mode: CustomThemeMode): CustomThemeTokens {
  const color = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  const seed = oklchSeed(color);
  const hue = seed.chroma < 0.008 ? 163 : seed.hue;
  const chroma = seed.chroma < 0.008 ? 0.012 : clamp(seed.chroma, 0.075, 0.19);
  const surfaceChroma = clamp(chroma * 0.09, 0.006, 0.018);
  const secondaryHue = (hue + 72) % 360;
  const tertiaryHue = (hue + 148) % 360;
  const fourthHue = (hue + 218) % 360;
  const fifthHue = (hue + 292) % 360;

  if (mode === "dark") {
    return {
      background: oklch(0.125, surfaceChroma, hue),
      foreground: oklch(0.96, 0.008, hue),
      card: oklch(0.16, surfaceChroma * 1.15, hue),
      "card-foreground": oklch(0.96, 0.008, hue),
      popover: oklch(0.175, surfaceChroma * 1.25, hue),
      "popover-foreground": oklch(0.96, 0.008, hue),
      primary: oklch(0.73, clamp(chroma, 0.075, 0.17), hue),
      "primary-foreground": oklch(0.13, surfaceChroma, hue),
      secondary: oklch(0.2, surfaceChroma * 1.15, hue),
      "secondary-foreground": oklch(0.94, 0.008, hue),
      muted: oklch(0.2, surfaceChroma * 1.15, hue),
      "muted-foreground": oklch(0.67, 0.012, hue),
      accent: oklch(0.25, clamp(chroma * 0.35, 0.025, 0.062), hue),
      "accent-foreground": oklch(0.88, clamp(chroma * 0.58, 0.045, 0.1), hue),
      border: oklch(0.98, 0.01, hue, 0.12),
      input: oklch(0.5, 0.014, hue),
      ring: oklch(0.73, clamp(chroma, 0.075, 0.17), hue),
      "chart-1": oklch(0.72, clamp(chroma, 0.075, 0.17), hue),
      "chart-2": oklch(0.7, 0.15, secondaryHue),
      "chart-3": oklch(0.72, 0.16, tertiaryHue),
      "chart-4": oklch(0.71, 0.15, fourthHue),
      "chart-5": oklch(0.74, 0.15, fifthHue),
    };
  }

  return {
    background: oklch(0.975, surfaceChroma * 0.52, hue),
    foreground: oklch(0.19, surfaceChroma, hue),
    card: oklch(0.995, surfaceChroma * 0.32, hue),
    "card-foreground": oklch(0.19, surfaceChroma, hue),
    popover: oklch(0.995, surfaceChroma * 0.32, hue),
    "popover-foreground": oklch(0.19, surfaceChroma, hue),
    primary: oklch(0.49, clamp(chroma, 0.075, 0.18), hue),
    "primary-foreground": oklch(0.985, 0.004, hue),
    secondary: oklch(0.94, surfaceChroma * 0.72, hue),
    "secondary-foreground": oklch(0.24, surfaceChroma * 1.2, hue),
    muted: oklch(0.935, surfaceChroma * 0.65, hue),
    "muted-foreground": oklch(0.48, surfaceChroma, hue),
    accent: oklch(0.93, clamp(chroma * 0.27, 0.025, 0.05), hue),
    "accent-foreground": oklch(0.33, clamp(chroma * 0.58, 0.045, 0.105), hue),
    border: oklch(0.82, surfaceChroma * 0.72, hue),
    input: oklch(0.62, surfaceChroma * 0.72, hue),
    ring: oklch(0.49, clamp(chroma, 0.075, 0.18), hue),
    "chart-1": oklch(0.62, clamp(chroma, 0.075, 0.18), hue),
    "chart-2": oklch(0.64, 0.15, secondaryHue),
    "chart-3": oklch(0.66, 0.16, tertiaryHue),
    "chart-4": oklch(0.65, 0.15, fourthHue),
    "chart-5": oklch(0.69, 0.15, fifthHue),
  };
}

export function applyCustomThemeToElement(element: HTMLElement, value: string) {
  const color = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  const light = customThemeTokens(color, "light");
  const dark = customThemeTokens(color, "dark");
  element.dataset.customColor = color;
  for (const [name, token] of Object.entries(light)) element.style.setProperty(`--custom-light-${name}`, token);
  for (const [name, token] of Object.entries(dark)) element.style.setProperty(`--custom-dark-${name}`, token);
  return color;
}

export function customThemeTokenCache(value: string) {
  const color = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  return { color, light: customThemeTokens(color, "light"), dark: customThemeTokens(color, "dark") };
}

export function customPwaTheme(value: string) {
  const color = normalizeHexColor(value) ?? DEFAULT_CUSTOM_THEME_COLOR;
  const darkBackground = mixHexColor("#0C100E", color, 0.13);
  const lightBackground = mixHexColor("#F7F5EF", color, 0.035);
  const visibleAccent = contrastRatio(color, darkBackground) >= 3
    ? color
    : mixHexColor(color, "#FFFFFF", 0.52);
  return {
    accent: visibleAccent,
    accentDark: mixHexColor(visibleAccent, darkBackground, 0.38),
    background: darkBackground,
    themeLight: lightBackground,
  };
}

export function monevaIconSvg(value: string, options: { maskable?: boolean } = {}) {
  const theme = customPwaTheme(value);
  const maskable = options.maskable ?? false;
  const inset = maskable ? 66 : 0;
  const radius = maskable ? 0 : 120;
  const scale = maskable ? 0.75 : 1;
  const translate = maskable ? 64 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Moneva">
  <rect width="512" height="512" rx="${radius}" fill="${theme.background}"/>
  <g transform="translate(${translate} ${translate}) scale(${scale})">
    <path d="M112 352 192 128h70l-80 224z" fill="${theme.accent}"/>
    <path d="m250 128 70 0 80 224h-70z" fill="${theme.accentDark}"/>
    <rect x="166" y="306" width="180" height="52" rx="26" fill="${theme.accent}"/>
  </g>
${maskable ? `  <rect x="${inset}" y="${inset}" width="${512 - inset * 2}" height="${512 - inset * 2}" rx="96" fill="none" stroke="${theme.accent}" stroke-opacity=".08"/>\n` : ""}</svg>`;
}
