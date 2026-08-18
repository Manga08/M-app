import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase!.auth.getClaims();
    if (!data?.claims?.sub) redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
