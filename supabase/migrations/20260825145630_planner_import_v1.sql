-- Atomic import boundary for the three supported monthly-planner formats.
-- The XLSX is parsed in the browser; only the human-reviewed rows arrive here.

set lock_timeout = '10s';
set statement_timeout = '120s';

create or replace function public.import_planner_v1(
  p_operation_id uuid,
  p_account jsonb,
  p_categories jsonb,
  p_income_types jsonb,
  p_transactions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_account_id uuid := (p_account ->> 'id')::uuid;
  create_account boolean := coalesce((p_account ->> 'create_account')::boolean, false);
  reconcile_initial boolean := coalesce((p_account ->> 'reconcile_initial_balance')::boolean, false);
  category jsonb;
  income_type jsonb;
  saved_count integer;
  result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null then raise exception 'operation id is required'; end if;

  select receipt.result into result
  from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.user_id = caller_id
    and receipt.operation = 'planner.import';
  if found then return result; end if;

  if target_account_id is null then raise exception 'account id is required'; end if;
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) > 200 then
    raise exception 'categories must be an array with at most 200 rows';
  end if;
  if jsonb_typeof(p_income_types) <> 'array' or jsonb_array_length(p_income_types) > 100 then
    raise exception 'income types must be an array with at most 100 rows';
  end if;
  if jsonb_typeof(p_transactions) <> 'array' or jsonb_array_length(p_transactions) not between 1 and 1000 then
    raise exception 'transactions must contain between 1 and 1000 rows';
  end if;

  if create_account then
    if exists (select 1 from public.accounts account where account.id = target_account_id) then
      raise exception 'the import account already exists';
    end if;
    insert into public.accounts (
      id, user_id, name, account_type, initial_balance, color, icon,
      currency_code, expected_annual_return
    ) values (
      target_account_id,
      caller_id,
      trim(p_account ->> 'name'),
      p_account ->> 'account_type',
      (p_account ->> 'initial_balance')::numeric,
      lower(p_account ->> 'color'),
      coalesce(nullif(p_account ->> 'icon', ''), 'wallet'),
      upper(coalesce(nullif(p_account ->> 'currency_code', ''), 'COP')),
      nullif(p_account ->> 'expected_annual_return', '')::numeric
    );
  else
    if not exists (
      select 1 from public.accounts account
      where account.id = target_account_id and account.user_id = caller_id and account.archived = false
    ) then raise exception 'the selected account is not available'; end if;
    if reconcile_initial then
      update public.accounts account
      set initial_balance = (p_account ->> 'initial_balance')::numeric
      where account.id = target_account_id and account.user_id = caller_id and account.archived = false;
    end if;
  end if;

  for category in select value from jsonb_array_elements(p_categories)
  loop
    perform public.upsert_finance_category(
      (category ->> 'id')::uuid,
      category ->> 'name',
      category ->> 'group',
      category ->> 'color',
      category ->> 'icon'
    );
  end loop;

  for income_type in select value from jsonb_array_elements(p_income_types)
  loop
    perform public.upsert_income_type(
      (income_type ->> 'id')::uuid,
      income_type ->> 'name',
      income_type ->> 'color',
      income_type ->> 'icon'
    );
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(p_transactions) as row(account_id uuid, kind text)
    where row.account_id <> target_account_id or row.kind not in ('income', 'expense')
  ) then raise exception 'planner rows must be income or expense movements in the selected account'; end if;

  insert into public.transactions (
    id, user_id, account_id, category_id, kind, amount, transfer_group_id,
    description, merchant, note, icon, recurring_occurrence_id,
    financial_target_id, financial_target_effect, occurred_on,
    native_currency_code, base_currency_code, base_amount,
    exchange_rate, exchange_rate_date, exchange_rate_source
  )
  select
    row.id,
    caller_id,
    row.account_id,
    row.category_id,
    row.kind,
    row.amount,
    null,
    row.description,
    row.merchant,
    row.note,
    row.icon,
    null,
    null,
    null,
    row.occurred_on,
    row.native_currency_code,
    row.base_currency_code,
    row.base_amount,
    row.exchange_rate,
    row.exchange_rate_date,
    row.exchange_rate_source
  from jsonb_to_recordset(p_transactions) as row(
    id uuid,
    account_id uuid,
    category_id uuid,
    kind text,
    amount numeric,
    description text,
    merchant text,
    note text,
    icon text,
    occurred_on date,
    native_currency_code text,
    base_currency_code text,
    base_amount numeric,
    exchange_rate numeric,
    exchange_rate_date date,
    exchange_rate_source text
  )
  on conflict (id) do update set
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    kind = excluded.kind,
    amount = excluded.amount,
    description = excluded.description,
    merchant = excluded.merchant,
    note = excluded.note,
    icon = excluded.icon,
    occurred_on = excluded.occurred_on,
    native_currency_code = excluded.native_currency_code,
    base_currency_code = excluded.base_currency_code,
    base_amount = excluded.base_amount,
    exchange_rate = excluded.exchange_rate,
    exchange_rate_date = excluded.exchange_rate_date,
    exchange_rate_source = excluded.exchange_rate_source
  where public.transactions.user_id = caller_id;

  get diagnostics saved_count = row_count;
  if saved_count <> jsonb_array_length(p_transactions) then
    raise exception 'not every reviewed planner row could be saved';
  end if;
  result := jsonb_build_object(
    'account_id', target_account_id,
    'transaction_count', saved_count,
    'category_count', jsonb_array_length(p_categories),
    'income_type_count', jsonb_array_length(p_income_types),
    'reconciled', reconcile_initial
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'planner.import', result);
  return result;
end;
$$;

revoke all on function public.import_planner_v1(uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.import_planner_v1(uuid, jsonb, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.import_planner_v1(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Atomically confirms a reviewed monthly-planner import: optional account reconciliation, new classifications and ledger rows.';
