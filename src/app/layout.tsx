import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MotionProvider } from "@/components/motion-provider";
import { PwaRegister } from "@/components/pwa-register";
import { PwaThemeSync } from "@/components/pwa-theme-sync";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Moneva", template: "%s · Moneva" },
  description: "Tus finanzas, claras hoy y mejores mañana.",
  applicationName: "Moneva",
  manifest: "/pwa/moneva/manifest-dark.webmanifest?v=1",
  icons: {
    icon: [{ url: "/pwa/moneva/icon.svg?v=1", type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: "/pwa/moneva/apple-touch-icon.png?v=1", sizes: "180x180" }],
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} data-palette="moneva" suppressHydrationWarning>
      <body><ThemeProvider><MotionProvider>{children}</MotionProvider><PwaThemeSync /><PwaRegister />{process.env.VERCEL ? <SpeedInsights /> : null}<Toaster position="top-center" mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", right: 12, left: 12 }} /></ThemeProvider></body>
    </html>
  );
}
