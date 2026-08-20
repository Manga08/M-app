import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moneva · Finanzas personales",
    short_name: "Moneva",
    description: "Tus finanzas, claras hoy y mejores mañana.",
    start_url: "/",
    display: "standalone",
    id: "/",
    background_color: "#101512",
    theme_color: "#101512",
    lang: "es-CO",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/pwa/moneva/icon-192.png?v=1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/moneva/icon-512.png?v=1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/moneva/maskable-512.png?v=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", short_name: "Nuevo", description: "Registrar un movimiento", url: "/?overlay=movement" },
      { name: "Plan financiero", short_name: "Plan", description: "Revisar estructura y montos", url: "/presupuestos" },
    ],
  };
}
