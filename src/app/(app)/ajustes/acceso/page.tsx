import { redirect } from "next/navigation";
import { AccessAdminPage, type AuthorizedUser } from "@/components/access-admin-page";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Acceso privado" };

export default async function Page() {
  const supabase = await createClient();
  if (!supabase) redirect("/ajustes");
  const { data, error } = await supabase.rpc("is_current_user_admin");
  if (error || data !== true) redirect("/ajustes");
  const { data: users, error: usersError } = await supabase.rpc("list_authorized_users");
  return <AccessAdminPage initialUsers={Array.isArray(users) ? users as AuthorizedUser[] : []} initialError={usersError?.message ?? null} />;
}
