-- Reportes v2: una única consulta agregada, limitada por usuario y por rango.
-- La aplicación nunca necesita descargar el historial completo para dibujar la vista.

create or replace function public.get_detailed_finance_report(
  p_start_date date,
  p_end_date date,
  p_months date[] default null,
  p_granularity text default 'month',
  p_kind text default 'all',
  p_group_keys text[] default null,
  p_category_ids uuid[] default null,
  p_income_type_ids uuid[] default null,
  p_account_ids uuid[] default null,
  p_query text default '',
  p_comparison_start date default null,
  p_comparison_end date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid report range';
  end if;
  if p_end_date > p_start_date + interval '5 years' then
    raise exception 'report range exceeds five years';
  end if;
  if p_granularity not in ('day', 'week', 'month') then
    raise exception 'invalid granularity';
  end if;
  if p_kind not in ('all', 'expense', 'income', 'transfer') then
    raise exception 'invalid transaction kind';
  end if;
  if coalesce(cardinality(p_months), 0) > 60
     or coalesce(cardinality(p_group_keys), 0) > 100
     or coalesce(cardinality(p_category_ids), 0) > 100
     or coalesce(cardinality(p_income_type_ids), 0) > 100
     or coalesce(cardinality(p_account_ids), 0) > 100 then
    raise exception 'too many report filters';
  end if;

  with recursive
  params as (
    select lower(trim(coalesce(p_query, ''))) as clean_query,
      case p_granularity when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end as bucket_step,
      date_trunc(p_granularity, p_start_date::timestamp)::date as first_bucket,
      date_trunc(p_granularity, p_end_date::timestamp)::date as last_bucket
  ),
  base as materialized (
    select movement.*, category.name as category_name,
      category.category_group, category.transaction_kind as category_kind,
      category.color as category_color, category.icon as category_icon
    from public.transactions movement
    left join public.categories category
      on category.user_id = caller_id and category.id = movement.category_id
    cross join params
    where movement.user_id = caller_id
      and movement.occurred_on between p_start_date and p_end_date
      and (coalesce(cardinality(p_months), 0) = 0 or date_trunc('month', movement.occurred_on)::date = any(p_months))
      and (coalesce(cardinality(p_account_ids), 0) = 0 or movement.account_id = any(p_account_ids))
      and (p_kind = 'all' or movement.kind = p_kind or (p_kind = 'transfer' and movement.kind in ('transfer_out', 'transfer_in')))
      and (
        coalesce(cardinality(p_group_keys), 0) + coalesce(cardinality(p_category_ids), 0) + coalesce(cardinality(p_income_type_ids), 0) = 0
        or (category.transaction_kind = 'expense' and (
          (coalesce(cardinality(p_group_keys), 0) > 0 and category.category_group = any(p_group_keys))
          or (coalesce(cardinality(p_category_ids), 0) > 0 and category.id = any(p_category_ids))
        ))
        or (category.transaction_kind = 'income' and coalesce(cardinality(p_income_type_ids), 0) > 0 and category.id = any(p_income_type_ids))
      )
      and (
        params.clean_query = ''
        or position(params.clean_query in lower(movement.description)) > 0
        or position(params.clean_query in lower(coalesce(movement.merchant, ''))) > 0
        or position(params.clean_query in lower(coalesce(movement.note, ''))) > 0
        or position(params.clean_query in lower(coalesce(category.name, ''))) > 0
      )
  ),
  comparison_base as materialized (
    select movement.*, category.category_group, category.transaction_kind as category_kind
    from public.transactions movement
    left join public.categories category
      on category.user_id = caller_id and category.id = movement.category_id
    cross join params
    where p_comparison_start is not null and p_comparison_end is not null
      and movement.user_id = caller_id
      and movement.occurred_on between p_comparison_start and p_comparison_end
      and (coalesce(cardinality(p_account_ids), 0) = 0 or movement.account_id = any(p_account_ids))
      and (p_kind = 'all' or movement.kind = p_kind or (p_kind = 'transfer' and movement.kind in ('transfer_out', 'transfer_in')))
      and (
        coalesce(cardinality(p_group_keys), 0) + coalesce(cardinality(p_category_ids), 0) + coalesce(cardinality(p_income_type_ids), 0) = 0
        or (category.transaction_kind = 'expense' and (
          (coalesce(cardinality(p_group_keys), 0) > 0 and category.category_group = any(p_group_keys))
          or (coalesce(cardinality(p_category_ids), 0) > 0 and category.id = any(p_category_ids))
        ))
        or (category.transaction_kind = 'income' and coalesce(cardinality(p_income_type_ids), 0) > 0 and category.id = any(p_income_type_ids))
      )
      and (
        params.clean_query = ''
        or position(params.clean_query in lower(movement.description)) > 0
        or position(params.clean_query in lower(coalesce(movement.merchant, ''))) > 0
        or position(params.clean_query in lower(coalesce(movement.note, ''))) > 0
        or position(params.clean_query in lower(coalesce(category.name, ''))) > 0
      )
  ),
  selected_budget as materialized (
    select budget.category_id, sum(budget.amount) as amount
    from public.budgets budget
    join public.categories category on category.user_id = caller_id and category.id = budget.category_id
    where budget.user_id = caller_id
      and (p_kind in ('all', 'expense'))
      and budget.month between date_trunc('month', p_start_date)::date and date_trunc('month', p_end_date)::date
      and (coalesce(cardinality(p_months), 0) = 0 or budget.month = any(p_months))
      and (coalesce(cardinality(p_group_keys), 0) = 0 or category.category_group = any(p_group_keys))
      and (coalesce(cardinality(p_category_ids), 0) = 0 or category.id = any(p_category_ids))
    group by budget.category_id
  ),
  summary as (
    select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
      count(*) filter (where kind <> 'transfer_in') as transaction_count
    from base
  ),
  budget_summary as (select coalesce(sum(amount), 0) as budget from selected_budget),
  comparison_summary as (
    select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
      count(*) filter (where kind <> 'transfer_in') as transaction_count
    from comparison_base
  ),
  buckets as (
    select generate_series(params.first_bucket, params.last_bucket, params.bucket_step)::date as period
    from params
  ),
  series as (
    select bucket.period,
      coalesce(sum(base.amount) filter (where base.kind = 'income'), 0) as income,
      coalesce(sum(base.amount) filter (where base.kind = 'expense'), 0) as expense
    from buckets bucket
    left join base on date_trunc(p_granularity, base.occurred_on)::date = bucket.period
    group by bucket.period
  ),
  category_stats as (
    select category.id, category.name, category.category_group, category.color, category.icon,
      coalesce(sum(base.amount) filter (where base.kind = 'expense'), 0) as expense,
      coalesce(max(selected_budget.amount), 0) as budget,
      count(base.id) filter (where base.kind = 'expense') as transaction_count
    from public.categories category
    left join base on base.category_id = category.id
    left join selected_budget on selected_budget.category_id = category.id
    where category.user_id = caller_id and category.transaction_kind = 'expense'
      and (not category.archived or base.id is not null)
      and (coalesce(cardinality(p_group_keys), 0) = 0 or category.category_group = any(p_group_keys))
      and (coalesce(cardinality(p_category_ids), 0) = 0 or category.id = any(p_category_ids))
    group by category.id, category.name, category.category_group, category.color, category.icon
  ),
  group_stats as (
    select finance_group.group_key, finance_group.name, finance_group.color,
      finance_group.target_percent, finance_group.included_in_plan, finance_group.archived, finance_group.sort_order,
      coalesce(sum(category_stats.expense), 0) as expense,
      coalesce(sum(category_stats.budget), 0) as budget,
      coalesce(sum(category_stats.transaction_count), 0) as transaction_count
    from public.group_allocations finance_group
    left join category_stats on category_stats.category_group = finance_group.group_key
    where finance_group.user_id = caller_id
      and (coalesce(cardinality(p_group_keys), 0) = 0 or finance_group.group_key = any(p_group_keys))
    group by finance_group.group_key, finance_group.name, finance_group.color,
      finance_group.target_percent, finance_group.included_in_plan, finance_group.archived, finance_group.sort_order
    having not finance_group.archived or coalesce(sum(category_stats.expense), 0) > 0
  ),
  income_stats as (
    select category.id, category.name, category.color, category.icon,
      coalesce(sum(base.amount) filter (where base.kind = 'income'), 0) as income,
      count(base.id) filter (where base.kind = 'income') as transaction_count
    from public.categories category
    left join base on base.category_id = category.id
    where category.user_id = caller_id and category.transaction_kind = 'income'
      and (not category.archived or base.id is not null)
      and (coalesce(cardinality(p_income_type_ids), 0) = 0 or category.id = any(p_income_type_ids))
    group by category.id, category.name, category.color, category.icon
  ),
  account_stats as (
    select account.id, account.name, account.account_type, account.color, account.icon, account.initial_balance,
      coalesce(sum(base.amount) filter (where base.kind = 'income'), 0) as income,
      coalesce(sum(base.amount) filter (where base.kind = 'expense'), 0) as expense,
      coalesce(sum(base.amount) filter (where base.kind = 'transfer_in'), 0) as transfer_in,
      coalesce(sum(base.amount) filter (where base.kind = 'transfer_out'), 0) as transfer_out,
      account.initial_balance + coalesce((
        select sum(case when movement.kind in ('income', 'transfer_in') then movement.amount else -movement.amount end)
        from public.transactions movement
        where movement.user_id = caller_id and movement.account_id = account.id and movement.occurred_on < p_start_date
      ), 0) as opening_balance,
      account.initial_balance + coalesce((
        select sum(case when movement.kind in ('income', 'transfer_in') then movement.amount else -movement.amount end)
        from public.transactions movement
        where movement.user_id = caller_id and movement.account_id = account.id and movement.occurred_on <= p_end_date
      ), 0) as closing_balance
    from public.accounts account
    left join base on base.account_id = account.id
    where account.user_id = caller_id and (not account.archived or base.id is not null)
      and (coalesce(cardinality(p_account_ids), 0) = 0 or account.id = any(p_account_ids))
    group by account.id, account.name, account.account_type, account.color, account.icon, account.initial_balance
  ),
  merchant_stats as (
    select coalesce(nullif(trim(merchant), ''), description) as name,
      sum(amount) as expense, count(*) as transaction_count
    from base where kind = 'expense'
    group by coalesce(nullif(trim(merchant), ''), description)
    order by expense desc, name
    limit 12
  ),
  weekday_stats as (
    select extract(isodow from occurred_on)::integer as weekday,
      sum(amount) as expense, count(*) as transaction_count
    from base where kind = 'expense'
    group by extract(isodow from occurred_on)
    order by weekday
  ),
  recent_transactions as (
    select * from base where kind <> 'transfer_in'
    order by occurred_on desc, created_at desc, id desc
    limit 100
  )
  select jsonb_build_object(
    'startDate', p_start_date,
    'endDate', p_end_date,
    'selectedMonths', coalesce(to_jsonb(p_months), '[]'::jsonb),
    'granularity', p_granularity,
    'summary', (select jsonb_build_object(
      'income', summary.income, 'expense', summary.expense, 'balance', summary.income - summary.expense,
      'savingsRate', case when summary.income > 0 then ((summary.income - summary.expense) / summary.income) * 100 else 0 end,
      'averageDailyExpense', summary.expense / greatest(1, p_end_date - p_start_date + 1),
      'transactionCount', summary.transaction_count, 'budget', budget_summary.budget,
      'budgetUsage', case when budget_summary.budget > 0 then summary.expense / budget_summary.budget * 100 else 0 end,
      'budgetVariance', budget_summary.budget - summary.expense
    ) from summary cross join budget_summary),
    'comparison', case when p_comparison_start is null then null else (select jsonb_build_object(
      'income', income, 'expense', expense, 'balance', income - expense,
      'savingsRate', case when income > 0 then ((income - expense) / income) * 100 else 0 end,
      'averageDailyExpense', expense / greatest(1, p_comparison_end - p_comparison_start + 1),
      'transactionCount', transaction_count, 'budget', 0, 'budgetUsage', 0, 'budgetVariance', 0
    ) from comparison_summary) end,
    'series', coalesce((select jsonb_agg(jsonb_build_object('period', period, 'income', income, 'expense', expense, 'balance', income - expense) order by period) from series), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
      'group', group_stats.group_key, 'name', group_stats.name, 'color', group_stats.color,
      'expense', group_stats.expense, 'budget', group_stats.budget, 'variance', group_stats.budget - group_stats.expense,
      'usage', case when group_stats.budget > 0 then group_stats.expense / group_stats.budget * 100 else 0 end,
      'transactionCount', group_stats.transaction_count, 'targetPercent', group_stats.target_percent,
      'includedInPlan', group_stats.included_in_plan, 'archived', group_stats.archived,
      'categories', coalesce((select jsonb_agg(jsonb_build_object(
        'id', category_stats.id, 'name', category_stats.name, 'group', category_stats.category_group,
        'color', category_stats.color, 'icon', category_stats.icon, 'expense', category_stats.expense,
        'budget', category_stats.budget, 'variance', category_stats.budget - category_stats.expense,
        'usage', case when category_stats.budget > 0 then category_stats.expense / category_stats.budget * 100 else 0 end,
        'transactionCount', category_stats.transaction_count
      ) order by category_stats.expense desc, category_stats.name) from category_stats where category_stats.category_group = group_stats.group_key), '[]'::jsonb)
    ) order by group_stats.sort_order, group_stats.name) from group_stats), '[]'::jsonb),
    'incomeTypes', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'color', color, 'icon', icon, 'income', income,
      'percent', case when (select income from summary) > 0 then income / (select income from summary) * 100 else 0 end,
      'transactionCount', transaction_count
    ) order by income desc, name) from income_stats), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'type', account_type, 'color', color, 'icon', icon,
      'openingBalance', opening_balance, 'closingBalance', closing_balance,
      'income', income, 'expense', expense, 'transferIn', transfer_in, 'transferOut', transfer_out,
      'netFlow', income + transfer_in - expense - transfer_out
    ) order by closing_balance desc, name) from account_stats), '[]'::jsonb),
    'merchants', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'expense', expense, 'transactionCount', transaction_count) order by expense desc, name) from merchant_stats), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'expense', expense, 'transactionCount', transaction_count) order by weekday) from weekday_stats), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'amount', amount, 'account_id', account_id, 'category_id', category_id,
      'transfer_group_id', transfer_group_id, 'description', description, 'merchant', merchant,
      'note', note, 'icon', icon, 'occurred_on', occurred_on, 'created_at', created_at
    ) order by occurred_on desc, created_at desc, id desc) from recent_transactions), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create index if not exists transactions_user_category_date_idx
  on public.transactions (user_id, category_id, occurred_on desc)
  where kind in ('expense', 'income');

create index if not exists transactions_user_account_date_idx
  on public.transactions (user_id, account_id, occurred_on desc);

create index if not exists budgets_user_month_category_idx
  on public.budgets (user_id, month, category_id);

revoke all on function public.get_detailed_finance_report(date, date, date[], text, text, text[], uuid[], uuid[], uuid[], text, date, date)
  from public, anon, authenticated;
grant execute on function public.get_detailed_finance_report(date, date, date[], text, text, text[], uuid[], uuid[], uuid[], text, date, date)
  to authenticated;
