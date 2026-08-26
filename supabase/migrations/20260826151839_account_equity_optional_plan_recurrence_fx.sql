-- Account equity, optional planning, richer recurrence and safe COP/USD snapshots.
-- Opening balances and balance corrections are stock/equity, never income.

set lock_timeout = '10s';
set statement_timeout = '120s';

alter table public.accounts
  add column if not exists opening_balance_date date,
  add column if not exists opening_exchange_rate numeric(18, 8);

update public.accounts
set opening_balance_date = coalesce(opening_balance_date, created_at::date),
    opening_exchange_rate = coalesce(
      opening_exchange_rate,
      case when currency_code = 'COP' then 1 else (
        select movement.exchange_rate from public.transactions movement
        where movement.user_id = accounts.user_id and movement.account_id = accounts.id
          and movement.exchange_rate > 0
        order by movement.occurred_on, movement.created_at limit 1
      ) end,
      case when currency_code = 'USD' then 4000 else 1 end
    );

alter table public.accounts
  alter column opening_balance_date set default current_date,
  alter column opening_balance_date set not null,
  add constraint accounts_supported_currency_check check (currency_code in ('COP', 'USD')),
  add constraint accounts_opening_exchange_rate_check check (
    (currency_code = 'COP' and opening_exchange_rate = 1)
    or (currency_code = 'USD' and opening_exchange_rate is not null and opening_exchange_rate > 0)
  );

alter table public.transactions
  add column if not exists reference_exchange_rate numeric(18, 8),
  add column if not exists reference_rate_source text;

alter table public.transactions
  drop constraint if exists transactions_kind_check,
  drop constraint if exists transactions_transfer_shape,
  add constraint transactions_kind_check check (
    kind in ('income', 'expense', 'transfer_out', 'transfer_in', 'adjustment_in', 'adjustment_out')
  ),
  add constraint transactions_transfer_shape check (
    (kind in ('transfer_out', 'transfer_in') and transfer_group_id is not null and category_id is null)
    or (kind in ('income', 'expense') and transfer_group_id is null)
    or (kind in ('adjustment_in', 'adjustment_out') and transfer_group_id is null and category_id is null)
  ),
  add constraint transactions_reference_exchange_rate_check check (
    reference_exchange_rate is null or reference_exchange_rate > 0
  ),
  add constraint transactions_reference_rate_source_check check (
    reference_rate_source is null or reference_rate_source in ('sfc_trm', 'manual', 'imported')
  );

create or replace function private.prepare_transaction_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_currency text;
  reporting_currency text;
  expected_event_type text;
begin
  select account.currency_code, profile.currency_code
  into account_currency, reporting_currency
  from public.accounts account
  join public.profiles profile on profile.id = account.user_id
  where account.user_id = new.user_id and account.id = new.account_id;

  if account_currency is null then raise exception 'account is not available'; end if;
  if reporting_currency not in ('COP', 'USD') then reporting_currency := 'COP'; end if;

  if new.native_currency_code is not null and new.native_currency_code <> account_currency then
    raise exception 'movement currency must match its account';
  end if;
  if new.base_currency_code is not null and new.base_currency_code <> reporting_currency then
    raise exception 'movement reporting currency must match the profile';
  end if;

  new.native_currency_code := account_currency;
  new.base_currency_code := reporting_currency;
  if account_currency = reporting_currency then
    new.exchange_rate := 1;
    new.exchange_rate_source := 'same_currency';
  elsif new.exchange_rate is null or new.exchange_rate <= 0 then
    raise exception 'a positive exchange rate is required for different currencies';
  end if;
  new.base_amount := round(new.amount * new.exchange_rate, 8);
  new.exchange_rate_date := coalesce(new.exchange_rate_date, new.occurred_on);
  new.exchange_rate_source := coalesce(new.exchange_rate_source, 'manual');
  new.ledger_event_id := coalesce(new.transfer_group_id, new.id);

  expected_event_type := case
    when new.kind = 'income' then 'income'
    when new.kind = 'expense' then 'expense'
    when new.kind in ('adjustment_in', 'adjustment_out') then 'adjustment'
    else 'transfer'
  end;

  insert into public.ledger_events (
    id, user_id, event_type, occurred_on, description, merchant, note, source, idempotency_key
  ) values (
    new.ledger_event_id, new.user_id, expected_event_type, new.occurred_on,
    new.description, new.merchant, new.note,
    case when new.recurring_occurrence_id is not null then 'recurring' else 'manual' end,
    new.ledger_event_id
  )
  on conflict (id) do update set
    event_type = excluded.event_type,
    occurred_on = excluded.occurred_on,
    description = excluded.description,
    merchant = excluded.merchant,
    note = excluded.note,
    source = excluded.source,
    updated_at = now(),
    version = public.ledger_events.version + 1
  where public.ledger_events.user_id = new.user_id;

  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

create or replace function public.upsert_transactions_v3(
  p_operation_id uuid,
  p_transactions jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_count integer;
  prior_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null then raise exception 'operation id is required'; end if;
  select (result->>'count')::integer into prior_count
  from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'transactions.upsert.v3';
  if found then return coalesce(prior_count, 0); end if;
  if jsonb_typeof(p_transactions) <> 'array' or jsonb_array_length(p_transactions) not between 1 and 1000 then
    raise exception 'transactions must contain between 1 and 1000 rows';
  end if;

  insert into public.transactions (
    id, user_id, account_id, category_id, kind, amount, transfer_group_id,
    description, merchant, note, icon, recurring_occurrence_id,
    financial_target_id, financial_target_effect, occurred_on,
    native_currency_code, base_currency_code, base_amount, exchange_rate,
    exchange_rate_date, exchange_rate_source, reference_exchange_rate, reference_rate_source
  )
  select row.id, caller_id, row.account_id, row.category_id, row.kind, row.amount,
    row.transfer_group_id, row.description, row.merchant, row.note, row.icon,
    row.recurring_occurrence_id, row.financial_target_id, row.financial_target_effect,
    row.occurred_on, row.native_currency_code, row.base_currency_code, row.base_amount,
    row.exchange_rate, row.exchange_rate_date, row.exchange_rate_source,
    row.reference_exchange_rate, row.reference_rate_source
  from jsonb_to_recordset(p_transactions) as row(
    id uuid, account_id uuid, category_id uuid, kind text, amount numeric,
    transfer_group_id uuid, description text, merchant text, note text, icon text,
    recurring_occurrence_id uuid, financial_target_id uuid, financial_target_effect text,
    occurred_on date, native_currency_code text, base_currency_code text,
    base_amount numeric, exchange_rate numeric, exchange_rate_date date,
    exchange_rate_source text, reference_exchange_rate numeric, reference_rate_source text
  )
  on conflict (id) do update set
    account_id = excluded.account_id, category_id = excluded.category_id,
    kind = excluded.kind, amount = excluded.amount,
    transfer_group_id = excluded.transfer_group_id, description = excluded.description,
    merchant = excluded.merchant, note = excluded.note, icon = excluded.icon,
    recurring_occurrence_id = excluded.recurring_occurrence_id,
    financial_target_id = excluded.financial_target_id,
    financial_target_effect = excluded.financial_target_effect,
    occurred_on = excluded.occurred_on,
    native_currency_code = excluded.native_currency_code,
    base_currency_code = excluded.base_currency_code,
    base_amount = excluded.base_amount, exchange_rate = excluded.exchange_rate,
    exchange_rate_date = excluded.exchange_rate_date,
    exchange_rate_source = excluded.exchange_rate_source,
    reference_exchange_rate = excluded.reference_exchange_rate,
    reference_rate_source = excluded.reference_rate_source
  where public.transactions.user_id = caller_id;

  get diagnostics saved_count = row_count;
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'transactions.upsert.v3', jsonb_build_object('count', saved_count));
  return saved_count;
end;
$$;

create or replace function public.update_account_v3(
  p_operation_id uuid,
  p_account jsonb,
  p_expected_version bigint,
  p_target_balance numeric default null,
  p_adjustment_date date default current_date,
  p_exchange_rate numeric default null,
  p_reference_exchange_rate numeric default null,
  p_reference_rate_source text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_account public.accounts%rowtype;
  current_balance numeric;
  balance_delta numeric;
  movement_kind text;
  movement_id uuid;
  rate numeric;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  select result into prior_result from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'account.update.v3';
  if found then return prior_result; end if;

  select * into saved_account from public.accounts
  where id = (p_account->>'id')::uuid and user_id = caller_id for update;
  if not found then raise exception 'account is not available'; end if;
  if saved_account.version <> p_expected_version then raise exception 'account was modified elsewhere'; end if;
  if (p_account->>'currency_code') is distinct from saved_account.currency_code
     and exists (select 1 from public.transactions where user_id = caller_id and account_id = saved_account.id) then
    raise exception 'account currency cannot change after it has movements';
  end if;

  update public.accounts set
    name = trim(p_account->>'name'), account_type = p_account->>'account_type',
    color = p_account->>'color', icon = nullif(p_account->>'icon', ''),
    currency_code = p_account->>'currency_code',
    expected_annual_return = nullif(p_account->>'expected_annual_return', '')::numeric,
    opening_exchange_rate = case when (p_account->>'currency_code') = 'COP' then 1 else opening_exchange_rate end,
    version = version + 1
  where id = saved_account.id and user_id = caller_id
  returning * into saved_account;

  select saved_account.initial_balance + coalesce(sum(case
    when movement.kind in ('income', 'transfer_in', 'adjustment_in') then movement.amount
    else -movement.amount end), 0)
  into current_balance from public.transactions movement
  where movement.user_id = caller_id and movement.account_id = saved_account.id;

  if p_target_balance is not null and abs(p_target_balance - current_balance) >= 0.005 then
    balance_delta := p_target_balance - current_balance;
    movement_kind := case when balance_delta > 0 then 'adjustment_in' else 'adjustment_out' end;
    rate := case when saved_account.currency_code = 'COP' then 1 else p_exchange_rate end;
    if rate is null or rate <= 0 then raise exception 'exchange rate is required for a USD balance adjustment'; end if;
    movement_id := gen_random_uuid();
    insert into public.transactions (
      id, user_id, account_id, kind, amount, description, note, occurred_on,
      native_currency_code, base_currency_code, exchange_rate, exchange_rate_date,
      exchange_rate_source, reference_exchange_rate, reference_rate_source
    ) values (
      movement_id, caller_id, saved_account.id, movement_kind, abs(balance_delta),
      'Ajuste de saldo', 'Conciliación manual desde Cuentas', p_adjustment_date,
      saved_account.currency_code, 'COP', rate, p_adjustment_date,
      case when saved_account.currency_code = 'COP' then 'same_currency' else 'manual' end,
      p_reference_exchange_rate, p_reference_rate_source
    );
  end if;

  prior_result := jsonb_build_object('id', saved_account.id, 'version', saved_account.version, 'adjustmentId', movement_id);
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account.update.v3', prior_result);
  return prior_result;
end;
$$;

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
  account_base_rows jsonb;
  category_rows jsonb;
  month_income numeric;
  month_expense numeric;
  net_worth numeric;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'month must be the first day of a month'; end if;

  with balances as (
    select account.id,
      account.initial_balance + coalesce(sum(case
        when movement.kind in ('income', 'transfer_in', 'adjustment_in') then movement.amount
        else -movement.amount end), 0) as native_balance,
      account.initial_balance * account.opening_exchange_rate + coalesce(sum(case
        when movement.kind in ('income', 'transfer_in', 'adjustment_in') then movement.base_amount
        else -movement.base_amount end), 0) as base_balance
    from public.accounts account
    left join public.transactions movement on movement.user_id = caller_id and movement.account_id = account.id
    where account.user_id = caller_id and not account.archived
    group by account.id, account.initial_balance, account.opening_exchange_rate
  )
  select coalesce(jsonb_object_agg(id, native_balance), '{}'::jsonb),
    coalesce(jsonb_object_agg(id, base_balance), '{}'::jsonb), coalesce(sum(base_balance), 0)
  into account_rows, account_base_rows, net_worth from balances;

  select coalesce(sum(base_amount) filter (where kind = 'income'), 0),
    coalesce(sum(base_amount) filter (where kind = 'expense'), 0)
  into month_income, month_expense from public.transactions
  where user_id = caller_id and occurred_on >= p_month
    and occurred_on < (p_month + interval '1 month')::date;

  select coalesce(jsonb_object_agg(category_id, spent), '{}'::jsonb)
  into category_rows from (
    select category_id, sum(base_amount) as spent from public.transactions
    where user_id = caller_id and kind = 'expense' and category_id is not null
      and occurred_on >= p_month and occurred_on < (p_month + interval '1 month')::date
    group by category_id
  ) category_spend;

  return jsonb_build_object('month', p_month, 'income', month_income, 'expense', month_expense,
    'netWorth', net_worth, 'accountBalances', account_rows,
    'accountBalancesBase', account_base_rows, 'categorySpending', category_rows);
end;
$$;

-- New users start with a useful category structure but no enforced allocation plan.
create or replace function private.provision_finance_user(
  p_user_id uuid, p_email text, p_user_metadata jsonb default '{}'::jsonb
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
    select 1 from private.access_allowlist where email = lower(trim(p_email)) and enabled
  ) then return; end if;
  insert into public.profiles (id, email, display_name, avatar_url)
  values (p_user_id, lower(trim(p_email)), profile_name, profile_avatar)
  on conflict (id) do update set email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  insert into public.accounts (user_id, name, account_type, initial_balance, color, opening_exchange_rate)
  select p_user_id, 'Efectivo', 'cash', 0, '#34d399', 1
  where not exists (select 1 from public.accounts where user_id = p_user_id);
  insert into public.group_allocations
    (user_id, group_key, name, color, icon, target_percent, included_in_plan, sort_order, archived, is_default)
  values
    (p_user_id, 'needs', 'Necesidades', '#55a8f8', 'home', 0, false, 0, false, true),
    (p_user_id, 'wants', 'Gustos', '#fb7185', 'sparkles', 0, false, 1, false, true),
    (p_user_id, 'savings', 'Ahorros', '#34d399', 'piggy-bank', 0, false, 2, false, true),
    (p_user_id, 'investments', 'Inversiones', '#a78bfa', 'chart-no-axes-combined', 0, false, 3, false, true),
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
  where not exists (select 1 from public.categories existing
    where existing.user_id = p_user_id and existing.name = seed.name and existing.transaction_kind = seed.kind);
end;
$$;

-- Every 14 days remains weekly with interval_count=2. Semimonthly uses two
-- independent day anchors and is intentionally a distinct cadence.
alter table public.recurring_rules
  add column if not exists second_anchor_day smallint,
  drop constraint if exists recurring_rules_cadence_check,
  add constraint recurring_rules_cadence_check check (cadence in ('weekly', 'monthly', 'semimonthly', 'yearly')),
  add constraint recurring_rules_second_anchor_day_check check (second_anchor_day is null or second_anchor_day between 1 and 31),
  add constraint recurring_rules_semimonthly_shape check (
    (cadence = 'semimonthly' and anchor_day is not null and second_anchor_day is not null and anchor_day <> second_anchor_day)
    or (cadence <> 'semimonthly' and second_anchor_day is null)
  );

create or replace function private.materialize_recurring_rule(
  p_rule_id uuid,
  p_horizon date default (current_date + 400)
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_record public.recurring_rules%rowtype;
  cursor_date date;
  effective_date date;
  absolute_month integer;
  target_year integer;
  target_month integer;
  local_today date;
  generated integer := 0;
  month_cursor date;
  candidate_date date;
  anchor integer;
begin
  select * into rule_record from public.recurring_rules where id = p_rule_id;
  if not found then return; end if;
  local_today := (current_timestamp at time zone rule_record.timezone)::date;
  if rule_record.status <> 'active' then
    update public.recurring_occurrences set status = 'cancelled'
    where rule_id = rule_record.id and status = 'planned' and scheduled_on >= local_today;
    return;
  end if;
  delete from public.recurring_occurrences
  where rule_id = rule_record.id and status = 'planned' and scheduled_on >= local_today;

  if rule_record.cadence = 'semimonthly' then
    month_cursor := date_trunc('month', greatest(rule_record.starts_on, local_today))::date;
    while month_cursor <= p_horizon loop
      foreach anchor in array array[rule_record.anchor_day, rule_record.second_anchor_day] loop
        candidate_date := private.recurring_month_date(
          extract(year from month_cursor)::integer,
          extract(month from month_cursor)::integer,
          anchor
        );
        if candidate_date >= greatest(rule_record.starts_on, local_today)
          and candidate_date <= p_horizon
          and (rule_record.ends_on is null or candidate_date <= rule_record.ends_on) then
          effective_date := case when rule_record.posting_policy = 'month_start'
            then date_trunc('month', candidate_date)::date else candidate_date end;
          insert into public.recurring_occurrences (
            user_id, rule_id, kind, scheduled_on, effective_on, amount, account_id,
            destination_account_id, category_id, description, merchant, note, icon
          ) values (
            rule_record.user_id, rule_record.id, rule_record.kind, candidate_date, effective_date,
            rule_record.amount, rule_record.account_id, rule_record.destination_account_id,
            rule_record.category_id, rule_record.description, rule_record.merchant,
            rule_record.note, rule_record.icon
          ) on conflict (user_id, rule_id, scheduled_on) do nothing;
          generated := generated + 1;
        end if;
      end loop;
      month_cursor := (month_cursor + interval '1 month')::date;
      if generated > 2000 then raise exception 'recurring rule exceeds safe generation limit'; end if;
    end loop;
  else
    cursor_date := rule_record.starts_on;
    while cursor_date < local_today loop
      if rule_record.cadence = 'weekly' then cursor_date := cursor_date + (rule_record.interval_count * 7);
      elsif rule_record.cadence = 'monthly' then
        absolute_month := extract(year from cursor_date)::integer * 12 + extract(month from cursor_date)::integer - 1 + rule_record.interval_count;
        target_year := floor(absolute_month / 12.0)::integer; target_month := mod(absolute_month, 12) + 1;
        cursor_date := private.recurring_month_date(target_year, target_month, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
      else
        target_year := extract(year from cursor_date)::integer + rule_record.interval_count;
        cursor_date := private.recurring_month_date(target_year, extract(month from rule_record.starts_on)::integer, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
      end if;
      generated := generated + 1;
      if generated > 2000 then raise exception 'recurring rule exceeds safe generation limit'; end if;
    end loop;
    generated := 0;
    while cursor_date <= p_horizon and (rule_record.ends_on is null or cursor_date <= rule_record.ends_on) loop
      effective_date := case when rule_record.posting_policy = 'month_start' then date_trunc('month', cursor_date)::date else cursor_date end;
      insert into public.recurring_occurrences (
        user_id, rule_id, kind, scheduled_on, effective_on, amount, account_id,
        destination_account_id, category_id, description, merchant, note, icon
      ) values (
        rule_record.user_id, rule_record.id, rule_record.kind, cursor_date, effective_date,
        rule_record.amount, rule_record.account_id, rule_record.destination_account_id,
        rule_record.category_id, rule_record.description, rule_record.merchant,
        rule_record.note, rule_record.icon
      ) on conflict (user_id, rule_id, scheduled_on) do nothing;
      if rule_record.cadence = 'weekly' then cursor_date := cursor_date + (rule_record.interval_count * 7);
      elsif rule_record.cadence = 'monthly' then
        absolute_month := extract(year from cursor_date)::integer * 12 + extract(month from cursor_date)::integer - 1 + rule_record.interval_count;
        target_year := floor(absolute_month / 12.0)::integer; target_month := mod(absolute_month, 12) + 1;
        cursor_date := private.recurring_month_date(target_year, target_month, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
      else
        target_year := extract(year from cursor_date)::integer + rule_record.interval_count;
        cursor_date := private.recurring_month_date(target_year, extract(month from rule_record.starts_on)::integer, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
      end if;
      generated := generated + 1;
      if generated > 2000 then raise exception 'recurring rule exceeds safe generation limit'; end if;
    end loop;
  end if;

  update public.recurring_rules set next_run_on = coalesce((
    select min(effective_on) from public.recurring_occurrences
    where rule_id = rule_record.id and status = 'planned'
  ), rule_record.ends_on, p_horizon) where id = rule_record.id;
end;
$$;

drop trigger if exists recurring_rules_refresh_occurrences on public.recurring_rules;
create trigger recurring_rules_refresh_occurrences
after insert or update of account_id, destination_account_id, category_id, kind, amount,
  description, merchant, note, icon, cadence, interval_count, starts_on, ends_on,
  anchor_day, second_anchor_day, posting_policy, timezone, auto_post, include_in_budget,
  include_in_income_target, status
on public.recurring_rules
for each row execute function private.refresh_recurring_rule_occurrences();

revoke all on function public.upsert_transactions_v3(uuid, jsonb) from public, anon;
revoke all on function public.update_account_v3(uuid, jsonb, bigint, numeric, date, numeric, numeric, text) from public, anon;
grant execute on function public.upsert_transactions_v3(uuid, jsonb) to authenticated;
grant execute on function public.update_account_v3(uuid, jsonb, bigint, numeric, date, numeric, numeric, text) to authenticated;

-- Report aggregates always use the immutable reporting-currency snapshot.
create or replace function public.get_detailed_finance_report_v3(
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
declare caller_id uuid := (select auth.uid()); result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then raise exception 'access denied' using errcode = '42501'; end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date or p_end_date > p_start_date + interval '5 years' then raise exception 'invalid report range'; end if;
  if p_granularity not in ('day','week','month') or p_kind not in ('all','expense','income','transfer') then raise exception 'invalid report options'; end if;
  if coalesce(cardinality(p_months),0) > 60 or coalesce(cardinality(p_group_keys),0) > 100
    or coalesce(cardinality(p_category_ids),0) > 100 or coalesce(cardinality(p_income_type_ids),0) > 100
    or coalesce(cardinality(p_account_ids),0) > 100 then raise exception 'too many report filters'; end if;

  with recursive params as (
    select lower(trim(coalesce(p_query,''))) clean_query,
      case p_granularity when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end bucket_step,
      date_trunc(p_granularity,p_start_date::timestamp)::date first_bucket,
      date_trunc(p_granularity,p_end_date::timestamp)::date last_bucket
  ), base as materialized (
    select movement.*, movement.base_amount as report_amount, category.name category_name,
      category.category_group, category.transaction_kind category_kind,
      category.color category_color, category.icon category_icon
    from public.transactions movement left join public.categories category
      on category.user_id=caller_id and category.id=movement.category_id cross join params
    where movement.user_id=caller_id and movement.occurred_on between p_start_date and p_end_date
      and (coalesce(cardinality(p_months),0)=0 or date_trunc('month',movement.occurred_on)::date=any(p_months))
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
      and (p_kind='all' or movement.kind=p_kind or (p_kind='transfer' and movement.kind in ('transfer_out','transfer_in')))
      and (coalesce(cardinality(p_group_keys),0)+coalesce(cardinality(p_category_ids),0)+coalesce(cardinality(p_income_type_ids),0)=0
        or (category.transaction_kind='expense' and ((coalesce(cardinality(p_group_keys),0)>0 and category.category_group=any(p_group_keys)) or (coalesce(cardinality(p_category_ids),0)>0 and category.id=any(p_category_ids))))
        or (category.transaction_kind='income' and coalesce(cardinality(p_income_type_ids),0)>0 and category.id=any(p_income_type_ids)))
      and (params.clean_query='' or position(params.clean_query in lower(movement.description))>0
        or position(params.clean_query in lower(coalesce(movement.merchant,'')))>0
        or position(params.clean_query in lower(coalesce(movement.note,'')))>0
        or position(params.clean_query in lower(coalesce(category.name,'')))>0)
  ), comparison_base as materialized (
    select movement.*, movement.base_amount report_amount from public.transactions movement cross join params
    where p_comparison_start is not null and p_comparison_end is not null and movement.user_id=caller_id
      and movement.occurred_on between p_comparison_start and p_comparison_end
      and (coalesce(cardinality(p_account_ids),0)=0 or movement.account_id=any(p_account_ids))
      and (p_kind='all' or movement.kind=p_kind or (p_kind='transfer' and movement.kind in ('transfer_out','transfer_in')))
      and (params.clean_query='' or position(params.clean_query in lower(movement.description))>0 or position(params.clean_query in lower(coalesce(movement.merchant,'')))>0 or position(params.clean_query in lower(coalesce(movement.note,'')))>0)
  ), selected_budget as materialized (
    select budget.category_id,sum(budget.amount) amount from public.budgets budget
    join public.categories category on category.user_id=caller_id and category.id=budget.category_id
    where budget.user_id=caller_id and p_kind in ('all','expense')
      and budget.month between date_trunc('month',p_start_date)::date and date_trunc('month',p_end_date)::date
      and (coalesce(cardinality(p_months),0)=0 or budget.month=any(p_months))
      and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys))
      and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids)) group by budget.category_id
  ), summary as (
    select coalesce(sum(report_amount) filter(where kind='income'),0) income,
      coalesce(sum(report_amount) filter(where kind='expense'),0) expense,
      count(*) filter(where kind not in ('transfer_in','adjustment_in','adjustment_out')) transaction_count from base
  ), comparison_summary as (
    select coalesce(sum(report_amount) filter(where kind='income'),0) income,
      coalesce(sum(report_amount) filter(where kind='expense'),0) expense,
      count(*) filter(where kind not in ('transfer_in','adjustment_in','adjustment_out')) transaction_count from comparison_base
  ), budget_summary as (select coalesce(sum(amount),0) budget from selected_budget),
  buckets as (select generate_series(params.first_bucket,params.last_bucket,params.bucket_step)::date period from params),
  series as (
    select bucket.period,coalesce(sum(base.report_amount) filter(where base.kind='income'),0) income,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) expense
    from buckets bucket left join base on date_trunc(p_granularity,base.occurred_on)::date=bucket.period group by bucket.period
  ), category_stats as (
    select category.id,category.name,category.category_group,category.color,category.icon,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) expense,
      coalesce(max(selected_budget.amount),0) budget,count(base.id) filter(where base.kind='expense') transaction_count
    from public.categories category left join base on base.category_id=category.id
    left join selected_budget on selected_budget.category_id=category.id
    where category.user_id=caller_id and category.transaction_kind='expense'
      and (not category.archived or base.id is not null)
      and (coalesce(cardinality(p_group_keys),0)=0 or category.category_group=any(p_group_keys))
      and (coalesce(cardinality(p_category_ids),0)=0 or category.id=any(p_category_ids))
    group by category.id,category.name,category.category_group,category.color,category.icon
  ), group_stats as (
    select finance_group.group_key,finance_group.name,finance_group.color,finance_group.target_percent,
      finance_group.included_in_plan,finance_group.archived,finance_group.sort_order,
      coalesce(sum(category_stats.expense),0) expense,coalesce(sum(category_stats.budget),0) budget,
      coalesce(sum(category_stats.transaction_count),0) transaction_count
    from public.group_allocations finance_group left join category_stats on category_stats.category_group=finance_group.group_key
    where finance_group.user_id=caller_id and (coalesce(cardinality(p_group_keys),0)=0 or finance_group.group_key=any(p_group_keys))
    group by finance_group.group_key,finance_group.name,finance_group.color,finance_group.target_percent,
      finance_group.included_in_plan,finance_group.archived,finance_group.sort_order
    having not finance_group.archived or coalesce(sum(category_stats.expense),0)>0
  ), income_stats as (
    select category.id,category.name,category.color,category.icon,
      coalesce(sum(base.report_amount) filter(where base.kind='income'),0) income,
      count(base.id) filter(where base.kind='income') transaction_count
    from public.categories category left join base on base.category_id=category.id
    where category.user_id=caller_id and category.transaction_kind='income'
      and (not category.archived or base.id is not null)
      and (coalesce(cardinality(p_income_type_ids),0)=0 or category.id=any(p_income_type_ids))
    group by category.id,category.name,category.color,category.icon
  ), account_stats as (
    select account.id,account.name,account.account_type,account.color,account.icon,
      coalesce(sum(base.report_amount) filter(where base.kind='income'),0) income,
      coalesce(sum(base.report_amount) filter(where base.kind='expense'),0) expense,
      coalesce(sum(base.report_amount) filter(where base.kind='transfer_in'),0) transfer_in,
      coalesce(sum(base.report_amount) filter(where base.kind='transfer_out'),0) transfer_out,
      account.initial_balance*account.opening_exchange_rate+coalesce((select sum(case when m.kind in ('income','transfer_in','adjustment_in') then m.base_amount else -m.base_amount end) from public.transactions m where m.user_id=caller_id and m.account_id=account.id and m.occurred_on<p_start_date),0) opening_balance,
      account.initial_balance*account.opening_exchange_rate+coalesce((select sum(case when m.kind in ('income','transfer_in','adjustment_in') then m.base_amount else -m.base_amount end) from public.transactions m where m.user_id=caller_id and m.account_id=account.id and m.occurred_on<=p_end_date),0) closing_balance
    from public.accounts account left join base on base.account_id=account.id
    where account.user_id=caller_id and (not account.archived or base.id is not null)
      and (coalesce(cardinality(p_account_ids),0)=0 or account.id=any(p_account_ids))
    group by account.id,account.name,account.account_type,account.color,account.icon,account.initial_balance,account.opening_exchange_rate
  ), merchant_stats as (
    select coalesce(nullif(trim(merchant),''),description) name,sum(report_amount) expense,count(*) transaction_count
    from base where kind='expense' group by coalesce(nullif(trim(merchant),''),description) order by expense desc,name limit 12
  ), weekday_stats as (
    select extract(isodow from occurred_on)::integer weekday,sum(report_amount) expense,count(*) transaction_count
    from base where kind='expense' group by extract(isodow from occurred_on) order by weekday
  ), recent_transactions as (
    select * from base where kind not in ('transfer_in','adjustment_in','adjustment_out')
    order by occurred_on desc,created_at desc,id desc limit 100
  )
  select jsonb_build_object(
    'startDate',p_start_date,'endDate',p_end_date,'selectedMonths',coalesce(to_jsonb(p_months),'[]'::jsonb),'granularity',p_granularity,
    'summary',(select jsonb_build_object('income',s.income,'expense',s.expense,'balance',s.income-s.expense,'savingsRate',case when s.income>0 then (s.income-s.expense)/s.income*100 else 0 end,'averageDailyExpense',s.expense/greatest(1,p_end_date-p_start_date+1),'transactionCount',s.transaction_count,'budget',b.budget,'budgetUsage',case when b.budget>0 then s.expense/b.budget*100 else 0 end,'budgetVariance',b.budget-s.expense) from summary s cross join budget_summary b),
    'comparison',case when p_comparison_start is null then null else (select jsonb_build_object('income',income,'expense',expense,'balance',income-expense,'savingsRate',case when income>0 then (income-expense)/income*100 else 0 end,'averageDailyExpense',expense/greatest(1,p_comparison_end-p_comparison_start+1),'transactionCount',transaction_count,'budget',0,'budgetUsage',0,'budgetVariance',0) from comparison_summary) end,
    'series',coalesce((select jsonb_agg(jsonb_build_object('period',period,'income',income,'expense',expense,'balance',income-expense) order by period) from series),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('group',g.group_key,'name',g.name,'color',g.color,'expense',g.expense,'budget',g.budget,'variance',g.budget-g.expense,'usage',case when g.budget>0 then g.expense/g.budget*100 else 0 end,'transactionCount',g.transaction_count,'targetPercent',g.target_percent,'includedInPlan',g.included_in_plan,'archived',g.archived,'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'group',c.category_group,'color',c.color,'icon',c.icon,'expense',c.expense,'budget',c.budget,'variance',c.budget-c.expense,'usage',case when c.budget>0 then c.expense/c.budget*100 else 0 end,'transactionCount',c.transaction_count) order by c.expense desc,c.name) from category_stats c where c.category_group=g.group_key),'[]'::jsonb)) order by g.sort_order,g.name) from group_stats g),'[]'::jsonb),
    'incomeTypes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'icon',icon,'income',income,'percent',case when (select income from summary)>0 then income/(select income from summary)*100 else 0 end,'transactionCount',transaction_count) order by income desc,name) from income_stats),'[]'::jsonb),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'type',account_type,'color',color,'icon',icon,'openingBalance',opening_balance,'closingBalance',closing_balance,'income',income,'expense',expense,'transferIn',transfer_in,'transferOut',transfer_out,'netFlow',closing_balance-opening_balance) order by closing_balance desc,name) from account_stats),'[]'::jsonb),
    'merchants',coalesce((select jsonb_agg(jsonb_build_object('name',name,'expense',expense,'transactionCount',transaction_count) order by expense desc,name) from merchant_stats),'[]'::jsonb),
    'weekdays',coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'expense',expense,'transactionCount',transaction_count) order by weekday) from weekday_stats),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',report_amount,'native_amount',amount,'native_currency_code',native_currency_code,'base_currency_code',base_currency_code,'account_id',account_id,'category_id',category_id,'transfer_group_id',transfer_group_id,'description',description,'merchant',merchant,'note',note,'icon',icon,'occurred_on',occurred_on,'created_at',created_at) order by occurred_on desc,created_at desc,id desc) from recent_transactions),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_detailed_finance_report_v3(date,date,date[],text,text,text[],uuid[],uuid[],uuid[],text,date,date) from public,anon,authenticated;
grant execute on function public.get_detailed_finance_report_v3(date,date,date[],text,text,text[],uuid[],uuid[],uuid[],text,date,date) to authenticated;

create or replace function public.get_finance_report(p_end_month date,p_months integer default 12)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare caller_id uuid:=(select auth.uid()); first_month date; month_rows jsonb; group_rows jsonb;
begin
  if caller_id is null or not(select public.is_current_user_allowed()) then raise exception 'access denied' using errcode='42501'; end if;
  if p_end_month is null or extract(day from p_end_month)<>1 then raise exception 'end month must be the first day of a month'; end if;
  if p_months not between 1 and 60 then raise exception 'months must be between 1 and 60'; end if;
  first_month:=(p_end_month-make_interval(months=>p_months-1))::date;
  select coalesce(jsonb_agg(jsonb_build_object('month',report_month,'income',income,'expense',expense,'balance',income-expense) order by report_month),'[]'::jsonb)
  into month_rows from (
    select month_start::date report_month,coalesce(sum(movement.base_amount) filter(where movement.kind='income'),0) income,
      coalesce(sum(movement.base_amount) filter(where movement.kind='expense'),0) expense
    from generate_series(first_month,p_end_month,interval '1 month') month_start
    left join public.transactions movement on movement.user_id=caller_id and movement.occurred_on>=month_start::date
      and movement.occurred_on<(month_start+interval '1 month')::date group by month_start
  ) rows;
  select coalesce(jsonb_agg(jsonb_build_object('group',group_key,'name',name,'color',color,'expense',expense,
    'targetPercent',target_percent,'includedInPlan',included_in_plan,'archived',archived) order by sort_order,name),'[]'::jsonb)
  into group_rows from (
    select finance_group.group_key,finance_group.name,finance_group.color,finance_group.target_percent,
      finance_group.included_in_plan,finance_group.archived,finance_group.sort_order,coalesce(sum(movement.base_amount),0) expense
    from public.group_allocations finance_group left join public.categories category
      on category.user_id=caller_id and category.category_group=finance_group.group_key and category.transaction_kind='expense'
    left join public.transactions movement on movement.user_id=caller_id and movement.category_id=category.id
      and movement.kind='expense' and movement.occurred_on>=first_month and movement.occurred_on<(p_end_month+interval '1 month')::date
    where finance_group.user_id=caller_id group by finance_group.group_key,finance_group.name,finance_group.color,
      finance_group.target_percent,finance_group.included_in_plan,finance_group.archived,finance_group.sort_order
    having not finance_group.archived or coalesce(sum(movement.base_amount),0)>0
  ) rows;
  return jsonb_build_object('startMonth',first_month,'endMonth',p_end_month,'months',month_rows,'groups',group_rows);
end; $$;
