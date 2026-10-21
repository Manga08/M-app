import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let client: SupabaseClient<Database> | null | undefined;

export function hasPublicSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function createClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key ? createBrowserClient<Database>(url, key) : null;
  return client;
}

/** Per-operation client: never mutate headers on the shared browser client. */
export function withExternalRevision(source: SupabaseClient<Database>, revision: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return source;
  return createSupabaseClient<Database>(url, key, {
    accessToken: async () => (await source.auth.getSession()).data.session?.access_token ?? null,
    global: { headers: { "X-Moneva-External-Revision": revision } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
