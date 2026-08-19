-- Income types reuse the existing categories table so historical movements,
-- reports, exports and tenant ownership keep a single source of truth.
-- Both functions run as the caller: category RLS remains authoritative.

create or replace function public.upsert_income_type(
  p_id uuid,
  p_name text,
  p_color text,
  p_icon text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_name text := trim(p_name);
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_id is null then raise exception 'income type id is required'; end if;
  if char_length(clean_name) not between 1 and 100 then
    raise exception 'income type name must contain 1 to 100 characters';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid income type color'; end if;
  if char_length(p_icon) not between 1 and 80 then raise exception 'invalid income type icon'; end if;

  insert into public.categories
    (id, user_id, name, category_group, transaction_kind, color, icon, is_default, archived)
  values
    (p_id, caller_id, clean_name, 'income', 'income', lower(p_color), p_icon, false, false)
  on conflict (id) do update
    set name = excluded.name,
        color = excluded.color,
        icon = excluded.icon,
        archived = false
  where categories.user_id = caller_id
    and categories.transaction_kind = 'income';

  if not exists (
    select 1
    from public.categories
    where id = p_id
      and user_id = caller_id
      and transaction_kind = 'income'
      and archived = false
  ) then
    raise exception 'income type could not be saved';
  end if;

  return p_id;
end;
$$;

create or replace function public.archive_income_type(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;

  update public.categories
  set archived = true
  where id = p_id
    and user_id = caller_id
    and transaction_kind = 'income'
    and archived = false;

  if not found then raise exception 'income type not found'; end if;
end;
$$;

revoke all on function public.upsert_income_type(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.archive_income_type(uuid)
  from public, anon, authenticated;

grant execute on function public.upsert_income_type(uuid, text, text, text)
  to authenticated;
grant execute on function public.archive_income_type(uuid)
  to authenticated;
