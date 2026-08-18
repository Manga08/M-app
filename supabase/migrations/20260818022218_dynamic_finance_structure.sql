-- Turn the original five fixed allocations into a user-owned, dynamic finance
-- structure. Historical rows are archived instead of deleted so transactions
-- and budgets never lose their category labels.

drop trigger if exists group_allocations_total_check on public.group_allocations;
drop function if exists private.validate_group_allocation_total();

alter table public.group_allocations
  drop constraint if exists group_allocations_group_key_check,
  add column if not exists name text,
  add column if not exists color text,
  add column if not exists icon text,
  add column if not exists included_in_plan boolean,
  add column if not exists sort_order integer,
  add column if not exists archived boolean,
  add column if not exists is_default boolean;

update public.group_allocations
set name = case group_key
      when 'needs' then 'Necesidades'
      when 'wants' then 'Gustos'
      when 'savings' then 'Ahorros'
      when 'investments' then 'Inversiones'
      when 'debts' then 'Deudas'
      else initcap(replace(group_key, '_', ' '))
    end,
    color = case group_key
      when 'needs' then '#55a8f8'
      when 'wants' then '#fb7185'
      when 'savings' then '#34d399'
      when 'investments' then '#a78bfa'
      when 'debts' then '#fb923c'
      else '#64748b'
    end,
    icon = case group_key
      when 'needs' then 'home'
      when 'wants' then 'sparkles'
      when 'savings' then 'piggy-bank'
      when 'investments' then 'chart-no-axes-combined'
      when 'debts' then 'landmark'
      else 'folder'
    end,
    included_in_plan = true,
    sort_order = case group_key
      when 'needs' then 0
      when 'wants' then 1
      when 'savings' then 2
      when 'investments' then 3
      when 'debts' then 4
      else 100
    end,
    archived = false,
    is_default = group_key in ('needs', 'wants', 'savings', 'investments', 'debts')
where name is null
   or color is null
   or icon is null
   or included_in_plan is null
   or sort_order is null
   or archived is null
   or is_default is null;

alter table public.group_allocations
  alter column name set not null,
  alter column color set not null,
  alter column icon set not null,
  alter column included_in_plan set not null,
  alter column included_in_plan set default false,
  alter column sort_order set not null,
  alter column sort_order set default 0,
  alter column archived set not null,
  alter column archived set default false,
  alter column is_default set not null,
  alter column is_default set default false,
  add constraint group_allocations_key_format_check check (group_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  add constraint group_allocations_name_length_check check (char_length(trim(name)) between 1 and 60),
  add constraint group_allocations_color_check check (color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint group_allocations_icon_check check (char_length(icon) between 1 and 50),
  add constraint group_allocations_sort_order_check check (sort_order between 0 and 1000),
  add constraint group_allocations_excluded_zero_check check (included_in_plan or target_percent = 0),
  add constraint group_allocations_archived_shape_check check (not archived or (not included_in_plan and target_percent = 0));

create unique index group_allocations_active_name_idx
  on public.group_allocations (user_id, lower(trim(name)))
  where archived = false;
create index group_allocations_user_order_idx
  on public.group_allocations (user_id, archived, sort_order, created_at);

create or replace function private.validate_group_allocation_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_user uuid := coalesce(new.user_id, old.user_id);
  active_count integer;
  included_count integer;
  percent_sum numeric;
begin
  if not exists (select 1 from public.profiles where id = target_user) then
    return coalesce(new, old);
  end if;
  select count(*), count(*) filter (where included_in_plan),
         coalesce(sum(target_percent) filter (where included_in_plan), 0)
  into active_count, included_count, percent_sum
  from public.group_allocations
  where user_id = target_user and archived = false;
  if active_count = 0 or included_count = 0 or percent_sum <> 100 then
    raise exception 'active finance groups must contain an included plan totaling 100';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.validate_group_allocation_plan() from public, anon, authenticated;
create constraint trigger group_allocations_plan_check
after insert or update or delete on public.group_allocations
deferrable initially deferred
for each row execute function private.validate_group_allocation_plan();

create or replace function private.protect_group_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived and not old.archived and exists (
    select 1 from public.categories
    where user_id = old.user_id
      and category_group = old.group_key
      and transaction_kind = 'expense'
      and archived = false
  ) then
    raise exception 'active subcategories must be moved or archived first';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_group_archive() from public, anon, authenticated;
create trigger group_allocations_protect_archive
before update of archived on public.group_allocations
for each row execute function private.protect_group_archive();

alter table public.categories
  drop constraint if exists categories_category_group_check,
  drop constraint if exists categories_user_id_name_transaction_kind_key,
  add constraint categories_group_shape_check check (
    (transaction_kind = 'income' and category_group = 'income')
    or
    (transaction_kind = 'expense' and category_group <> 'income' and char_length(category_group) between 1 and 64)
  );

create unique index categories_active_name_kind_idx
  on public.categories (user_id, lower(trim(name)), transaction_kind)
  where archived = false;
create index categories_user_group_active_idx
  on public.categories (user_id, category_group, created_at)
  where archived = false and transaction_kind = 'expense';

create or replace function private.validate_category_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_kind = 'income' then
    if new.category_group <> 'income' then
      raise exception 'income categories must use the income group';
    end if;
  elsif not exists (
    select 1
    from public.group_allocations group_row
    where group_row.user_id = new.user_id
      and group_row.group_key = new.category_group
      and group_row.archived = false
  ) then
    raise exception 'the selected finance group is not available';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_category_group() from public, anon, authenticated;
drop trigger if exists categories_validate_group on public.categories;
create trigger categories_validate_group
before insert or update of user_id, category_group, transaction_kind on public.categories
for each row execute function private.validate_category_group();

create or replace function public.set_group_allocations(p_allocations jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  input_count integer;
  active_count integer;
  unique_count integer;
  included_count integer;
  allocation_sum numeric;
  invalid_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'allocations must be an array'; end if;

  select count(*) into active_count
  from public.group_allocations
  where user_id = caller_id and archived = false;

  select count(*), count(distinct input.group_key),
         count(*) filter (where input.included),
         coalesce(sum(input.percent) filter (where input.included), 0),
         count(*) filter (
           where input.group_key is null
              or input.percent is null
              or input.percent < 0
              or input.percent > 100
              or input.included is null
              or input.sort_order is null
              or input.sort_order < 0
              or input.sort_order > 1000
              or (not input.included and input.percent <> 0)
         )
  into input_count, unique_count, included_count, allocation_sum, invalid_count
  from jsonb_to_recordset(p_allocations)
    as input(group_key text, percent numeric, included boolean, sort_order integer);

  if active_count = 0 or input_count <> active_count or unique_count <> active_count then
    raise exception 'every active finance group must appear exactly once';
  end if;
  if invalid_count <> 0 or included_count = 0 or allocation_sum <> 100 then
    raise exception 'included allocations must be valid and total exactly 100';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations)
      as input(group_key text, percent numeric, included boolean, sort_order integer)
    where not exists (
      select 1 from public.group_allocations group_row
      where group_row.user_id = caller_id
        and group_row.group_key = input.group_key
        and group_row.archived = false
    )
  ) then
    raise exception 'one or more finance groups are unavailable';
  end if;

  update public.group_allocations group_row
  set target_percent = input.percent,
      included_in_plan = input.included,
      sort_order = input.sort_order
  from jsonb_to_recordset(p_allocations)
    as input(group_key text, percent numeric, included boolean, sort_order integer)
  where group_row.user_id = caller_id
    and group_row.group_key = input.group_key
    and group_row.archived = false;
end;
$$;

create or replace function public.upsert_finance_group(
  p_id uuid,
  p_group_key text,
  p_name text,
  p_color text,
  p_icon text,
  p_sort_order integer
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
  if p_id is null then raise exception 'group id is required'; end if;
  if p_group_key !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then raise exception 'invalid group key'; end if;
  if char_length(clean_name) not between 1 and 60 then raise exception 'group name must contain 1 to 60 characters'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid group color'; end if;
  if char_length(p_icon) not between 1 and 50 then raise exception 'invalid group icon'; end if;
  if p_sort_order not between 0 and 1000 then raise exception 'invalid group order'; end if;

  insert into public.group_allocations
    (id, user_id, group_key, name, color, icon, target_percent, included_in_plan, sort_order, archived, is_default)
  values
    (p_id, caller_id, p_group_key, clean_name, lower(p_color), p_icon, 0, false, p_sort_order, false, false)
  on conflict (id) do update
    set name = excluded.name,
        color = excluded.color,
        icon = excluded.icon,
        sort_order = excluded.sort_order
  where group_allocations.user_id = caller_id
    and group_allocations.group_key = p_group_key
    and group_allocations.archived = false;

  if not exists (
    select 1 from public.group_allocations
    where id = p_id and user_id = caller_id and group_key = p_group_key and archived = false
  ) then
    raise exception 'finance group could not be saved';
  end if;
  return p_id;
end;
$$;

create or replace function public.upsert_finance_category(
  p_id uuid,
  p_name text,
  p_group_key text,
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
  if p_id is null then raise exception 'category id is required'; end if;
  if char_length(clean_name) not between 1 and 100 then raise exception 'category name must contain 1 to 100 characters'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid category color'; end if;
  if char_length(p_icon) not between 1 and 50 then raise exception 'invalid category icon'; end if;
  if not exists (
    select 1 from public.group_allocations
    where user_id = caller_id and group_key = p_group_key and archived = false
  ) then
    raise exception 'the selected finance group is not available';
  end if;

  insert into public.categories
    (id, user_id, name, category_group, transaction_kind, color, icon, is_default, archived)
  values
    (p_id, caller_id, clean_name, p_group_key, 'expense', lower(p_color), p_icon, false, false)
  on conflict (id) do update
    set name = excluded.name,
        category_group = excluded.category_group,
        color = excluded.color,
        icon = excluded.icon,
        archived = false
  where categories.user_id = caller_id
    and categories.transaction_kind = 'expense';

  if not exists (select 1 from public.categories where id = p_id and user_id = caller_id and archived = false) then
    raise exception 'category could not be saved';
  end if;
  return p_id;
end;
$$;

create or replace function public.archive_finance_category(p_id uuid)
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
  where id = p_id and user_id = caller_id and transaction_kind = 'expense' and archived = false;
  if not found then raise exception 'category not found'; end if;
end;
$$;

create or replace function public.archive_finance_group(
  p_group_key text,
  p_destination_group_key text default null,
  p_archive_categories boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_color text;
begin
  if caller_id is null then raise exception 'authentication required'; end if;

  select color into source_color
  from public.group_allocations
  where user_id = caller_id and group_key = p_group_key and archived = false;
  if source_color is null then raise exception 'finance group not found'; end if;
  if exists (
    select 1 from public.group_allocations
    where user_id = caller_id and group_key = p_group_key
      and (included_in_plan or target_percent <> 0)
  ) then
    raise exception 'remove the group from the percentage plan before archiving it';
  end if;

  if p_destination_group_key is not null then
    if p_destination_group_key = p_group_key or not exists (
      select 1 from public.group_allocations
      where user_id = caller_id and group_key = p_destination_group_key and archived = false
    ) then
      raise exception 'destination group is not available';
    end if;
    update public.categories
    set category_group = p_destination_group_key
    where user_id = caller_id and category_group = p_group_key
      and transaction_kind = 'expense' and archived = false;
  elsif p_archive_categories then
    update public.categories
    set archived = true
    where user_id = caller_id and category_group = p_group_key
      and transaction_kind = 'expense' and archived = false;
  elsif exists (
    select 1 from public.categories
    where user_id = caller_id and category_group = p_group_key
      and transaction_kind = 'expense' and archived = false
  ) then
    raise exception 'move or archive the subcategories before archiving this group';
  end if;

  update public.group_allocations
  set archived = true, included_in_plan = false, target_percent = 0
  where user_id = caller_id and group_key = p_group_key and archived = false;
end;
$$;

-- The auth trigger keeps the same defaults for new users, but those defaults
-- are now ordinary editable rows rather than hard-coded application enums.
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

  insert into public.group_allocations
    (user_id, group_key, name, color, icon, target_percent, included_in_plan, sort_order, archived, is_default)
  values
    (new.id, 'needs', 'Necesidades', '#55a8f8', 'home', 50, true, 0, false, true),
    (new.id, 'wants', 'Gustos', '#fb7185', 'sparkles', 30, true, 1, false, true),
    (new.id, 'savings', 'Ahorros', '#34d399', 'piggy-bank', 10, true, 2, false, true),
    (new.id, 'investments', 'Inversiones', '#a78bfa', 'chart-no-axes-combined', 10, true, 3, false, true),
    (new.id, 'debts', 'Deudas', '#fb923c', 'landmark', 0, true, 4, false, true)
  on conflict (user_id, group_key) do nothing;

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
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.set_group_allocations(jsonb) from public, anon, authenticated;
revoke all on function public.upsert_finance_group(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.upsert_finance_category(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.archive_finance_category(uuid) from public, anon, authenticated;
revoke all on function public.archive_finance_group(text, text, boolean) from public, anon, authenticated;

revoke update, delete on public.group_allocations, public.categories from authenticated;
grant select, insert on public.group_allocations, public.categories to authenticated;
grant update (name, color, icon, target_percent, included_in_plan, sort_order, archived)
  on public.group_allocations to authenticated;
grant update (name, category_group, color, icon, archived)
  on public.categories to authenticated;
grant execute on function public.set_group_allocations(jsonb) to authenticated;
grant execute on function public.upsert_finance_group(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.upsert_finance_category(uuid, text, text, text, text) to authenticated;
grant execute on function public.archive_finance_category(uuid) to authenticated;
grant execute on function public.archive_finance_group(text, text, boolean) to authenticated;

revoke all on function private.bootstrap_finance_user() from public, anon, authenticated;
