-- Plan v2: ordered subcategories, atomic monthly budgets and read-only
-- simulation seeds. Existing budgets and group allocation history remain intact.

alter table public.categories
  add column if not exists sort_order integer;

with ordered_categories as (
  select category.id,
         row_number() over (
           partition by category.user_id, category.transaction_kind, category.category_group
           order by category.archived, category.created_at, category.id
         ) - 1 as position
  from public.categories category
)
update public.categories category
set sort_order = ordered_categories.position
from ordered_categories
where category.id = ordered_categories.id
  and category.sort_order is null;

alter table public.categories
  alter column sort_order set default 0,
  alter column sort_order set not null,
  add constraint categories_sort_order_check check (sort_order between 0 and 1000);

create index if not exists categories_user_group_order_idx
  on public.categories (user_id, transaction_kind, category_group, archived, sort_order, created_at);

create table public.monthly_budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  income_target numeric(18, 2) not null default 0 check (income_target >= 0),
  source text not null default 'manual' check (
    source in ('manual', 'current_income', 'previous_month', 'historical', 'imported')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create index monthly_budget_plans_user_month_idx
  on public.monthly_budget_plans (user_id, month desc);

create trigger monthly_budget_plans_set_updated_at
before update on public.monthly_budget_plans
for each row execute function public.set_updated_at();

alter table public.monthly_budget_plans enable row level security;

create policy monthly_budget_plans_select_self
on public.monthly_budget_plans for select to authenticated
using (user_id = (select auth.uid()));

create policy monthly_budget_plans_insert_self
on public.monthly_budget_plans for insert to authenticated
with check (user_id = (select auth.uid()));

create policy monthly_budget_plans_update_self
on public.monthly_budget_plans for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy monthly_budget_plans_delete_self
on public.monthly_budget_plans for delete to authenticated
using (user_id = (select auth.uid()));

create policy monthly_budget_plans_private_access
on public.monthly_budget_plans as restrictive for all to authenticated
using ((select public.is_current_user_allowed()))
with check ((select public.is_current_user_allowed()));

-- Preserve any legacy monthly budgets by giving them a planning base. Posted
-- income is only a migration fallback; the user can edit it afterwards.
insert into public.monthly_budget_plans (user_id, month, income_target, source)
select budget.user_id,
       budget.month,
       coalesce((
         select sum(transaction.amount)
         from public.transactions transaction
         where transaction.user_id = budget.user_id
           and transaction.kind = 'income'
           and transaction.occurred_on >= budget.month
           and transaction.occurred_on < budget.month + interval '1 month'
       ), 0),
       'current_income'
from public.budgets budget
group by budget.user_id, budget.month
on conflict (user_id, month) do nothing;

create or replace function public.set_finance_category_order(
  p_group_key text,
  p_positions jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_count integer;
  input_count integer;
  unique_count integer;
  invalid_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_positions is null or jsonb_typeof(p_positions) is distinct from 'array' then
    raise exception 'positions must be an array';
  end if;

  perform category.id
  from public.categories category
  where category.user_id = caller_id
    and category.transaction_kind = 'expense'
    and category.category_group = p_group_key
    and category.archived = false
  order by category.id
  for update;

  select count(*) into active_count
  from public.categories
  where user_id = caller_id
    and transaction_kind = 'expense'
    and category_group = p_group_key
    and archived = false;

  select count(*),
         count(distinct input.id),
         count(*) filter (
           where input.id is null
              or input.sort_order is null
              or input.sort_order < 0
              or input.sort_order > 1000
         )
  into input_count, unique_count, invalid_count
  from jsonb_to_recordset(p_positions)
    as input(id uuid, sort_order integer);

  if active_count <> input_count
     or input_count <> unique_count
     or invalid_count <> 0 then
    raise exception 'every active subcategory must appear exactly once';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_positions) as input(id uuid, sort_order integer)
    where not exists (
      select 1
      from public.categories category
      where category.id = input.id
        and category.user_id = caller_id
        and category.transaction_kind = 'expense'
        and category.category_group = p_group_key
        and category.archived = false
    )
  ) then
    raise exception 'one or more subcategories are unavailable';
  end if;

  update public.categories category
  set sort_order = input.sort_order
  from jsonb_to_recordset(p_positions) as input(id uuid, sort_order integer)
  where category.id = input.id
    and category.user_id = caller_id;
end;
$$;

create or replace function public.set_monthly_budget_plan(
  p_month date,
  p_income_target numeric,
  p_source text,
  p_budgets jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  input_count integer;
  unique_category_count integer;
  unique_id_count integer;
  invalid_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'month must be its first day';
  end if;
  if p_income_target is null
     or p_income_target < 0
     or p_income_target > 9999999999999999.99
     or p_income_target <> round(p_income_target, 2) then
    raise exception 'income target is invalid';
  end if;
  if p_source not in ('manual', 'current_income', 'previous_month', 'historical', 'imported') then
    raise exception 'budget source is invalid';
  end if;
  if p_budgets is null or jsonb_typeof(p_budgets) is distinct from 'array' then
    raise exception 'budgets must be an array';
  end if;

  perform category.id
  from public.categories category
  where category.user_id = caller_id
    and category.transaction_kind = 'expense'
    and category.archived = false
  order by category.id
  for key share;

  select count(*),
         count(distinct input.category_id),
         count(distinct input.id),
         count(*) filter (
           where input.id is null
              or input.category_id is null
              or input.amount is null
              or input.amount < 0
              or input.amount > 9999999999999999.99
              or input.amount <> round(input.amount, 2)
         )
  into input_count, unique_category_count, unique_id_count, invalid_count
  from jsonb_to_recordset(p_budgets)
    as input(id uuid, category_id uuid, amount numeric);

  if input_count <> unique_category_count
     or input_count <> unique_id_count
     or invalid_count <> 0 then
    raise exception 'monthly budgets are invalid or duplicated';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_budgets) as input(id uuid, category_id uuid, amount numeric)
    where not exists (
      select 1
      from public.categories category
      where category.id = input.category_id
        and category.user_id = caller_id
        and category.transaction_kind = 'expense'
        and category.archived = false
    )
  ) then
    raise exception 'one or more budget subcategories are unavailable';
  end if;

  insert into public.monthly_budget_plans (user_id, month, income_target, source)
  values (caller_id, p_month, p_income_target, p_source)
  on conflict (user_id, month) do update
    set income_target = excluded.income_target,
        source = excluded.source;

  delete from public.budgets
  where user_id = caller_id
    and month = p_month;

  insert into public.budgets (id, user_id, category_id, month, amount)
  select input.id, caller_id, input.category_id, p_month, input.amount
  from jsonb_to_recordset(p_budgets) as input(id uuid, category_id uuid, amount numeric)
  where input.amount > 0;
end;
$$;

create or replace function public.get_monthly_budget_plan(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'month must be its first day';
  end if;

  return jsonb_build_object(
    'plan', (
      select jsonb_build_object(
        'month', plan.month,
        'incomeTarget', plan.income_target,
        'source', plan.source
      )
      from public.monthly_budget_plans plan
      where plan.user_id = caller_id and plan.month = p_month
    ),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', budget.id,
        'categoryId', budget.category_id,
        'month', budget.month,
        'amount', budget.amount
      ) order by category.sort_order, category.name)
      from public.budgets budget
      join public.categories category
        on category.id = budget.category_id
       and category.user_id = budget.user_id
      where budget.user_id = caller_id and budget.month = p_month
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_plan_simulation_seed(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'month must be its first day';
  end if;

  return jsonb_build_object(
    'month', p_month,
    'incomeTarget', coalesce((
      select plan.income_target
      from public.monthly_budget_plans plan
      where plan.user_id = caller_id and plan.month = p_month
    ), (
      select coalesce(sum(transaction.amount), 0)
      from public.transactions transaction
      where transaction.user_id = caller_id
        and transaction.kind = 'income'
        and transaction.occurred_on >= p_month
        and transaction.occurred_on < p_month + interval '1 month'
    ), 0),
    'actualIncome', (
      select coalesce(sum(transaction.amount), 0)
      from public.transactions transaction
      where transaction.user_id = caller_id
        and transaction.kind = 'income'
        and transaction.occurred_on >= p_month
        and transaction.occurred_on < p_month + interval '1 month'
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'group', category.category_group,
        'color', category.color,
        'icon', category.icon,
        'sortOrder', category.sort_order,
        'archived', category.archived,
        'budget', coalesce(budget.amount, 0),
        'spent', coalesce(spending.amount, 0)
      ) order by allocation.sort_order, category.sort_order, category.name)
      from public.categories category
      join public.group_allocations allocation
        on allocation.user_id = category.user_id
       and allocation.group_key = category.category_group
      left join public.budgets budget
        on budget.user_id = category.user_id
       and budget.category_id = category.id
       and budget.month = p_month
      left join lateral (
        select sum(transaction.amount) as amount
        from public.transactions transaction
        where transaction.user_id = category.user_id
          and transaction.category_id = category.id
          and transaction.kind = 'expense'
          and transaction.occurred_on >= p_month
          and transaction.occurred_on < p_month + interval '1 month'
      ) spending on true
      where category.user_id = caller_id
        and category.transaction_kind = 'expense'
        and (not category.archived or coalesce(spending.amount, 0) > 0 or coalesce(budget.amount, 0) > 0)
    ), '[]'::jsonb),
    'mainCategories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id,
        'group', allocation.group_key,
        'name', allocation.name,
        'color', allocation.color,
        'icon', allocation.icon,
        'targetPercent', allocation.target_percent,
        'includedInPlan', allocation.included_in_plan,
        'sortOrder', allocation.sort_order,
        'archived', allocation.archived
      ) order by allocation.archived, allocation.sort_order, allocation.name)
      from public.group_allocations allocation
      where allocation.user_id = caller_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on public.monthly_budget_plans from public, anon, authenticated;
grant select, insert, update, delete on public.monthly_budget_plans to authenticated;
grant update (sort_order) on public.categories to authenticated;

revoke all on function public.set_finance_category_order(text, jsonb) from public, anon, authenticated;
revoke all on function public.set_monthly_budget_plan(date, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_monthly_budget_plan(date) from public, anon, authenticated;
revoke all on function public.get_plan_simulation_seed(date) from public, anon, authenticated;

grant execute on function public.set_finance_category_order(text, jsonb) to authenticated;
grant execute on function public.set_monthly_budget_plan(date, numeric, text, jsonb) to authenticated;
grant execute on function public.get_monthly_budget_plan(date) to authenticated;
grant execute on function public.get_plan_simulation_seed(date) to authenticated;
