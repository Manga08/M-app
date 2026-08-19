-- Convert Moneva from a single-owner app into an isolated multi-user app.
-- Every exposed row remains protected by RLS and every cross-table reference
-- includes user_id so one tenant cannot even reference another tenant's data.

drop table if exists public.app_owner cascade;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists theme_mode text not null default 'system',
  add column if not exists color_theme text not null default 'moneva';

alter table public.profiles
  drop constraint if exists profiles_theme_mode_check,
  add constraint profiles_theme_mode_check check (theme_mode in ('light', 'dark', 'system')),
  drop constraint if exists profiles_color_theme_check,
  add constraint profiles_color_theme_check check (color_theme in ('moneva', 'crimson', 'ocean', 'violet', 'amber')),
  drop constraint if exists profiles_avatar_url_check,
  add constraint profiles_avatar_url_check check (avatar_url is null or char_length(avatar_url) <= 2048);

create table public.group_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_key text not null check (group_key in ('needs', 'wants', 'savings', 'investments', 'debts')),
  target_percent numeric(5, 2) not null check (target_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_key)
);

alter table public.group_allocations enable row level security;

create index group_allocations_user_idx on public.group_allocations (user_id, group_key);
create trigger group_allocations_set_updated_at before update on public.group_allocations
for each row execute function public.set_updated_at();

-- Composite ownership keys prevent cross-tenant foreign-key references.
alter table public.accounts
  add constraint accounts_user_id_id_key unique (user_id, id);
alter table public.categories
  add constraint categories_user_id_id_key unique (user_id, id);

alter table public.transactions
  drop constraint if exists transactions_account_id_fkey,
  drop constraint if exists transactions_category_id_fkey,
  add constraint transactions_account_owner_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete restrict,
  add constraint transactions_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict;

alter table public.budgets
  drop constraint if exists budgets_category_id_fkey,
  add constraint budgets_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade;

alter table public.recurring_rules
  drop constraint if exists recurring_rules_account_id_fkey,
  drop constraint if exists recurring_rules_category_id_fkey,
  add constraint recurring_rules_account_owner_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade,
  add constraint recurring_rules_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.validate_group_allocation_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_user uuid := coalesce(new.user_id, old.user_id);
  row_count integer;
  percent_sum numeric;
begin
  if not exists (select 1 from public.profiles where id = target_user) then
    return coalesce(new, old);
  end if;
  select count(*), coalesce(sum(target_percent), 0)
  into row_count, percent_sum
  from public.group_allocations
  where user_id = target_user;
  if row_count <> 5 or percent_sum <> 100 then
    raise exception 'group allocations must contain five rows totaling 100';
  end if;
  return coalesce(new, old);
end;
$$;

create constraint trigger group_allocations_total_check
after insert or update or delete on public.group_allocations
deferrable initially deferred
for each row execute function private.validate_group_allocation_total();

-- Auth is the source of truth for email and Google avatar. The client can only
-- edit non-authoritative profile preferences.
create or replace function private.bootstrap_finance_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  profile_avatar text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')), '');
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (new.id, lower(coalesce(new.email, '')), profile_name, profile_avatar)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  insert into public.accounts (user_id, name, account_type, initial_balance, color)
  select new.id, 'Efectivo', 'cash', 0, '#34d399'
  where not exists (select 1 from public.accounts where user_id = new.id);

  insert into public.categories (user_id, name, category_group, transaction_kind, color, icon, is_default)
  select new.id, seed.name, seed.group_key, seed.kind, seed.color, seed.icon, true
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
  on conflict (user_id, name, transaction_kind) do nothing;

  insert into public.group_allocations (user_id, group_key, target_percent)
  values
    (new.id, 'needs', 50),
    (new.id, 'wants', 30),
    (new.id, 'savings', 10),
    (new.id, 'investments', 10),
    (new.id, 'debts', 0)
  on conflict (user_id, group_key) do nothing;

  return new;
end;
$$;

revoke all on function private.bootstrap_finance_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_bootstrap_finance on auth.users;
create trigger on_auth_user_bootstrap_finance
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.bootstrap_finance_user();

-- Backfill profiles and defaults for users created before this migration.
insert into public.profiles (id, email, display_name, avatar_url)
select id,
       lower(coalesce(email, '')),
       nullif(trim(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', '')), ''),
       nullif(trim(coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture', '')), '')
from auth.users
on conflict (id) do update
  set email = excluded.email,
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

insert into public.group_allocations (user_id, group_key, target_percent)
select profile.id, allocation.group_key, allocation.target_percent
from public.profiles profile
cross join (values
  ('needs', 50::numeric),
  ('wants', 30::numeric),
  ('savings', 10::numeric),
  ('investments', 10::numeric),
  ('debts', 0::numeric)
) as allocation(group_key, target_percent)
on conflict (user_id, group_key) do nothing;
