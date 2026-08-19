import { NextResponse } from "next/server";
import { safeInternalDestination } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next = safeInternalDestination(requestedNext, url.origin);
  const supabase = await createClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { data: allowed, error: accessError } = await supabase.rpc("is_current_user_allowed");
  if (accessError || allowed !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.redirect(new URL("/acceso-denegado", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
