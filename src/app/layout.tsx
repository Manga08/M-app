import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PwaRegister } from "@/components/pwa-register";
import { PwaThemeSync } from "@/components/pwa-theme-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PWA_ASSET_VERSION } from "@/lib/pwa-theme";
import { themeBootstrapMarkup } from "@/lib/theme-bootstrap";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Moneva", template: "%s · Moneva" },
  description: "Tus finanzas, claras hoy y mejores mañana.",
  applicationName: "Moneva",
  manifest: `/pwa/moneva/manifest-dark.webmanifest?v=${PWA_ASSET_VERSION}`,
  icons: {
    icon: [{ url: `/pwa/moneva/icon.svg?v=${PWA_ASSET_VERSION}`, type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: `/pwa/moneva/apple-touch-icon.png?v=${PWA_ASSET_VERSION}`, sizes: "180x180" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Moneva" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Moneva · Tu dinero, en calma.",
    description: "Presupuesto, movimientos y cuentas en un solo lugar.",
    locale: "es_CO",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Moneva · Tu dinero, en calma.", description: "Presupuesto, movimientos y cuentas en un solo lugar." },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#101512" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} data-palette="moneva" suppressHydrationWarning>
      <body><div hidden aria-hidden="true" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrapMarkup(nonce) }} /><ThemeProvider>{children}<PwaThemeSync /><PwaRegister />{process.env.VERCEL ? <SpeedInsights /> : null}<Toaster position="top-center" mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", right: 12, left: 12 }} /></ThemeProvider></body>
    </html>
  );
}
