import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase!.auth.getClaims();
    const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
    const allowedEmail = process.env.ALLOWED_OWNER_EMAIL?.toLowerCase();
    if (!data?.claims || (allowedEmail && email !== allowedEmail)) redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
