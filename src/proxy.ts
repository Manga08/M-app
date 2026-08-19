import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalDestination } from "@/lib/auth/safe-next";

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
      setAll: (cookiesToSet, headersToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set("cookie", request.cookies.toString());
        response = preserveSupabaseResponseState(response, createResponse());
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const publicPath = path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/offline") || path.startsWith("/acceso-denegado");
  const authenticated = Boolean(data?.claims?.sub);
  if (!publicPath && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return secureRedirect(loginUrl, contentSecurityPolicy, response);
  }
  if (path === "/login" && authenticated) {
    const requestedNext = request.nextUrl.searchParams.get("next");
    const next = safeInternalDestination(requestedNext, request.nextUrl.origin);
    return secureRedirect(new URL(next, request.url), contentSecurityPolicy, response);
  }
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

function secureRedirect(url: URL, contentSecurityPolicy: string, source: NextResponse) {
  const redirect = preserveSupabaseResponseState(source, NextResponse.redirect(url));
  redirect.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return redirect;
}

function preserveSupabaseResponseState(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));

  // @supabase/ssr sends these with refreshed auth cookies so a CDN can never
  // cache one user's session response and serve it to another user.
  ["Cache-Control", "Expires", "Pragma"].forEach((name) => {
    const value = source.headers.get(name);
    if (value !== null) target.headers.set(name, value);
  });

  return target;
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
