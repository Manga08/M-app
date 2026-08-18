import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const requestedDestination = requestedNext ? new URL(requestedNext, url.origin) : null;
  const next = requestedDestination?.origin === url.origin
    ? `${requestedDestination.pathname}${requestedDestination.search}${requestedDestination.hash}`
    : "/";
  const supabase = await createClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
