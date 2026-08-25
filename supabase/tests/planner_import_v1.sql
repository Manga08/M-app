-- Transactional smoke test for the reviewed XLSX import boundary.
begin;

do $$
declare
  test_user uuid;
begin
  select auth_user.id into test_user
  from private.access_allowlist allowlist
  join auth.users auth_user on lower(auth_user.email) = lower(allowlist.email)
  where allowlist.enabled = true
  order by (allowlist.access_role = 'admin') desc, allowlist.created_at
  limit 1;
  if test_user is null then raise exception 'no enabled finance user is available for the smoke test'; end if;
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', test_user, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  test_user uuid := (select auth.uid());
  operation_id uuid := gen_random_uuid();
  existing_operation_id uuid := gen_random_uuid();
  test_account_id uuid := gen_random_uuid();
  expense_category_id uuid := gen_random_uuid();
  income_type_id uuid := gen_random_uuid();
  expense_id uuid := gen_random_uuid();
  income_id uuid := gen_random_uuid();
  existing_expense_id uuid := gen_random_uuid();
  group_key text;
  group_color text;
  group_icon text;
  result jsonb;
  existing_result jsonb;
  calculated_balance numeric;
  transaction_count integer;
begin
  select allocation.group_key, allocation.color, allocation.icon
  into group_key, group_color, group_icon
  from public.group_allocations allocation
  where allocation.user_id = test_user and allocation.archived = false
  order by allocation.sort_order
  limit 1;
  if group_key is null then raise exception 'the smoke user needs an active finance group'; end if;

  result := public.import_planner_v1(
    operation_id,
    jsonb_build_object(
      'id', test_account_id,
      'create_account', true,
      'reconcile_initial_balance', true,
      'name', 'Planner import smoke',
      'account_type', 'cash',
      'initial_balance', 659915,
      'color', '#3455db',
      'icon', 'wallet',
      'currency_code', 'COP'
    ),
    jsonb_build_array(jsonb_build_object(
      'id', expense_category_id,
      'name', 'Planner expense smoke',
      'group', group_key,
      'color', group_color,
      'icon', group_icon
    )),
    jsonb_build_array(jsonb_build_object(
      'id', income_type_id,
      'name', 'Planner income smoke',
      'color', '#38d39f',
      'icon', 'coins'
    )),
    jsonb_build_array(
      jsonb_build_object(
        'id', expense_id,
        'account_id', test_account_id,
        'category_id', expense_category_id,
        'kind', 'expense',
        'amount', 915298,
        'description', 'Planner expense smoke',
        'occurred_on', current_date
      ),
      jsonb_build_object(
        'id', income_id,
        'account_id', test_account_id,
        'category_id', income_type_id,
        'kind', 'income',
        'amount', 900000,
        'description', 'Planner income smoke',
        'occurred_on', current_date
      )
    )
  );

  if (result ->> 'transaction_count')::integer <> 2 then
    raise exception 'expected two imported movements, got %', result;
  end if;
  select account.initial_balance
    + coalesce(sum(case when transaction.kind = 'income' then transaction.amount else -transaction.amount end), 0)
  into calculated_balance
  from public.accounts account
  left join public.transactions transaction
    on transaction.user_id = account.user_id and transaction.account_id = account.id
  where account.user_id = test_user and account.id = test_account_id
  group by account.initial_balance;
  if calculated_balance <> 644617 then
    raise exception 'reconciled account balance should be 644617, got %', calculated_balance;
  end if;

  existing_result := public.import_planner_v1(
    existing_operation_id,
    jsonb_build_object(
      'id', test_account_id,
      'create_account', false,
      'reconcile_initial_balance', true,
      'name', 'Planner import smoke',
      'account_type', 'cash',
      'initial_balance', 559915,
      'color', '#3455db',
      'icon', 'wallet',
      'currency_code', 'COP'
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', existing_expense_id,
      'account_id', test_account_id,
      'category_id', expense_category_id,
      'kind', 'expense',
      'amount', 44617,
      'description', 'Existing account reconciliation smoke',
      'occurred_on', current_date
    ))
  );
  if (existing_result ->> 'transaction_count')::integer <> 1 then
    raise exception 'expected one additional imported movement, got %', existing_result;
  end if;
  select account.initial_balance
      + coalesce(sum(case when transaction.kind = 'income' then transaction.amount else -transaction.amount end), 0),
    count(transaction.id)
  into calculated_balance, transaction_count
  from public.accounts account
  left join public.transactions transaction
    on transaction.user_id = account.user_id and transaction.account_id = account.id
  where account.user_id = test_user and account.id = test_account_id
  group by account.initial_balance;
  if calculated_balance <> 500000 or transaction_count <> 3 then
    raise exception 'existing account reconciliation should preserve three rows and end at 500000, got % across % rows', calculated_balance, transaction_count;
  end if;
  if public.import_planner_v1(operation_id, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb) <> result then
    raise exception 'planner import replay did not return the prior receipt';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.import_planner_v1(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute') then
    raise exception 'anon must not execute planner imports';
  end if;
end;
$$;

rollback;
