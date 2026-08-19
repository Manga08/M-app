import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === "production") return new NextResponse("Moneva no está configurado de forma segura.", { status: 503 });
    return NextResponse.next();
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = buildContentSecurityPolicy(url, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const createResponse = () => {
    const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
    nextResponse.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return nextResponse;
  };

  let response = createResponse();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = createResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const publicPath = path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/offline") || path.startsWith("/acceso-denegado");
  const authenticated = Boolean(data?.claims?.sub);
  if (!publicPath && !authenticated) return secureRedirect(new URL("/login", request.url), contentSecurityPolicy);
  if (path === "/login" && authenticated) return secureRedirect(new URL("/", request.url), contentSecurityPolicy);
  return response;
}

function buildContentSecurityPolicy(supabaseUrl: string, nonce: string) {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const websocketOrigin = supabaseOrigin.replace(/^http/, "ws");
  const development = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    `connect-src 'self' ${supabaseOrigin} ${websocketOrigin}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function secureRedirect(url: URL, contentSecurityPolicy: string) {
  const response = NextResponse.redirect(url);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!_next/static|_next/image|_vercel/|favicon.ico|moneva-icon.svg|moneva-icon-192.png|moneva-icon-512.png|moneva-maskable-512.png|brand-icons.svg|manifest.webmanifest|sw.js).*)",
    missing: [
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ],
  }],
};
