import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const themeConfig = JSON.parse(await readFile(path.join(projectRoot, "config/pwa-themes.json"), "utf8"));
const brandSymbol = JSON.parse(await readFile(path.join(projectRoot, "config/brand-symbol.json"), "utf8"));

function symbolSvg(primary, secondary) {
  const bridge = brandSymbol.bridge;
  return `<path d="${brandSymbol.leftPath}" fill="${primary}"/>
    <path d="${brandSymbol.rightPath}" fill="${secondary}"/>
    <rect x="${bridge.x}" y="${bridge.y}" width="${bridge.width}" height="${bridge.height}" rx="${bridge.rx}" fill="${primary}"/>`;
}

function pngToIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size === 256 ? 0 : size;
  header[7] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

function iconSvg(theme, { maskable = false } = {}) {
  const inset = maskable ? 66 : 0;
  const radius = maskable ? 0 : 120;
  const scale = maskable ? 0.75 : 1;
  const translate = maskable ? 64 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Moneva">
  <rect width="512" height="512" rx="${radius}" fill="${theme.background}"/>
  <g transform="translate(${translate} ${translate}) scale(${scale})">
    ${symbolSvg(theme.accent, theme.accentDark)}
  </g>
${maskable ? `  <rect x="${inset}" y="${inset}" width="${512 - inset * 2}" height="${512 - inset * 2}" rx="96" fill="none" stroke="${theme.accent}" stroke-opacity=".08"/>\n` : ""}</svg>`;
}

function manifest(themeKey, theme, dark) {
  return {
    id: "/",
    name: "Moneva · Finanzas personales",
    short_name: "Moneva",
    description: "Tus finanzas, claras hoy y mejores mañana.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: dark ? theme.background : theme.themeLight,
    theme_color: dark ? theme.background : theme.themeLight,
    lang: "es-CO",
    categories: ["finance", "productivity"],
    icons: [
      { src: `/pwa/${themeKey}/icon-192.png?v=${themeConfig.version}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa/${themeKey}/icon-512.png?v=${themeConfig.version}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa/${themeKey}/maskable-512.png?v=${themeConfig.version}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", short_name: "Nuevo", description: "Registrar un movimiento", url: "/?overlay=movement" },
      { name: "Plan financiero", short_name: "Plan", description: "Revisar estructura y montos", url: "/presupuestos" },
    ],
    prefer_related_applications: false,
  };
}

for (const [themeKey, theme] of Object.entries(themeConfig.themes)) {
  const outputDirectory = path.join(projectRoot, "public", "pwa", themeKey);
  await mkdir(outputDirectory, { recursive: true });
  const svg = iconSvg(theme);
  const maskableSvg = iconSvg(theme, { maskable: true });

  await Promise.all([
    writeFile(path.join(outputDirectory, "icon.svg"), svg),
    writeFile(path.join(outputDirectory, "manifest.webmanifest"), `${JSON.stringify(manifest(themeKey, theme, true), null, 2)}\n`),
    writeFile(path.join(outputDirectory, "manifest-dark.webmanifest"), `${JSON.stringify(manifest(themeKey, theme, true), null, 2)}\n`),
    writeFile(path.join(outputDirectory, "manifest-light.webmanifest"), `${JSON.stringify(manifest(themeKey, theme, false), null, 2)}\n`),
    sharp(Buffer.from(svg)).resize(32, 32).png().toFile(path.join(outputDirectory, "icon-32.png")),
    sharp(Buffer.from(svg)).resize(180, 180).png().toFile(path.join(outputDirectory, "apple-touch-icon.png")),
    sharp(Buffer.from(svg)).resize(192, 192).png().toFile(path.join(outputDirectory, "icon-192.png")),
    sharp(Buffer.from(svg)).resize(512, 512).png().toFile(path.join(outputDirectory, "icon-512.png")),
    sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile(path.join(outputDirectory, "maskable-512.png")),
  ]);
}

// Mantiene los nombres históricos como fallback para instalaciones existentes.
const fallback = themeConfig.themes.moneva;
const fallbackSvg = iconSvg(fallback);
const fallback32Png = await sharp(Buffer.from(fallbackSvg)).resize(32, 32).png().toBuffer();
await Promise.all([
  writeFile(path.join(projectRoot, "public", "moneva-icon.svg"), fallbackSvg),
  writeFile(path.join(projectRoot, "src", "app", "favicon.ico"), pngToIco(fallback32Png, 32)),
  sharp(Buffer.from(fallbackSvg)).resize(192, 192).png().toFile(path.join(projectRoot, "public", "moneva-icon-192.png")),
  sharp(Buffer.from(fallbackSvg)).resize(512, 512).png().toFile(path.join(projectRoot, "public", "moneva-icon-512.png")),
  sharp(Buffer.from(iconSvg(fallback, { maskable: true }))).resize(512, 512).png().toFile(path.join(projectRoot, "public", "moneva-maskable-512.png")),
]);
