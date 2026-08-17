import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/";
  const supabase = await createClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const { data } = await supabase.auth.getUser();
  const allowed = process.env.ALLOWED_OWNER_EMAIL?.toLowerCase();
  if (allowed && data.user?.email?.toLowerCase() !== allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=unauthorized", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
