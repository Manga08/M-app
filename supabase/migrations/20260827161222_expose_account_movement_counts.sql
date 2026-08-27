-- Make the account currency lock visible to paginated clients. The snapshot
-- already scans every account movement to calculate balances, so returning the
-- counts adds no additional round trip or independent source of truth.
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
  account_movement_rows jsonb;
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
        else -movement.base_amount end), 0) as base_balance,
      count(movement.id) as movement_count
    from public.accounts account
    left join public.transactions movement on movement.user_id = caller_id and movement.account_id = account.id
    where account.user_id = caller_id and not account.archived
    group by account.id, account.initial_balance, account.opening_exchange_rate
  )
  select coalesce(jsonb_object_agg(id, native_balance), '{}'::jsonb),
    coalesce(jsonb_object_agg(id, base_balance), '{}'::jsonb),
    coalesce(jsonb_object_agg(id, movement_count), '{}'::jsonb),
    coalesce(sum(base_balance), 0)
  into account_rows, account_base_rows, account_movement_rows, net_worth from balances;

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
    'accountBalancesBase', account_base_rows, 'accountMovementCounts', account_movement_rows,
    'categorySpending', category_rows);
end;
$$;

-- Older clients could offer a currency selector when the account's movements
-- were outside their paginated cache. Preserve the immutable server currency,
-- discard the ambiguous balance reconciliation, and still apply harmless
-- metadata edits so an already-encrypted offline operation can drain safely.
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
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_account public.accounts%rowtype;
  previous_currency text;
  requested_currency text;
  requested_entity_id uuid := nullif(p_account->>'entity_id', '')::uuid;
  current_balance numeric;
  balance_delta numeric;
  movement_kind text;
  movement_id uuid;
  rate numeric;
  prior_result jsonb;
  currency_preserved boolean := false;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  select result into prior_result from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'account.update.v3';
  if found then return prior_result; end if;

  select * into saved_account from public.accounts
  where id = (p_account->>'id')::uuid and user_id = caller_id for update;
  if not found then raise exception 'account is not available'; end if;
  if saved_account.version <> p_expected_version then raise exception 'account was modified elsewhere'; end if;

  previous_currency := saved_account.currency_code;
  requested_currency := p_account->>'currency_code';
  if requested_currency not in ('COP', 'USD') then raise exception 'unsupported account currency'; end if;
  if trim(coalesce(p_account->>'name', '')) = '' then raise exception 'account name is required'; end if;
  if requested_entity_id is not null and not exists (
    select 1 from public.account_entities entity
    where entity.id = requested_entity_id and entity.user_id = caller_id and not entity.archived
  ) then raise exception 'account entity is not available'; end if;

  if requested_currency is distinct from previous_currency
     and exists (select 1 from public.transactions where user_id = caller_id and account_id = saved_account.id) then
    requested_currency := previous_currency;
    p_target_balance := null;
    p_exchange_rate := saved_account.opening_exchange_rate;
    p_reference_exchange_rate := null;
    p_reference_rate_source := null;
    currency_preserved := true;
  end if;
  if requested_currency = 'USD' and requested_currency is distinct from previous_currency
     and (p_exchange_rate is null or p_exchange_rate <= 0) then
    raise exception 'exchange rate is required to change an account to USD';
  end if;

  update public.accounts set
    name = trim(p_account->>'name'), account_type = p_account->>'account_type',
    color = p_account->>'color', icon = nullif(p_account->>'icon', ''),
    entity_id = requested_entity_id,
    currency_code = requested_currency,
    expected_annual_return = nullif(p_account->>'expected_annual_return', '')::numeric,
    opening_exchange_rate = case
      when requested_currency = 'COP' then 1
      when requested_currency is distinct from previous_currency then p_exchange_rate
      else opening_exchange_rate
    end,
    opening_balance_date = case
      when requested_currency is distinct from previous_currency then coalesce(p_adjustment_date, opening_balance_date)
      else opening_balance_date
    end,
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

  prior_result := jsonb_build_object(
    'id', saved_account.id,
    'version', saved_account.version,
    'adjustmentId', movement_id,
    'currencyCode', saved_account.currency_code,
    'currencyPreserved', currency_preserved
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account.update.v3', prior_result);
  return prior_result;
end;
$$;

comment on function public.update_account_v3(uuid, jsonb, bigint, numeric, date, numeric, numeric, text) is
  'Updates an account atomically. Currency is immutable after the first movement; legacy queued mismatches preserve the stored currency and skip ambiguous balance reconciliation.';
