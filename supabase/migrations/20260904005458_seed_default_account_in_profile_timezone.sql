-- Keep the starter account on the user's local calendar date. PostgreSQL's
-- current_date follows the database session timezone (UTC in production),
-- which could otherwise create tomorrow's account after 19:00 in Colombia.
create or replace function private.provision_finance_user(
  p_user_id uuid,
  p_email text,
  p_user_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text := nullif(trim(coalesce(p_user_metadata ->> 'full_name', p_user_metadata ->> 'name', '')), '');
  profile_avatar text := nullif(trim(coalesce(p_user_metadata ->> 'avatar_url', p_user_metadata ->> 'picture', '')), '');
begin
  if p_user_id is null or p_email is null or not exists (
    select 1
    from private.access_allowlist
    where email = lower(trim(p_email))
      and enabled
  ) then
    return;
  end if;

  insert into public.profiles (id, email, display_name, avatar_url)
  values (p_user_id, lower(trim(p_email)), profile_name, profile_avatar)
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  insert into public.accounts (
    user_id,
    name,
    account_type,
    initial_balance,
    color,
    opening_balance_date,
    opening_exchange_rate
  )
  select
    p_user_id,
    'Efectivo',
    'cash',
    0,
    '#34d399',
    pg_catalog.timezone(
      coalesce(profile.timezone, 'America/Bogota'),
      pg_catalog.statement_timestamp()
    )::date,
    1
  from public.profiles profile
  where profile.id = p_user_id
    and not exists (
      select 1
      from public.accounts
      where user_id = p_user_id
    );

  insert into public.group_allocations (
    user_id,
    group_key,
    name,
    color,
    icon,
    target_percent,
    included_in_plan,
    sort_order,
    archived,
    is_default
  )
  values
    (p_user_id, 'needs', 'Necesidades', '#55a8f8', 'home', 0, false, 0, false, true),
    (p_user_id, 'wants', 'Gustos', '#fb7185', 'sparkles', 0, false, 1, false, true),
    (p_user_id, 'savings', 'Ahorros', '#34d399', 'piggy-bank', 0, false, 2, false, true),
    (p_user_id, 'investments', 'Inversiones', '#a78bfa', 'chart-no-axes-combined', 0, false, 3, false, true),
    (p_user_id, 'debts', 'Deudas', '#fb923c', 'landmark', 0, false, 4, false, true)
  on conflict (user_id, group_key) do nothing;

  insert into public.categories (
    user_id,
    name,
    category_group,
    transaction_kind,
    color,
    icon,
    is_default
  )
  select
    p_user_id,
    seed.name,
    seed.group_key,
    seed.kind,
    seed.color,
    seed.icon,
    true
  from (values
    ('Nómina', 'income', 'income', '#38d39f', 'briefcase'),
    ('Otros ingresos', 'income', 'income', '#78d8b6', 'coins'),
    ('Alimentación', 'needs', 'expense', '#55a8f8', 'utensils'),
    ('Vivienda', 'needs', 'expense', '#55a8f8', 'home'),
    ('Transporte', 'needs', 'expense', '#55a8f8', 'car'),
    ('Salud', 'needs', 'expense', '#55a8f8', 'heart-pulse'),
    ('Entretenimiento', 'wants', 'expense', '#fb7185', 'sparkles'),
    ('Comidas fuera', 'wants', 'expense', '#fb7185', 'coffee'),
    ('Fondo de emergencia', 'savings', 'expense', '#34d399', 'piggy-bank'),
    ('Inversiones', 'investments', 'expense', '#a78bfa', 'chart'),
    ('Pago de deudas', 'debts', 'expense', '#fb923c', 'landmark')
  ) as seed(name, group_key, kind, color, icon)
  where not exists (
    select 1
    from public.categories existing
    where existing.user_id = p_user_id
      and existing.name = seed.name
      and existing.transaction_kind = seed.kind
  );
end;
$$;

revoke all on function private.provision_finance_user(uuid, text, jsonb)
from public, anon, authenticated;
