import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const publicPath = path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/offline");
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  const allowed = process.env.ALLOWED_OWNER_EMAIL?.toLowerCase();
  const authorized = Boolean(data?.claims && (!allowed || email === allowed));
  if (!publicPath && !authorized) return NextResponse.redirect(new URL("/login", request.url));
  if (path === "/login" && authorized) return NextResponse.redirect(new URL("/", request.url));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|moneva-icon.svg|manifest.webmanifest|sw.js).*)"],
};
