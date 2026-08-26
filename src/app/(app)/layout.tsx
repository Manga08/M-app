import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FinanceProvider, type FinanceIdentity } from "@/components/finance-provider";
import { MotionProvider } from "@/components/motion-provider";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  let identity: FinanceIdentity | undefined;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase!.auth.getClaims();
    if (!data?.claims?.sub) redirect("/login");
    const { data: allowed, error } = await supabase!.rpc("is_current_user_allowed");
    if (error || allowed !== true) redirect("/acceso-denegado");
    const metadata = data.claims.user_metadata && typeof data.claims.user_metadata === "object" ? data.claims.user_metadata as Record<string, unknown> : {};
    const displayName = stringClaim(metadata.full_name) || stringClaim(metadata.name) || stringClaim(data.claims.email)?.split("@")[0] || "Usuario";
    identity = {
      id: data.claims.sub,
      email: stringClaim(data.claims.email),
      displayName,
      avatarUrl: stringClaim(metadata.avatar_url) || stringClaim(metadata.picture) || undefined,
    };
  }
  return <MotionProvider><FinanceProvider initialIdentity={identity}><AppShell>{children}</AppShell></FinanceProvider></MotionProvider>;
}

function stringClaim(value: unknown) {
  return typeof value === "string" ? value : "";
}
