import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moneva · Finanzas personales",
    short_name: "Moneva",
    description: "Tus finanzas, claras hoy y mejores mañana.",
    start_url: "/",
    display: "standalone",
    background_color: "#101512",
    theme_color: "#101512",
    lang: "es-CO",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/moneva-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/moneva-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/moneva-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo movimiento", short_name: "Nuevo", description: "Registrar un movimiento", url: "/?overlay=movement" },
      { name: "Plan financiero", short_name: "Plan", description: "Revisar estructura y montos", url: "/presupuestos" },
    ],
  };
}
