-- Reject uninvited identities before Supabase Auth persists them. The official
-- Before User Created hook and the database trigger share the same allowlist
-- predicate; the trigger keeps hosted environments fail-closed even if hook
-- configuration has not been pushed yet.
create or replace function private.is_auth_user_creation_allowed(
  p_email text,
  p_app_metadata jsonb
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_email is not null
    and (
      coalesce(p_app_metadata ->> 'provider', '') = 'google'
      or coalesce(p_app_metadata -> 'providers', '[]'::jsonb) @> '["google"]'::jsonb
    )
    and exists (
      select 1
      from private.access_allowlist allowed
      where allowed.email = lower(trim(p_email))
        and allowed.enabled
    );
$$;

create or replace function private.before_user_created_allowlist(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if private.is_auth_user_creation_allowed(
    event -> 'user' ->> 'email',
    coalesce(event -> 'user' -> 'app_metadata', '{}'::jsonb)
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Esta cuenta de Google no está autorizada para acceder a Moneva.'
    )
  );
end;
$$;

create or replace function private.reject_unauthorized_auth_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_auth_user_creation_allowed(new.email, new.raw_app_meta_data) then
    raise exception using
      errcode = '28000',
      message = 'Esta cuenta de Google no está autorizada para acceder a Moneva.';
  end if;

  return new;
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant select on private.access_allowlist to supabase_auth_admin;
grant execute on function private.is_auth_user_creation_allowed(text, jsonb) to supabase_auth_admin;
grant execute on function private.before_user_created_allowlist(jsonb) to supabase_auth_admin;

revoke all on function private.is_auth_user_creation_allowed(text, jsonb)
  from public, anon, authenticated;
revoke all on function private.before_user_created_allowlist(jsonb)
  from public, anon, authenticated;
revoke all on function private.reject_unauthorized_auth_user()
  from public, anon, authenticated;

drop trigger if exists auth_users_reject_unauthorized_before_insert on auth.users;
create trigger auth_users_reject_unauthorized_before_insert
before insert on auth.users
for each row execute function private.reject_unauthorized_auth_user();

-- Remove identities that were created before the pre-insert barrier existed.
-- Cascades clear their Auth sessions/identities; authorized users are untouched.
delete from auth.users auth_user
where auth_user.email is null
   or not exists (
     select 1
     from private.access_allowlist allowed
     where allowed.email = lower(trim(auth_user.email))
       and allowed.enabled
   );
