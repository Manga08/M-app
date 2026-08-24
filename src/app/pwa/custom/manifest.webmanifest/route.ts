import { customPwaTheme, normalizeHexColor } from "@/lib/custom-theme";

export const runtime = "nodejs";

export function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const color = normalizeHexColor(searchParams.get("color"));
  if (!color) return new Response("Color inválido", { status: 400 });
  const dark = searchParams.get("dark") === "1";
  const theme = customPwaTheme(color);
  const encodedColor = encodeURIComponent(color.slice(1));
  const version = encodeURIComponent(searchParams.get("v") ?? "2");
  const iconQuery = `color=${encodedColor}&v=${version}`;

  return Response.json({
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
      { src: `/pwa/custom/icon.png?size=192&${iconQuery}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa/custom/icon.png?size=512&${iconQuery}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa/custom/icon.png?size=512&maskable=1&${iconQuery}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", short_name: "Nuevo", description: "Registrar un movimiento", url: "/?overlay=movement" },
      { name: "Plan financiero", short_name: "Plan", description: "Revisar estructura y montos", url: "/presupuestos" },
    ],
    prefer_related_applications: false,
  }, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "application/manifest+json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
