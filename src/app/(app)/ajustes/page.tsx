import { SettingsPage } from "@/components/settings-page";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ajustes" };
export default async function Page() {
  const supabase = await createClient();
  const { data } = supabase ? await supabase.rpc("is_current_user_admin") : { data: false };
  return <SettingsPage isAdmin={data === true} />;
}
