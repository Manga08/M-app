import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Real PostgreSQL in memory. Only Supabase's managed Auth/Storage/Cron shells
 * are stubbed; all financial tables, constraints, functions and RLS are real. */
export async function createFinancePostgres() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create role supabase_auth_admin; create role authenticator;
    create schema auth; create schema storage; create schema extensions;
    create schema cron;
    create table auth.users (
      id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table auth.identities (id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text);
    create table auth.sessions (id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
    $$;
    grant usage on schema auth to anon,authenticated,service_role,supabase_auth_admin;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/'); $$;
    create table cron.job(jobid bigint generated always as identity,jobname text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint; $$;
    create function cron.unschedule(bigint) returns boolean language sql as $$ select true; $$;
  `);
  const migrations = path.resolve("supabase/migrations");
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = (await readFile(path.join(migrations, name), "utf8"))
      .replace(/create extension if not exists pg_cron with schema pg_catalog;/gi, "");
    try { await db.exec(sql); }
    catch (error) { await db.close(); throw new Error(`Migration ${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  }
  return db;
}
