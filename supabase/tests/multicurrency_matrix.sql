-- Reversible integration matrix for the production COP ledger and COP/USD
-- accounts. It exercises real RPCs/triggers and always rolls back.

begin;

do $$
declare
  test_user uuid;
begin
  select auth_user.id into test_user
  from private.access_allowlist allowlist
  join auth.users auth_user on lower(auth_user.email) = lower(allowlist.email)
  where allowlist.enabled
  order by (allowlist.access_role = 'admin') desc, allowlist.created_at
  limit 1;
  if test_user is null then raise exception 'no enabled finance user is available for the multicurrency matrix'; end if;
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', test_user, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  test_user uuid := auth.uid();
  cop_a uuid := gen_random_uuid();
  cop_b uuid := gen_random_uuid();
  usd_a uuid := gen_random_uuid();
  usd_b uuid := gen_random_uuid();
  category_id uuid;
  operation_id uuid := gen_random_uuid();
  transfer_one uuid := gen_random_uuid();
  transfer_two uuid := gen_random_uuid();
  transfer_three uuid := gen_random_uuid();
  transfer_four uuid := gen_random_uuid();
  month_start_rule uuid := gen_random_uuid();
  month_start_schedule date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  saved integer;
  update_result jsonb;
begin
  select category.id into category_id
  from public.categories category
  where category.user_id = test_user and category.transaction_kind = 'expense' and not category.archived
  order by category.created_at limit 1;
  if category_id is null then raise exception 'the matrix user needs one expense category'; end if;

  insert into public.accounts (id, user_id, name, account_type, initial_balance, color, icon, currency_code, opening_exchange_rate)
  values
    (cop_a, test_user, '__matrix_cop_a__', 'checking', 0, '#111111', 'wallet', 'COP', 1),
    (cop_b, test_user, '__matrix_cop_b__', 'savings', 0, '#222222', 'wallet', 'COP', 1),
    (usd_a, test_user, '__matrix_usd_a__', 'checking', 0, '#333333', 'wallet', 'USD', 4000),
    (usd_b, test_user, '__matrix_usd_b__', 'savings', 0, '#444444', 'wallet', 'USD', 4000);

  saved := public.upsert_transactions_v3(operation_id, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_a, 'category_id', category_id, 'kind', 'expense', 'amount', 125000, 'description', '__matrix_cop_expense__', 'occurred_on', current_date, 'native_currency_code', 'COP', 'base_currency_code', 'COP', 'exchange_rate', 1, 'exchange_rate_source', 'same_currency'),
    jsonb_build_object('id', gen_random_uuid(), 'account_id', usd_a, 'category_id', category_id, 'kind', 'expense', 'amount', 25.50, 'description', '__matrix_usd_expense__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 4100, 'exchange_rate_source', 'provider'),

    jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_a, 'kind', 'transfer_out', 'amount', 100000, 'transfer_group_id', transfer_one, 'description', '__matrix_cop_usd__', 'occurred_on', current_date, 'native_currency_code', 'COP', 'base_currency_code', 'COP', 'exchange_rate', 1, 'exchange_rate_source', 'same_currency'),
    jsonb_build_object('id', gen_random_uuid(), 'account_id', usd_a, 'kind', 'transfer_in', 'amount', 24.39, 'transfer_group_id', transfer_one, 'description', '__matrix_cop_usd__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 100000::numeric / 24.39, 'exchange_rate_source', 'manual'),

    jsonb_build_object('id', gen_random_uuid(), 'account_id', usd_a, 'kind', 'transfer_out', 'amount', 24.39, 'transfer_group_id', transfer_two, 'description', '__matrix_usd_cop__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 99950::numeric / 24.39, 'exchange_rate_source', 'manual'),
    jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_b, 'kind', 'transfer_in', 'amount', 99950, 'transfer_group_id', transfer_two, 'description', '__matrix_usd_cop__', 'occurred_on', current_date, 'native_currency_code', 'COP', 'base_currency_code', 'COP', 'exchange_rate', 1, 'exchange_rate_source', 'same_currency'),

    jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_a, 'kind', 'transfer_out', 'amount', 80000, 'transfer_group_id', transfer_three, 'description', '__matrix_cop_cop__', 'occurred_on', current_date, 'native_currency_code', 'COP', 'base_currency_code', 'COP', 'exchange_rate', 1, 'exchange_rate_source', 'same_currency'),
    jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_b, 'kind', 'transfer_in', 'amount', 80000, 'transfer_group_id', transfer_three, 'description', '__matrix_cop_cop__', 'occurred_on', current_date, 'native_currency_code', 'COP', 'base_currency_code', 'COP', 'exchange_rate', 1, 'exchange_rate_source', 'same_currency'),

    jsonb_build_object('id', gen_random_uuid(), 'account_id', usd_a, 'kind', 'transfer_out', 'amount', 30, 'transfer_group_id', transfer_four, 'description', '__matrix_usd_usd__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 4087.5, 'exchange_rate_source', 'provider'),
    jsonb_build_object('id', gen_random_uuid(), 'account_id', usd_b, 'kind', 'transfer_in', 'amount', 30, 'transfer_group_id', transfer_four, 'description', '__matrix_usd_usd__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 4087.5, 'exchange_rate_source', 'provider')
  ));
  if saved <> 10 then raise exception 'expected 10 postings, got %', saved; end if;
  if public.upsert_transactions_v3(operation_id, '[]'::jsonb) <> 10 then
    raise exception 'multicurrency idempotent replay failed';
  end if;

  if exists (
    select 1 from public.transactions movement
    where movement.user_id = test_user and movement.description like '__matrix_%'
      and (movement.native_currency_code <> (select account.currency_code from public.accounts account where account.id = movement.account_id)
        or movement.base_currency_code <> 'COP'
        or movement.base_amount <> round(movement.amount * movement.exchange_rate, 8))
  ) then raise exception 'a posting escaped the authoritative money snapshot'; end if;

  begin
    perform public.upsert_transactions_v3(gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'account_id', cop_a, 'category_id', category_id, 'kind', 'expense', 'amount', 1, 'description', '__matrix_invalid_currency__', 'occurred_on', current_date, 'native_currency_code', 'USD', 'base_currency_code', 'COP', 'exchange_rate', 1)
    ));
    raise exception 'a forged native currency was accepted';
  exception when others then
    if sqlerrm = 'a forged native currency was accepted' then raise; end if;
    if position('movement currency must match its account' in sqlerrm) = 0 then raise; end if;
  end;

  update_result := public.update_account_v3(
    gen_random_uuid(),
    jsonb_build_object('id', cop_a, 'name', '__matrix_cop_a_renamed__', 'account_type', 'checking', 'color', '#111111', 'icon', 'wallet', 'currency_code', 'USD', 'expected_annual_return', '', 'entity_id', ''),
    1, null, current_date, 4100, null, null
  );
  if update_result->>'currencyCode' <> 'COP' or coalesce((update_result->>'currencyPreserved')::boolean, false) is not true then
    raise exception 'legacy queued account update did not preserve COP';
  end if;

  update public.profiles set currency_code = 'USD' where id = test_user;
  if (select currency_code from public.profiles where id = test_user) <> 'COP' then
    raise exception 'legacy profile update changed the reporting currency';
  end if;

  insert into public.recurring_rules (
    id, user_id, account_id, category_id, kind, amount, description, cadence,
    interval_count, next_run_on, active, starts_on, ends_on, anchor_day,
    posting_policy, timezone, auto_post, include_in_budget, include_in_income_target,
    status, exchange_rate, exchange_rate_date, exchange_rate_source
  ) values (
    gen_random_uuid(), test_user, usd_a, category_id, 'expense', 25, '__matrix_recurring_usd_expense__', 'monthly',
    1, current_date, true, current_date, current_date, extract(day from current_date)::smallint,
    'scheduled_date', 'America/Bogota', true, true, false, 'active', 4100, current_date, 'provider'
  );

  insert into public.recurring_rules (
    id, user_id, account_id, destination_account_id, kind, amount, destination_amount,
    description, cadence, interval_count, next_run_on, active, starts_on, ends_on,
    anchor_day, posting_policy, timezone, auto_post, include_in_budget,
    include_in_income_target, status, exchange_rate, exchange_rate_date, exchange_rate_source
  ) values
    (gen_random_uuid(), test_user, cop_a, usd_a, 'transfer', 100000, 24.39, '__matrix_recurring_cop_usd__', 'monthly', 1, current_date, true, current_date, current_date, extract(day from current_date)::smallint, 'scheduled_date', 'America/Bogota', true, false, false, 'active', 4100, current_date, 'provider'),
    (gen_random_uuid(), test_user, usd_a, cop_b, 'transfer', 24.39, 99950, '__matrix_recurring_usd_cop__', 'monthly', 1, current_date, true, current_date, current_date, extract(day from current_date)::smallint, 'scheduled_date', 'America/Bogota', true, false, false, 'active', 4100, current_date, 'provider');

  insert into public.recurring_rules (
    id, user_id, account_id, category_id, kind, amount, description, cadence,
    interval_count, next_run_on, active, starts_on, ends_on, anchor_day,
    posting_policy, timezone, auto_post, include_in_budget, include_in_income_target,
    status, exchange_rate, exchange_rate_date, exchange_rate_source
  ) values (
    month_start_rule, test_user, cop_a, category_id, 'expense', 50000,
    '__matrix_month_start_expense__', 'monthly', 1, date_trunc('month', current_date)::date,
    true, month_start_schedule, month_start_schedule, extract(day from month_start_schedule)::smallint,
    'month_start', 'America/Bogota', true, false, false, 'active', 1, current_date,
    'same_currency'
  );
end;
$$;

reset role;

select private.process_due_recurring_occurrences(1000);
set constraints transactions_transfer_group_v2_check immediate;

do $$
declare
  test_user uuid := auth.uid();
begin
  if (select count(*) from public.recurring_occurrences where user_id = test_user and description like '__matrix_recurring_%' and status = 'posted') <> 3 then
    raise exception 'not every multicurrency recurrence posted successfully';
  end if;
  if not exists (
    select 1
    from public.transactions movement
    join public.recurring_occurrences occurrence
      on occurrence.user_id = movement.user_id and occurrence.id = movement.recurring_occurrence_id
    where movement.user_id = test_user
      and movement.description = '__matrix_month_start_expense__'
      and occurrence.effective_on = date_trunc('month', current_date)::date
      and occurrence.scheduled_on > occurrence.effective_on
      and movement.occurred_on = occurrence.scheduled_on
  ) then
    raise exception 'month-start publication changed the assigned movement date';
  end if;
  if exists (
    select 1 from public.transactions movement
    where movement.user_id = test_user and movement.description like '__matrix_recurring_%'
      and (movement.base_currency_code <> 'COP' or movement.base_amount <> round(movement.amount * movement.exchange_rate, 8))
  ) then raise exception 'a recurring posting escaped the money snapshot'; end if;
  if exists (
    select 1 from public.transactions movement
    where movement.user_id = test_user and movement.transfer_group_id is not null and movement.description like '__matrix_%'
    group by movement.transfer_group_id
    having count(*) <> 2
      or count(*) filter (where movement.kind = 'transfer_out') <> 1
      or count(*) filter (where movement.kind = 'transfer_in') <> 1
      or min(movement.base_amount) <> max(movement.base_amount)
  ) then raise exception 'a multicurrency transfer is not balanced'; end if;
  if not exists (
    select 1 from public.transactions movement
    where movement.user_id = test_user and movement.description = '__matrix_recurring_usd_expense__'
      and movement.amount = 25 and movement.base_amount = 102500 and movement.exchange_rate = 4100
  ) then raise exception 'the recurring USD expense was not converted to COP'; end if;
end;
$$;

rollback;
