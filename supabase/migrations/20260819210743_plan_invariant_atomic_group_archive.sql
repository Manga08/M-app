-- A plan can be intentionally empty (zero included groups and zero percent),
-- otherwise every included group must add up to exactly 100 percent.
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

  select count(*),
         count(*) filter (where included_in_plan),
         coalesce(sum(target_percent) filter (where included_in_plan), 0)
  into active_count, included_count, percent_sum
  from public.group_allocations
  where user_id = target_user
    and archived = false;

  if active_count = 0 then
    raise exception 'at least one active finance group is required';
  end if;
  if not (
    (included_count = 0 and percent_sum = 0)
    or (included_count > 0 and percent_sum = 100)
  ) then
    raise exception 'included finance groups must be empty at 0 or total exactly 100';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.validate_group_allocation_plan() from public, anon, authenticated;

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
  if p_allocations is null or jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'allocations must be an array';
  end if;

  -- Serialize plan writes and group archives for this tenant. The stable order
  -- avoids deadlocks when two tabs mutate the same plan concurrently.
  perform finance_group.group_key
  from public.group_allocations finance_group
  where finance_group.user_id = caller_id
    and finance_group.archived = false
  order by finance_group.group_key
  for update;

  select count(*) into active_count
  from public.group_allocations
  where user_id = caller_id
    and archived = false;

  select count(*),
         count(distinct input.group_key),
         count(*) filter (where input.included),
         coalesce(sum(input.percent) filter (where input.included), 0),
         count(*) filter (
           where input.group_key is null
              or input.percent is null
              or input.percent < 0
              or input.percent > 100
              or input.percent <> round(input.percent, 2)
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
  if invalid_count <> 0
     or (included_count = 0 and allocation_sum <> 0)
     or (included_count > 0 and allocation_sum <> 100) then
    raise exception 'included allocations must be empty at 0 or total exactly 100';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations)
      as input(group_key text, percent numeric, included boolean, sort_order integer)
    where not exists (
      select 1
      from public.group_allocations finance_group
      where finance_group.user_id = caller_id
        and finance_group.group_key = input.group_key
        and finance_group.archived = false
    )
  ) then
    raise exception 'one or more finance groups are unavailable';
  end if;

  update public.group_allocations finance_group
  set target_percent = input.percent,
      included_in_plan = input.included,
      sort_order = input.sort_order
  from jsonb_to_recordset(p_allocations)
    as input(group_key text, percent numeric, included boolean, sort_order integer)
  where finance_group.user_id = caller_id
    and finance_group.group_key = input.group_key
    and finance_group.archived = false;
end;
$$;

-- Category writes take a key-share lock on their active group. Archiving takes
-- an update lock, so a concurrent insert cannot land in a group after it moves
-- its existing categories and becomes archived.
create or replace function private.validate_category_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived then
    return new;
  end if;
  if new.transaction_kind = 'income' then
    if new.category_group <> 'income' then
      raise exception 'income categories must use the income group';
    end if;
    return new;
  end if;

  perform finance_group.group_key
  from public.group_allocations finance_group
  where finance_group.user_id = new.user_id
    and finance_group.group_key = new.category_group
    and finance_group.archived = false
  for share;

  if not found then
    raise exception 'the selected finance group is not available';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_category_group() from public, anon, authenticated;
drop trigger if exists categories_validate_group on public.categories;
create trigger categories_validate_group
before insert or update of user_id, category_group, transaction_kind, archived on public.categories
for each row execute function private.validate_category_group();

create or replace function public.archive_finance_group_atomic(
  p_group_key text,
  p_allocations jsonb,
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
  active_count integer;
  source_archived boolean;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_destination_group_key is not null and p_archive_categories then
    raise exception 'choose either moving or archiving subcategories';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'allocations must be an array';
  end if;

  -- Lock this tenant's groups in a deterministic order. Including archived
  -- rows makes a WAL retry after a lost response idempotent.
  perform finance_group.group_key
  from public.group_allocations finance_group
  where finance_group.user_id = caller_id
  order by finance_group.group_key
  for update;

  select finance_group.archived
  into source_archived
  from public.group_allocations finance_group
  where finance_group.user_id = caller_id
    and finance_group.group_key = p_group_key;

  if not found then raise exception 'finance group not found'; end if;
  if source_archived then
    if exists (
      select 1
      from public.categories category
      where category.user_id = caller_id
        and category.category_group = p_group_key
        and category.transaction_kind = 'expense'
        and category.archived = false
    ) then
      raise exception 'archived finance group still has active subcategories';
    end if;
    return;
  end if;

  select count(*) into active_count
  from public.group_allocations
  where user_id = caller_id
    and archived = false;

  if active_count <= 1 then
    raise exception 'at least one active finance group must remain';
  end if;
  if p_destination_group_key is not null and (
    p_destination_group_key = p_group_key
    or not exists (
      select 1
      from public.group_allocations
      where user_id = caller_id
        and group_key = p_destination_group_key
        and archived = false
    )
  ) then
    raise exception 'destination group is not available';
  end if;

  -- The allocation RPC validates that every currently active group appears
  -- exactly once, then applies the complete 0-or-100 plan while locks are held.
  perform public.set_group_allocations(p_allocations);

  if exists (
    select 1
    from public.group_allocations
    where user_id = caller_id
      and group_key = p_group_key
      and (included_in_plan or target_percent <> 0)
  ) then
    raise exception 'the archived group must be excluded from the plan at 0 percent';
  end if;

  perform category.id
  from public.categories category
  where category.user_id = caller_id
    and category.category_group = p_group_key
    and category.transaction_kind = 'expense'
    and category.archived = false
  order by category.id
  for update;

  if p_destination_group_key is not null then
    update public.categories
    set category_group = p_destination_group_key
    where user_id = caller_id
      and category_group = p_group_key
      and transaction_kind = 'expense'
      and archived = false;
  elsif p_archive_categories then
    update public.categories
    set archived = true
    where user_id = caller_id
      and category_group = p_group_key
      and transaction_kind = 'expense'
      and archived = false;
  elsif exists (
    select 1
    from public.categories
    where user_id = caller_id
      and category_group = p_group_key
      and transaction_kind = 'expense'
      and archived = false
  ) then
    raise exception 'move or archive the subcategories before archiving this group';
  end if;

  update public.group_allocations
  set archived = true,
      included_in_plan = false,
      target_percent = 0
  where user_id = caller_id
    and group_key = p_group_key
    and archived = false;

  if not found then raise exception 'finance group not found'; end if;
end;
$$;

-- Keep already-durable queue items from older clients replayable. New clients
-- always call archive_finance_group_atomic with their complete allocation set.
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
  current_allocations jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;

  select jsonb_agg(
    jsonb_build_object(
      'group_key', finance_group.group_key,
      'percent', finance_group.target_percent,
      'included', finance_group.included_in_plan,
      'sort_order', finance_group.sort_order
    )
    order by finance_group.sort_order, finance_group.group_key
  )
  into current_allocations
  from public.group_allocations finance_group
  where finance_group.user_id = caller_id
    and finance_group.archived = false;

  perform public.archive_finance_group_atomic(
    p_group_key,
    current_allocations,
    p_destination_group_key,
    p_archive_categories
  );
end;
$$;

revoke all on function public.set_group_allocations(jsonb) from public, anon, authenticated;
revoke all on function public.archive_finance_group_atomic(text, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.archive_finance_group(text, text, boolean) from public, anon, authenticated;

grant execute on function public.set_group_allocations(jsonb) to authenticated;
grant execute on function public.archive_finance_group_atomic(text, jsonb, text, boolean) to authenticated;
grant execute on function public.archive_finance_group(text, text, boolean) to authenticated;
