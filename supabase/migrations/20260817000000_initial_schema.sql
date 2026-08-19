-- Moneva initial schema. Run with the Supabase CLI or SQL editor.
-- After this migration, insert the single allowed address into public.app_owner.

create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  currency_code text not null default 'COP' check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/Bogota',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  month_starts_on smallint not null default 1 check (month_starts_on between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  account_type text not null check (account_type in ('checking', 'savings', 'cash', 'credit', 'investment')),
  initial_balance numeric(18, 2) not null default 0,
  color text not null default '#34d399' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category_group text not null check (category_group in ('needs', 'wants', 'savings', 'investments', 'debts', 'income')),
  transaction_kind text not null check (transaction_kind in ('income', 'expense')),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'tag',
  is_default boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, transaction_kind)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null check (kind in ('income', 'expense', 'transfer_out', 'transfer_in')),
  amount numeric(18, 2) not null check (amount > 0),
  transfer_group_id uuid,
  description text not null check (char_length(description) between 1 and 200),
  merchant text check (merchant is null or char_length(merchant) <= 120),
  note text check (note is null or char_length(note) <= 1000),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_transfer_shape check (
    (kind in ('transfer_out', 'transfer_in') and transfer_group_id is not null and category_id is null)
    or (kind in ('income', 'expense') and transfer_group_id is null)
  )
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(18, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(18, 2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 200),
  merchant text,
  cadence text not null check (cadence in ('weekly', 'monthly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count > 0),
  next_run_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Foreign keys and primary app queries are indexed explicitly.
create index accounts_user_active_idx on public.accounts (user_id, created_at) where archived = false;
create index categories_user_active_idx on public.categories (user_id, transaction_kind) where archived = false;
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_category_id_idx on public.transactions (category_id) where category_id is not null;
create index transactions_transfer_group_idx on public.transactions (transfer_group_id) where transfer_group_id is not null;
create index budgets_user_month_idx on public.budgets (user_id, month, category_id);
create index budgets_category_id_idx on public.budgets (category_id);
create index recurring_rules_user_due_idx on public.recurring_rules (user_id, next_run_on) where active = true;
create index recurring_rules_account_id_idx on public.recurring_rules (account_id);
create index recurring_rules_category_id_idx on public.recurring_rules (category_id) where category_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
create trigger recurring_rules_set_updated_at before update on public.recurring_rules for each row execute function public.set_updated_at();

-- RLS checks both row ownership and the single allowlisted Google email.
alter table public.app_owner enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_rules enable row level security;

create policy app_owner_select_self on public.app_owner for select to authenticated
using (lower(email) = lower((select auth.jwt() ->> 'email')));

create policy profiles_select_owner on public.profiles for select to authenticated
using (id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy profiles_insert_owner on public.profiles for insert to authenticated
with check (id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy profiles_update_owner on public.profiles for update to authenticated
using (id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))))
with check (id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

create policy accounts_select_owner on public.accounts for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy accounts_insert_owner on public.accounts for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy accounts_update_owner on public.accounts for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email')))) with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy accounts_delete_owner on public.accounts for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

create policy categories_select_owner on public.categories for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy categories_insert_owner on public.categories for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy categories_update_owner on public.categories for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email')))) with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy categories_delete_owner on public.categories for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

create policy transactions_select_owner on public.transactions for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy transactions_insert_owner on public.transactions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy transactions_update_owner on public.transactions for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email')))) with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy transactions_delete_owner on public.transactions for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

create policy budgets_select_owner on public.budgets for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy budgets_insert_owner on public.budgets for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy budgets_update_owner on public.budgets for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email')))) with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy budgets_delete_owner on public.budgets for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

create policy recurring_rules_select_owner on public.recurring_rules for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy recurring_rules_insert_owner on public.recurring_rules for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy recurring_rules_update_owner on public.recurring_rules for update to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email')))) with check (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));
create policy recurring_rules_delete_owner on public.recurring_rules for delete to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.app_owner where lower(email) = lower((select auth.jwt() ->> 'email'))));

-- A transfer is always written as a balanced pair inside one transaction.
create or replace function public.create_transfer(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_on date,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  transfer_id uuid := gen_random_uuid();
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_source_account_id = p_destination_account_id then raise exception 'source and destination must differ'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  insert into public.transactions (user_id, account_id, kind, amount, transfer_group_id, description, note, occurred_on)
  values
    (caller_id, p_source_account_id, 'transfer_out', p_amount, transfer_id, p_description, p_note, p_occurred_on),
    (caller_id, p_destination_account_id, 'transfer_in', p_amount, transfer_id, p_description, p_note, p_occurred_on);
  return transfer_id;
end;
$$;

-- Supabase 2026 Data API permissions are explicit; RLS remains the second layer.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.app_owner to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.accounts, public.categories, public.transactions, public.budgets, public.recurring_rules to authenticated;
grant execute on function public.create_transfer(uuid, uuid, numeric, text, date, text) to authenticated;

revoke all on public.app_owner from anon;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
