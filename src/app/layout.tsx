import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MotionProvider } from "@/components/motion-provider";
import { PwaRegister } from "@/components/pwa-register";
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
  manifest: "/manifest.webmanifest",
  icons: { icon: "/moneva-icon-192.png", apple: "/moneva-icon-192.png" },
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
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body><ThemeProvider><MotionProvider>{children}</MotionProvider><PwaRegister /><SpeedInsights /><Toaster richColors position="top-center" /></ThemeProvider></body>
    </html>
  );
}
