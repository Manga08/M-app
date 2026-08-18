-- Keep the hosted app private even if a user can complete an authentication
-- flow.  The allowlist lives outside the exposed public schema and is checked
-- again by a restrictive RLS policy on every user-data table.
create table private.access_allowlist (
  email text primary key,
  enabled boolean not null default true,
  access_role text not null default 'member' check (access_role in ('admin', 'member')),
  note text check (note is null or char_length(note) <= 160),
  created_at timestamptz not null default now(),
  constraint access_allowlist_email_check check (
    email = lower(trim(email))
    and char_length(email) between 3 and 320
    and position('@' in email) > 1
  )
);

revoke all on private.access_allowlist from public, anon, authenticated;

-- Preserve access for the Google users that already existed when this
-- migration was applied. Future users must be inserted into this table before
-- their first Google sign-in.
insert into private.access_allowlist (email, access_role, note)
select lower(trim(user_record.email)), 'admin', 'Administrador inicial existente al activar el acceso privado'
from auth.users user_record
where user_record.email is not null
  and exists (
    select 1
    from auth.identities identity_record
    where identity_record.user_id = user_record.id
      and identity_record.provider = 'google'
  )
on conflict (email) do nothing;

create or replace function public.is_current_user_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users user_record
    join private.access_allowlist allowed
      on allowed.email = lower(trim(user_record.email))
     and allowed.enabled
    where user_record.id = (select auth.uid())
      and user_record.email_confirmed_at is not null
      and exists (
        select 1
        from auth.identities identity_record
        where identity_record.user_id = user_record.id
          and identity_record.provider = 'google'
      )
  );
$$;

revoke all on function public.is_current_user_allowed() from public, anon, authenticated;
grant execute on function public.is_current_user_allowed() to authenticated;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users user_record
    join private.access_allowlist allowed
      on allowed.email = lower(trim(user_record.email))
     and allowed.enabled
     and allowed.access_role = 'admin'
    where user_record.id = (select auth.uid())
      and exists (
        select 1
        from auth.identities identity_record
        where identity_record.user_id = user_record.id
          and identity_record.provider = 'google'
      )
  );
$$;

revoke all on function public.is_current_user_admin() from public, anon, authenticated;
grant execute on function public.is_current_user_admin() to authenticated;

-- Shared provisioning is private and can be called both by the auth trigger
-- and when an administrator authorizes an account that signed in earlier.
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
  if p_user_id is null
     or p_email is null
     or not exists (
       select 1
       from private.access_allowlist allowed
       where allowed.email = lower(trim(p_email))
         and allowed.enabled
     ) then
    return;
  end if;

  insert into public.profiles (id, email, display_name, avatar_url)
  values (p_user_id, lower(trim(p_email)), profile_name, profile_avatar)
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  insert into public.accounts (user_id, name, account_type, initial_balance, color)
  select p_user_id, 'Efectivo', 'cash', 0, '#34d399'
  where not exists (select 1 from public.accounts where user_id = p_user_id);

  insert into public.group_allocations
    (user_id, group_key, name, color, icon, target_percent, included_in_plan, sort_order, archived, is_default)
  values
    (p_user_id, 'needs', 'Necesidades', '#55a8f8', 'home', 50, true, 0, false, true),
    (p_user_id, 'wants', 'Gustos', '#fb7185', 'sparkles', 30, true, 1, false, true),
    (p_user_id, 'savings', 'Ahorros', '#34d399', 'piggy-bank', 10, true, 2, false, true),
    (p_user_id, 'investments', 'Inversiones', '#a78bfa', 'chart-no-axes-combined', 10, true, 3, false, true),
    (p_user_id, 'debts', 'Deudas', '#fb923c', 'landmark', 0, false, 4, false, true)
  on conflict (user_id, group_key) do nothing;

  insert into public.categories (user_id, name, category_group, transaction_kind, color, icon, is_default)
  select p_user_id, seed.name, seed.group_key, seed.kind, seed.color, seed.icon, true
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
    select 1 from public.categories existing
    where existing.user_id = p_user_id
      and existing.name = seed.name
      and existing.transaction_kind = seed.kind
  );
end;
$$;

revoke all on function private.provision_finance_user(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.list_authorized_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select public.is_current_user_admin()) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'email', allowed.email,
      'role', allowed.access_role,
      'enabled', allowed.enabled,
      'createdAt', allowed.created_at,
      'hasSignedIn', exists (
        select 1
        from auth.users user_record
        where lower(trim(user_record.email)) = allowed.email
          and exists (
            select 1
            from auth.identities identity_record
            where identity_record.user_id = user_record.id
              and identity_record.provider = 'google'
          )
      )
    ) order by allowed.access_role, allowed.created_at, allowed.email
  ), '[]'::jsonb)
  into result
  from private.access_allowlist allowed;

  return result;
end;
$$;

create or replace function public.upsert_authorized_user(
  p_email text,
  p_access_role text default 'member',
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  caller_email text;
  current_role text;
  existing_user_id uuid;
  existing_user_metadata jsonb;
begin
  if not (select public.is_current_user_admin()) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if char_length(clean_email) not between 3 and 320 or position('@' in clean_email) <= 1 then
    raise exception 'invalid email address';
  end if;
  if p_access_role not in ('admin', 'member') then raise exception 'invalid access role'; end if;

  select lower(trim(user_record.email)) into caller_email
  from auth.users user_record
  where user_record.id = (select auth.uid());

  select allowed.access_role into current_role
  from private.access_allowlist allowed
  where allowed.email = clean_email;

  if clean_email = caller_email and (not p_enabled or p_access_role <> 'admin') then
    raise exception 'the current administrator cannot disable or demote their own access';
  end if;
  if current_role = 'admin'
     and (not p_enabled or p_access_role <> 'admin')
     and (select count(*) from private.access_allowlist where enabled and access_role = 'admin') <= 1 then
    raise exception 'at least one enabled administrator is required';
  end if;

  insert into private.access_allowlist (email, enabled, access_role)
  values (clean_email, p_enabled, p_access_role)
  on conflict (email) do update
    set enabled = excluded.enabled,
        access_role = excluded.access_role;

  if p_enabled then
    select user_record.id, user_record.raw_user_meta_data
    into existing_user_id, existing_user_metadata
    from auth.users user_record
    where lower(trim(user_record.email)) = clean_email
      and exists (
        select 1
        from auth.identities identity_record
        where identity_record.user_id = user_record.id
          and identity_record.provider = 'google'
      )
    limit 1;

    if existing_user_id is not null then
      perform private.provision_finance_user(existing_user_id, clean_email, existing_user_metadata);
    end if;
  end if;
end;
$$;

revoke all on function public.list_authorized_users() from public, anon, authenticated;
revoke all on function public.upsert_authorized_user(text, text, boolean) from public, anon, authenticated;
grant execute on function public.list_authorized_users() to authenticated;
grant execute on function public.upsert_authorized_user(text, text, boolean) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'recurring_rules',
    'group_allocations'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_private_access', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.is_current_user_allowed())) with check ((select public.is_current_user_allowed()))',
      table_name || '_private_access',
      table_name
    );
  end loop;
end;
$$;

-- Do not create application rows for an uninvited account.  This trigger runs
-- while the auth user is being created, so it uses provider metadata from the
-- new row rather than relying on auth.identities already being present.
create or replace function private.bootstrap_finance_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_google boolean := coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google';
begin
  if new.email is null
     or not is_google
     or not exists (
       select 1
       from private.access_allowlist allowed
       where allowed.email = lower(trim(new.email))
         and allowed.enabled
     ) then
    return new;
  end if;

  perform private.provision_finance_user(new.id, new.email, new.raw_user_meta_data);

  return new;
end;
$$;

revoke all on function private.bootstrap_finance_user() from public, anon, authenticated;

-- Exact account balances and current-month aggregates let the client remain
-- correct without downloading a user's complete transaction history.
create or replace function public.get_finance_snapshot(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  account_rows jsonb;
  category_rows jsonb;
  month_income numeric;
  month_expense numeric;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'month must be the first day of a month';
  end if;

  select coalesce(jsonb_object_agg(balance_row.id, balance_row.balance), '{}'::jsonb)
  into account_rows
  from (
    select account.id,
      account.initial_balance + coalesce(sum(
        case
          when movement.kind in ('income', 'transfer_in') then movement.amount
          else -movement.amount
        end
      ), 0) as balance
    from public.accounts account
    left join public.transactions movement
      on movement.user_id = caller_id
     and movement.account_id = account.id
    where account.user_id = caller_id
      and not account.archived
    group by account.id, account.initial_balance
  ) balance_row;

  select
    coalesce(sum(movement.amount) filter (where movement.kind = 'income'), 0),
    coalesce(sum(movement.amount) filter (where movement.kind = 'expense'), 0)
  into month_income, month_expense
  from public.transactions movement
  where movement.user_id = caller_id
    and movement.occurred_on >= p_month
    and movement.occurred_on < (p_month + interval '1 month')::date;

  select coalesce(jsonb_object_agg(category_row.category_id, category_row.spent), '{}'::jsonb)
  into category_rows
  from (
    select movement.category_id, sum(movement.amount) as spent
    from public.transactions movement
    where movement.user_id = caller_id
      and movement.kind = 'expense'
      and movement.category_id is not null
      and movement.occurred_on >= p_month
      and movement.occurred_on < (p_month + interval '1 month')::date
    group by movement.category_id
  ) category_row;

  return jsonb_build_object(
    'month', p_month,
    'income', month_income,
    'expense', month_expense,
    'accountBalances', account_rows,
    'categorySpending', category_rows
  );
end;
$$;

-- Keyset/cursor pagination stays fast on deep history pages and returns a
-- transfer's matching destination row without showing it as a duplicate.
create or replace function public.get_transactions_page(
  p_limit integer default 20,
  p_cursor_occurred_on date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_kind text default 'all',
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_query text := lower(trim(coalesce(p_query, '')));
  result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if p_kind not in ('all', 'expense', 'income', 'transfer') then raise exception 'invalid movement kind'; end if;
  if char_length(clean_query) > 100 then raise exception 'search is too long'; end if;
  if num_nonnulls(p_cursor_occurred_on, p_cursor_created_at, p_cursor_id) not in (0, 3) then
    raise exception 'cursor fields must be provided together';
  end if;

  with candidate_rows as (
    select movement.*,
      (
        select jsonb_build_object(
          'id', pair.id,
          'kind', pair.kind,
          'amount', pair.amount,
          'account_id', pair.account_id,
          'category_id', pair.category_id,
          'transfer_group_id', pair.transfer_group_id,
          'description', pair.description,
          'merchant', pair.merchant,
          'note', pair.note,
          'occurred_on', pair.occurred_on,
          'created_at', pair.created_at
        )
        from public.transactions pair
        where pair.user_id = caller_id
          and pair.transfer_group_id = movement.transfer_group_id
          and pair.kind = 'transfer_in'
        limit 1
      ) as transfer_pair
    from public.transactions movement
    where movement.user_id = caller_id
      and movement.kind <> 'transfer_in'
      and (
        p_kind = 'all'
        or movement.kind = p_kind
        or (p_kind = 'transfer' and movement.kind = 'transfer_out')
      )
      and (
        clean_query = ''
        or position(clean_query in lower(movement.description)) > 0
        or position(clean_query in lower(coalesce(movement.merchant, ''))) > 0
        or position(clean_query in lower(coalesce(movement.note, ''))) > 0
        or exists (
          select 1
          from public.categories category
          where category.user_id = caller_id
            and category.id = movement.category_id
            and position(clean_query in lower(category.name)) > 0
        )
      )
      and (
        p_cursor_occurred_on is null
        or (movement.occurred_on, movement.created_at, movement.id)
          < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
      )
    order by movement.occurred_on desc, movement.created_at desc, movement.id desc
    limit p_limit + 1
  ), page_rows as (
    select *
    from candidate_rows
    order by occurred_on desc, created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'kind', page.kind,
          'amount', page.amount,
          'account_id', page.account_id,
          'category_id', page.category_id,
          'transfer_group_id', page.transfer_group_id,
          'description', page.description,
          'merchant', page.merchant,
          'note', page.note,
          'occurred_on', page.occurred_on,
          'created_at', page.created_at,
          'transfer_pair', page.transfer_pair
        )
        order by page.occurred_on desc, page.created_at desc, page.id desc
      )
      from page_rows page
    ), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from candidate_rows),
    'nextCursor', (
      select jsonb_build_object(
        'occurredOn', last_row.occurred_on,
        'createdAt', last_row.created_at,
        'id', last_row.id
      )
      from page_rows last_row
      order by last_row.occurred_on, last_row.created_at, last_row.id
      limit 1
    )
  ) into result;

  return result;
end;
$$;

-- Reports are aggregated inside Postgres, so twelve months cost twelve result
-- rows regardless of how many individual movements exist.
create or replace function public.get_finance_report(
  p_end_month date,
  p_months integer default 12
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  first_month date;
  month_rows jsonb;
  group_rows jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_end_month is null or extract(day from p_end_month) <> 1 then
    raise exception 'end month must be the first day of a month';
  end if;
  if p_months not between 2 and 60 then raise exception 'months must be between 2 and 60'; end if;
  first_month := (p_end_month - make_interval(months => p_months - 1))::date;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month', series_row.month,
      'income', series_row.income,
      'expense', series_row.expense,
      'balance', series_row.income - series_row.expense
    ) order by series_row.month
  ), '[]'::jsonb)
  into month_rows
  from (
    select month_start::date as month,
      coalesce(sum(movement.amount) filter (where movement.kind = 'income'), 0) as income,
      coalesce(sum(movement.amount) filter (where movement.kind = 'expense'), 0) as expense
    from generate_series(first_month, p_end_month, interval '1 month') month_start
    left join public.transactions movement
      on movement.user_id = caller_id
     and movement.occurred_on >= month_start::date
     and movement.occurred_on < (month_start + interval '1 month')::date
    group by month_start
  ) series_row;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'group', group_row.group_key,
      'name', group_row.name,
      'color', group_row.color,
      'expense', group_row.expense,
      'targetPercent', group_row.target_percent,
      'includedInPlan', group_row.included_in_plan,
      'archived', group_row.archived
    ) order by group_row.sort_order, group_row.name
  ), '[]'::jsonb)
  into group_rows
  from (
    select finance_group.group_key,
      finance_group.name,
      finance_group.color,
      finance_group.target_percent,
      finance_group.included_in_plan,
      finance_group.archived,
      finance_group.sort_order,
      coalesce(sum(movement.amount), 0) as expense
    from public.group_allocations finance_group
    left join public.categories category
      on category.user_id = caller_id
     and category.category_group = finance_group.group_key
     and category.transaction_kind = 'expense'
    left join public.transactions movement
      on movement.user_id = caller_id
     and movement.category_id = category.id
     and movement.kind = 'expense'
     and movement.occurred_on >= first_month
     and movement.occurred_on < (p_end_month + interval '1 month')::date
    where finance_group.user_id = caller_id
    group by finance_group.group_key, finance_group.name, finance_group.color,
      finance_group.target_percent, finance_group.included_in_plan,
      finance_group.archived, finance_group.sort_order
    having not finance_group.archived or coalesce(sum(movement.amount), 0) > 0
  ) group_row;

  return jsonb_build_object(
    'startMonth', first_month,
    'endMonth', p_end_month,
    'months', month_rows,
    'groups', group_rows
  );
end;
$$;

drop index if exists public.transactions_user_date_idx;
create index transactions_user_cursor_idx
  on public.transactions (user_id, occurred_on desc, created_at desc, id desc);
create index if not exists categories_user_group_idx
  on public.categories (user_id, category_group, id);

revoke all on function public.get_finance_snapshot(date) from public, anon, authenticated;
revoke all on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_finance_report(date, integer) from public, anon, authenticated;
grant execute on function public.get_finance_snapshot(date) to authenticated;
grant execute on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.get_finance_report(date, integer) to authenticated;
