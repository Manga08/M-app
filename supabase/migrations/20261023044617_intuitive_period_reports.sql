-- Report clarity contract: intersect classifications, compare only covered monthly spending,
-- preserve ledger balances and expose historical target activity without live snapshots.
-- Multi-currency reports keep native amounts exact, historical reporting
-- amounts immutable, and account entities as a presentation-only grouping.
create or replace function public.get_detailed_finance_report_v4(
  p_start_date date, p_end_date date, p_months date[] default null,
  p_granularity text default 'month', p_kind text default 'all',
  p_group_keys text[] default null, p_category_ids uuid[] default null,
  p_income_type_ids uuid[] default null, p_account_ids uuid[] default null,
  p_query text default '', p_comparison_start date default null,
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
  reporting_currency text;
  result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date or p_end_date > p_start_date + interval '5 years' then
    raise exception 'invalid report range';
  end if;
  if p_granularity not in ('day','week','month') or p_kind not in ('all','expense','income','transfer') then
    raise exception 'invalid report options';
  end if;
  if coalesce(cardinality(p_months),0) > 60 or coalesce(cardinality(p_group_keys),0) > 100
    or coalesce(cardinality(p_category_ids),0) > 100 or coalesce(cardinality(p_income_type_ids),0) > 100
    or coalesce(cardinality(p_account_ids),0) > 100 then
    raise exception 'too many report filters';
  end if;

  select coalesce(profile.currency_code, 'COP')
    into reporting_currency
  from public.profiles profile
  where profile.id = caller_id;
  reporting_currency := coalesce(reporting_currency, 'COP');

  -- Non-contiguous month picks have no misleading continuous comparison.
  if coalesce(cardinality(p_months),0)>0 then
    p_comparison_start := null; p_comparison_end := null;
  end if;

  with recursive params as (
    select lower(trim(coalesce(p_query,''))) clean_query,
      case p_granularity when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end bucket_step,
      date_trunc(p_granularity,p_start_date::timestamp)::date first_bucket,
      date_trunc(p_granularity,p_end_date::timestamp)::date last_bucket
  ), base as materialized (
    select movement.*, movement.base_amount as report_amount, category.name category_name,
      category.category_group, category.transaction_kind category_kind,
      category.color category_color, category.icon category_icon
    from public.transactions movement
    left join public.categories category on category.user_id=caller_id and category.id=movement.category_id
    cross join params
    where movement.user_id=caller_id and movement.occurred_on between p_start_date and p_end_date
      and (coalesce(cardinality(p_months),0)=0 or date_trunc('month',movement.occurred_on)::date=any(p_months))
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
      and (p_kind='all' or movement.kind=p_kind or (p_kind='transfer' and movement.kind in ('transfer_out','transfer_in')))
      and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)+coalesce(cardinality(p_income_type_ids),0)=0
        or (category.transaction_kind='expense' and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)>0) and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys)) and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids)))
        or (category.transaction_kind='income' and coalesce(cardinality(p_income_type_ids),0)>0 and category.id=any(p_income_type_ids)))
      and (params.clean_query='' or position(params.clean_query in lower(movement.description))>0
        or position(params.clean_query in lower(coalesce(movement.merchant,'')))>0
        or position(params.clean_query in lower(coalesce(movement.note,'')))>0
        or position(params.clean_query in lower(coalesce(category.name,'')))>0)
  ), comparison_base as materialized (
    select movement.*, movement.base_amount report_amount
    from public.transactions movement
    left join public.categories category on category.user_id=caller_id and category.id=movement.category_id
    cross join params
    where p_comparison_start is not null and p_comparison_end is not null
      and movement.user_id=caller_id and movement.occurred_on between p_comparison_start and p_comparison_end
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
      and (p_kind='all' or movement.kind=p_kind or (p_kind='transfer' and movement.kind in ('transfer_out','transfer_in')))
      and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)+coalesce(cardinality(p_income_type_ids),0)=0
        or (category.transaction_kind='expense' and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)>0) and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys)) and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids)))
        or (category.transaction_kind='income' and coalesce(cardinality(p_income_type_ids),0)>0 and category.id=any(p_income_type_ids)))
      and (params.clean_query='' or position(params.clean_query in lower(movement.description))>0
        or position(params.clean_query in lower(coalesce(movement.merchant,'')))>0
        or position(params.clean_query in lower(coalesce(movement.note,'')))>0
        or position(params.clean_query in lower(coalesce(category.name,'')))>0)
  ), selected_budget as materialized (
    select budget.category_id,sum(budget.amount) amount
    from public.budgets budget
    join public.categories category on category.user_id=caller_id and category.id=budget.category_id
    where budget.user_id=caller_id and p_kind in ('all','expense') and budget.amount>0
      and budget.month between date_trunc('month',p_start_date)::date and date_trunc('month',p_end_date)::date
      and (coalesce(cardinality(p_months),0)=0 or budget.month=any(p_months))
      and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys))
      and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids))
    group by budget.category_id
  ), summary as (
    select coalesce(sum(report_amount) filter(where kind='income'),0) income,
      coalesce(sum(report_amount) filter(where kind='expense'),0) expense,
      count(*) filter(where kind not in ('transfer_in','adjustment_in','adjustment_out')) transaction_count,
      coalesce(sum(report_amount) filter(where kind='expense' and exists(select 1 from public.budgets limit_row where limit_row.user_id=caller_id and limit_row.category_id=base.category_id and limit_row.month=date_trunc('month',base.occurred_on)::date and limit_row.amount>0)),0) budget_expense
    from base
  ), comparison_summary as (
    select coalesce(sum(report_amount) filter(where kind='income'),0) income,
      coalesce(sum(report_amount) filter(where kind='expense'),0) expense,
      count(*) filter(where kind not in ('transfer_in','adjustment_in','adjustment_out')) transaction_count
    from comparison_base
  ), budget_summary as (
    select coalesce(sum(amount),0) budget from selected_budget
  ), buckets as (
    select period::date from params cross join lateral generate_series(params.first_bucket,params.last_bucket,params.bucket_step) period
    where coalesce(cardinality(p_months),0)=0 or date_trunc('month',period)::date=any(p_months)
  ), series as (
    select bucket.period,coalesce(sum(base.report_amount) filter(where base.kind='income'),0) income,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) expense
    from buckets bucket left join base on date_trunc(p_granularity,base.occurred_on)::date=bucket.period
    group by bucket.period
  ), category_stats as (
    select category.id,category.name,category.category_group,category.color,category.icon,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) expense,
      coalesce(sum(base.report_amount) filter(where base.kind='expense' and exists(select 1 from public.budgets limit_row where limit_row.user_id=caller_id and limit_row.category_id=base.category_id and limit_row.month=date_trunc('month',base.occurred_on)::date and limit_row.amount>0)),0) budget_expense,
      coalesce(max(selected_budget.amount),0) budget,count(base.id) filter(where base.kind='expense') transaction_count
    from public.categories category
    left join base on base.category_id=category.id
    left join selected_budget on selected_budget.category_id=category.id
    where category.user_id=caller_id and category.transaction_kind='expense'
      and (not category.archived or base.id is not null or selected_budget.amount>0)
      and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys))
      and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids))
    group by category.id,category.name,category.category_group,category.color,category.icon
  ), group_stats as (
    select finance_group.group_key,finance_group.name,finance_group.color,finance_group.target_percent,
      finance_group.included_in_plan,finance_group.archived,finance_group.sort_order,
      coalesce(sum(category_stats.expense),0) expense,coalesce(sum(category_stats.budget),0) budget,
      coalesce(sum(category_stats.budget_expense),0) budget_expense,
      coalesce(sum(category_stats.transaction_count),0) transaction_count
    from public.group_allocations finance_group
    left join category_stats on category_stats.category_group=finance_group.group_key
    where finance_group.user_id=caller_id and (coalesce(cardinality(p_group_keys),0)=0 or finance_group.group_key=any(p_group_keys))
    group by finance_group.group_key,finance_group.name,finance_group.color,finance_group.target_percent,
      finance_group.included_in_plan,finance_group.archived,finance_group.sort_order
    having not finance_group.archived or coalesce(sum(category_stats.expense),0)>0 or coalesce(sum(category_stats.budget),0)>0
  ), income_stats as (
    select category.id,category.name,category.color,category.icon,
      coalesce(sum(base.report_amount) filter(where base.kind='income'),0) income,
      count(base.id) filter(where base.kind='income') transaction_count
    from public.categories category left join base on base.category_id=category.id
    where category.user_id=caller_id and category.transaction_kind='income'
      and (not category.archived or base.id is not null)
      and (coalesce(cardinality(p_income_type_ids),0)=0 or category.id=any(p_income_type_ids))
    group by category.id,category.name,category.color,category.icon
  ), account_history as materialized (
    select movement.account_id,
      coalesce(sum(case when movement.occurred_on < p_start_date then case when movement.kind in ('income','transfer_in','adjustment_in') then movement.amount else -movement.amount end else 0 end),0) native_before,
      coalesce(sum(case when movement.occurred_on <= p_end_date then case when movement.kind in ('income','transfer_in','adjustment_in') then movement.amount else -movement.amount end else 0 end),0) native_until,
      coalesce(sum(case when movement.occurred_on < p_start_date then case when movement.kind in ('income','transfer_in','adjustment_in') then movement.base_amount else -movement.base_amount end else 0 end),0) reporting_before,
      coalesce(sum(case when movement.occurred_on <= p_end_date then case when movement.kind in ('income','transfer_in','adjustment_in') then movement.base_amount else -movement.base_amount end else 0 end),0) reporting_until
    from public.transactions movement
    where movement.user_id=caller_id and movement.occurred_on<=p_end_date
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
    group by movement.account_id
  ), account_stats as (
    select account.id,account.name,account.account_type,account.color,account.icon,account.currency_code,
      account.entity_id,entity.name entity_name,entity.color entity_color,entity.icon entity_icon,account.archived,
      coalesce(sum(base.amount) filter(where base.kind='income'),0) native_income,
      coalesce(sum(base.amount) filter(where base.kind='expense'),0) native_expense,
      coalesce(sum(base.amount) filter(where base.kind='transfer_in'),0) native_transfer_in,
      coalesce(sum(base.amount) filter(where base.kind='transfer_out'),0) native_transfer_out,
      coalesce(sum(base.report_amount) filter(where base.kind='income'),0) reporting_income,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) reporting_expense,
      coalesce(sum(base.report_amount) filter(where base.kind='transfer_in'),0) reporting_transfer_in,
      coalesce(sum(base.report_amount) filter(where base.kind='transfer_out'),0) reporting_transfer_out,
      case when coalesce(account.opening_balance_date,account.created_at::date)<=p_start_date then account.initial_balance+coalesce(history.native_before,0) else 0 end native_opening_balance,
      case when coalesce(account.opening_balance_date,account.created_at::date)<=p_end_date then account.initial_balance+coalesce(history.native_until,0) else 0 end native_closing_balance,
      case when coalesce(account.opening_balance_date,account.created_at::date)<=p_start_date then account.initial_balance*coalesce(account.opening_exchange_rate,1)+coalesce(history.reporting_before,0) else 0 end reporting_opening_balance,
      case when coalesce(account.opening_balance_date,account.created_at::date)<=p_end_date then account.initial_balance*coalesce(account.opening_exchange_rate,1)+coalesce(history.reporting_until,0) else 0 end reporting_closing_balance
    from public.accounts account
    left join public.account_entities entity on entity.user_id=caller_id and entity.id=account.entity_id
    left join account_history history on history.account_id=account.id
    left join base on base.account_id=account.id
    where account.user_id=caller_id and (not account.archived or base.id is not null or coalesce(history.native_before,0)+account.initial_balance<>0 or coalesce(history.native_until,0)+account.initial_balance<>0)
      and (coalesce(cardinality(p_account_ids),0)=0 or account.id=any(p_account_ids))
    group by account.id,account.name,account.account_type,account.color,account.icon,account.currency_code,
      account.entity_id,entity.name,entity.color,entity.icon,account.archived,account.opening_balance_date,
      account.created_at,account.initial_balance,account.opening_exchange_rate,history.native_before,
      history.native_until,history.reporting_before,history.reporting_until
  ), entity_currency_stats as (
    select coalesce(entity_id::text,'ungrouped') entity_key,currency_code,
      sum(native_opening_balance) opening_balance,sum(native_closing_balance) closing_balance,
      sum(native_closing_balance-native_opening_balance) net_flow
    from account_stats group by coalesce(entity_id::text,'ungrouped'),currency_code
  ), entity_stats as (
    select coalesce(entity_id::text,'ungrouped') entity_key,entity_id,
      coalesce(max(entity_name),'Sin entidad') entity_name,coalesce(max(entity_color),'#64748b') entity_color,
      coalesce(max(entity_icon),'wallet-cards') entity_icon,count(*) account_count,
      sum(reporting_opening_balance) reporting_opening_balance,
      sum(reporting_closing_balance) reporting_closing_balance,
      sum(reporting_closing_balance-reporting_opening_balance) reporting_net_flow
    from account_stats group by coalesce(entity_id::text,'ungrouped'),entity_id
  ), merchant_stats as (
    select coalesce(nullif(trim(merchant),''),description) name,sum(report_amount) expense,count(*) transaction_count
    from base where kind='expense'
    group by coalesce(nullif(trim(merchant),''),description)
    order by expense desc,name limit 12
  ), weekday_stats as (
    select extract(isodow from occurred_on)::integer weekday,sum(report_amount) expense,count(*) transaction_count
    from base where kind='expense' group by extract(isodow from occurred_on) order by weekday
  ), target_events as (
    select financial_target_id target_id,case when financial_target_effect='reverse' then 0 else report_amount end advanced,
      case when financial_target_effect='reverse' then report_amount else 0 end reversed,0::numeric manual_net,1 transaction_count
    from base where financial_target_id is not null and kind<>'transfer_in'
    union all
    select entry.target_id,0,0,case when entry.effect='advance' then entry.amount else -entry.amount end,0
    from public.financial_target_entries entry
    where entry.user_id=caller_id and entry.occurred_on between p_start_date and p_end_date
      and (coalesce(cardinality(p_months),0)=0 or date_trunc('month',entry.occurred_on)::date=any(p_months))
      and p_kind='all' and coalesce(cardinality(p_account_ids),0)=0
      and coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)+coalesce(cardinality(p_income_type_ids),0)=0
      and (select clean_query from params)=''
  ), target_activity as (
    select target.id,target.title,target.color,target.icon,sum(event.advanced) advanced,sum(event.reversed) reversed,
      sum(event.manual_net) manual_net,sum(event.transaction_count) transaction_count
    from target_events event join public.financial_targets target on target.user_id=caller_id and target.id=event.target_id
    group by target.id,target.title,target.color,target.icon
  ), recent_transactions as (
    select * from base where kind not in ('transfer_in','adjustment_in','adjustment_out')
    order by occurred_on desc,created_at desc,id desc limit 100
  )
  select jsonb_build_object(
    'revision',public.get_financial_revision()->>'revision',
    'startDate',p_start_date,'endDate',p_end_date,'selectedMonths',coalesce(to_jsonb(p_months),'[]'::jsonb),
    'granularity',p_granularity,'reportingCurrencyCode',reporting_currency,
    'summary',(select jsonb_build_object('income',s.income,'expense',s.expense,'balance',s.income-s.expense,'savingsRate',case when s.income>0 then (s.income-s.expense)/s.income*100 else 0 end,'averageDailyExpense',s.expense/greatest(1,(select count(*) from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') selected_day where coalesce(cardinality(p_months),0)=0 or date_trunc('month',selected_day)::date=any(p_months))),'transactionCount',s.transaction_count,'budget',b.budget,'budgetExpense',s.budget_expense,'unbudgetedExpense',s.expense-s.budget_expense,'budgetUsage',case when b.budget>0 then s.budget_expense/b.budget*100 else 0 end,'budgetVariance',case when b.budget>0 then b.budget-s.budget_expense else 0 end) from summary s cross join budget_summary b),
    'comparison',case when p_comparison_start is null then null else (select jsonb_build_object('income',income,'expense',expense,'balance',income-expense,'savingsRate',case when income>0 then (income-expense)/income*100 else 0 end,'averageDailyExpense',expense/greatest(1,p_comparison_end-p_comparison_start+1),'transactionCount',transaction_count,'budget',0,'budgetUsage',0,'budgetVariance',0) from comparison_summary) end,
    'series',coalesce((select jsonb_agg(jsonb_build_object('period',period,'income',income,'expense',expense,'balance',income-expense) order by period) from series),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('group',g.group_key,'name',g.name,'color',g.color,'expense',g.expense,'budget',g.budget,'budgetExpense',g.budget_expense,'variance',case when g.budget>0 then g.budget-g.budget_expense else 0 end,'usage',case when g.budget>0 then g.budget_expense/g.budget*100 else 0 end,'transactionCount',g.transaction_count,'targetPercent',g.target_percent,'includedInPlan',g.included_in_plan,'archived',g.archived,'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'group',c.category_group,'color',c.color,'icon',c.icon,'expense',c.expense,'budget',c.budget,'budgetExpense',c.budget_expense,'variance',case when c.budget>0 then c.budget-c.budget_expense else 0 end,'usage',case when c.budget>0 then c.budget_expense/c.budget*100 else 0 end,'transactionCount',c.transaction_count) order by c.expense desc,c.name) from category_stats c where c.category_group=g.group_key),'[]'::jsonb)) order by g.sort_order,g.name) from group_stats g),'[]'::jsonb),
    'incomeTypes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'icon',icon,'income',income,'percent',case when (select income from summary)>0 then income/(select income from summary)*100 else 0 end,'transactionCount',transaction_count) order by income desc,name) from income_stats),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'type',account_type,'color',color,'icon',icon,'currencyCode',currency_code,
      'entityId',entity_id,'entityName',entity_name,'entityColor',entity_color,'entityIcon',entity_icon,'archived',archived,
      'nativeOpeningBalance',native_opening_balance,'nativeClosingBalance',native_closing_balance,
      'nativeIncome',native_income,'nativeExpense',native_expense,'nativeTransferIn',native_transfer_in,
      'nativeTransferOut',native_transfer_out,'nativeNetFlow',native_closing_balance-native_opening_balance,
      'reportingOpeningBalance',reporting_opening_balance,'reportingClosingBalance',reporting_closing_balance,
      'reportingIncome',reporting_income,'reportingExpense',reporting_expense,'reportingTransferIn',reporting_transfer_in,
      'reportingTransferOut',reporting_transfer_out,'reportingNetFlow',reporting_closing_balance-reporting_opening_balance
    ) order by reporting_closing_balance desc,name) from account_stats),'[]'::jsonb),
    'entities',coalesce((select jsonb_agg(jsonb_build_object(
      'key',entity.entity_key,'id',entity.entity_id,'name',entity.entity_name,'color',entity.entity_color,
      'icon',entity.entity_icon,'accountCount',entity.account_count,
      'reportingOpeningBalance',entity.reporting_opening_balance,'reportingClosingBalance',entity.reporting_closing_balance,
      'reportingNetFlow',entity.reporting_net_flow,'nativeTotals',coalesce((select jsonb_agg(jsonb_build_object(
        'currencyCode',native.currency_code,'openingBalance',native.opening_balance,
        'closingBalance',native.closing_balance,'netFlow',native.net_flow
      ) order by native.currency_code) from entity_currency_stats native where native.entity_key=entity.entity_key),'[]'::jsonb)
    ) order by entity.reporting_closing_balance desc,entity.entity_name) from entity_stats entity),'[]'::jsonb),
    'merchants',coalesce((select jsonb_agg(jsonb_build_object('name',name,'expense',expense,'transactionCount',transaction_count) order by expense desc,name) from merchant_stats),'[]'::jsonb),
    'weekdays',coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'expense',expense,'transactionCount',transaction_count) order by weekday) from weekday_stats),'[]'::jsonb),
    'targetActivity',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title,'color',color,'icon',icon,'advanced',advanced,'reversed',reversed,'manualNet',manual_net,'transactionCount',transaction_count) order by title) from target_activity),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'kind',kind,'amount',report_amount,'native_amount',amount,'base_amount',base_amount,
      'native_currency_code',native_currency_code,'base_currency_code',base_currency_code,
      'exchange_rate',exchange_rate,'exchange_rate_date',exchange_rate_date,'exchange_rate_source',exchange_rate_source,
      'reference_exchange_rate',reference_exchange_rate,'reference_rate_source',reference_rate_source,
      'account_id',account_id,'category_id',category_id,'transfer_group_id',transfer_group_id,
      'recurring_occurrence_id',recurring_occurrence_id,'financial_target_id',financial_target_id,'financial_target_effect',financial_target_effect,'description',description,'merchant',merchant,'note',note,'icon',icon,'occurred_on',occurred_on,'created_at',created_at
    ) order by occurred_on desc,created_at desc,id desc) from recent_transactions),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_detailed_finance_report_v4(date,date,date[],text,text,text[],uuid[],uuid[],uuid[],text,date,date)
  from public,anon,authenticated;
grant execute on function public.get_detailed_finance_report_v4(date,date,date[],text,text,text[],uuid[],uuid[],uuid[],text,date,date)
  to authenticated;

-- Cursor pagination uses exactly the same scope as the aggregate report.
create or replace function public.get_report_transaction_page_v1(
  p_start_date date,p_end_date date,p_months date[] default null,
  p_kind text default 'all',p_group_keys text[] default null,p_category_ids uuid[] default null,
  p_income_type_ids uuid[] default null,p_account_ids uuid[] default null,p_query text default '',
  p_cursor_date date default null,p_cursor_created timestamptz default null,p_cursor_id uuid default null,
  p_limit integer default 12
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare caller_id uuid := (select auth.uid()); clean_query text := lower(trim(coalesce(p_query,''))); result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then raise exception 'access denied' using errcode='42501'; end if;
  if p_start_date is null or p_end_date is null or p_start_date>p_end_date or p_end_date>p_start_date+interval '5 years'
    or p_kind not in ('all','expense','income','transfer') or p_limit is null or p_limit<1 or p_limit>100
    or coalesce(cardinality(p_months),0)>60 or coalesce(cardinality(p_group_keys),0)>100
    or coalesce(cardinality(p_category_ids),0)>100 or coalesce(cardinality(p_income_type_ids),0)>100
    or coalesce(cardinality(p_account_ids),0)>100 or char_length(clean_query)>120
    or (num_nonnulls(p_cursor_date,p_cursor_created,p_cursor_id) not in (0,3))
  then raise exception 'invalid report page options'; end if;
  with page as materialized (
    select movement.*
    from public.transactions movement
    left join public.categories category on category.user_id=caller_id and category.id=movement.category_id
    where movement.user_id=caller_id and movement.occurred_on between p_start_date and p_end_date
      and (coalesce(cardinality(p_months),0)=0 or date_trunc('month',movement.occurred_on)::date=any(p_months))
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
      and (p_kind='all' or movement.kind=p_kind or (p_kind='transfer' and movement.kind in ('transfer_out','transfer_in')))
      and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)+coalesce(cardinality(p_income_type_ids),0)=0
        or (category.transaction_kind='expense' and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)>0) and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys)) and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids)))
        or (category.transaction_kind='income' and coalesce(cardinality(p_income_type_ids),0)>0 and category.id=any(p_income_type_ids)))
      and (clean_query='' or position(clean_query in lower(movement.description))>0
        or position(clean_query in lower(coalesce(movement.merchant,'')))>0
        or position(clean_query in lower(coalesce(movement.note,'')))>0
        or position(clean_query in lower(coalesce(category.name,'')))>0)
      and movement.kind not in ('transfer_in','adjustment_in','adjustment_out')
      and (p_cursor_id is null or (movement.occurred_on,movement.created_at,movement.id)<(p_cursor_date,p_cursor_created,p_cursor_id))
    order by movement.occurred_on desc,movement.created_at desc,movement.id desc limit p_limit+1
  ), visible as (
    select * from page order by occurred_on desc,created_at desc,id desc limit p_limit
  )
  select jsonb_build_object(
    'transactions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('native_amount',v.amount,'amount',v.base_amount) order by v.occurred_on desc,v.created_at desc,v.id desc) from visible v),'[]'::jsonb),
    'hasMore',(select count(*)>p_limit from page),
    'nextCursor',(select jsonb_build_object('occurredOn',occurred_on,'createdAt',created_at,'id',id) from visible order by occurred_on,created_at,id limit 1)
  ) into result;
  return result;
end; $$;
revoke all on function public.get_report_transaction_page_v1(date,date,date[],text,text[],uuid[],uuid[],uuid[],text,date,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_report_transaction_page_v1(date,date,date[],text,text[],uuid[],uuid[],uuid[],text,date,timestamptz,uuid,integer) to authenticated;
