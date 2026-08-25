-- Transactional smoke test for the finance v2 foundations.
-- Run after migrations; it leaves no rows behind.

begin;

do $$
declare
  test_user uuid;
begin
  select auth_user.id
  into test_user
  from private.access_allowlist allowlist
  join auth.users auth_user on lower(auth_user.email) = lower(allowlist.email)
  where allowlist.enabled = true
  order by (allowlist.access_role = 'admin') desc, allowlist.created_at
  limit 1;

  if test_user is null then raise exception 'no enabled finance user is available for the smoke test'; end if;
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;

do $$
declare
  test_user uuid := (select auth.uid());
  source_account uuid;
  destination_account uuid := gen_random_uuid();
  expense_category uuid;
  expense_transaction uuid := gen_random_uuid();
  transfer_group uuid := gen_random_uuid();
  transfer_out uuid := gen_random_uuid();
  transfer_in uuid := gen_random_uuid();
  test_target_id uuid := gen_random_uuid();
  expense_operation uuid := gen_random_uuid();
  transfer_operation uuid := gen_random_uuid();
  target_operation uuid := gen_random_uuid();
  saved integer;
begin
  select account.id into source_account
  from public.accounts account
  where account.user_id = test_user and account.archived = false
  order by account.created_at
  limit 1;

  select category.id into expense_category
  from public.categories category
  where category.user_id = test_user
    and category.transaction_kind = 'expense'
    and category.archived = false
  order by category.created_at
  limit 1;

  if source_account is null or expense_category is null then
    raise exception 'the smoke user needs an account and an expense category';
  end if;

  insert into public.accounts (
    id, user_id, name, account_type, initial_balance, color, icon, currency_code
  ) values (
    destination_account, test_user, 'V2 smoke USD', 'savings', 0, '#3455db', 'wallet', 'USD'
  );

  saved := public.upsert_transactions_v2(
    expense_operation,
    jsonb_build_array(jsonb_build_object(
      'id', expense_transaction,
      'account_id', source_account,
      'category_id', expense_category,
      'kind', 'expense',
      'amount', 12345,
      'description', 'V2 atomic expense',
      'occurred_on', current_date
    ))
  );
  if saved <> 1 then raise exception 'expected one saved expense, got %', saved; end if;
  if public.upsert_transactions_v2(expense_operation, '[]'::jsonb) <> 1 then
    raise exception 'idempotent replay did not return the prior result';
  end if;

  saved := public.upsert_transactions_v2(
    transfer_operation,
    jsonb_build_array(
      jsonb_build_object(
        'id', transfer_out,
        'account_id', source_account,
        'kind', 'transfer_out',
        'amount', 4000,
        'transfer_group_id', transfer_group,
        'description', 'V2 FX transfer',
        'occurred_on', current_date,
        'native_currency_code', 'COP',
        'base_currency_code', 'COP',
        'base_amount', 4000,
        'exchange_rate', 1,
        'exchange_rate_date', current_date,
        'exchange_rate_source', 'same_currency'
      ),
      jsonb_build_object(
        'id', transfer_in,
        'account_id', destination_account,
        'kind', 'transfer_in',
        'amount', 1,
        'transfer_group_id', transfer_group,
        'description', 'V2 FX transfer',
        'occurred_on', current_date,
        'native_currency_code', 'USD',
        'base_currency_code', 'COP',
        'base_amount', 4000,
        'exchange_rate', 4000,
        'exchange_rate_date', current_date,
        'exchange_rate_source', 'manual'
      )
    )
  );
  if saved <> 2 then raise exception 'expected two transfer postings, got %', saved; end if;

  if public.upsert_financial_target_v2(
    target_operation,
    jsonb_build_object(
      'id', test_target_id,
      'mode', 'pay_down',
      'kind', 'debt',
      'status', 'active',
      'title', 'V2 atomic debt',
      'target_amount', 100000,
      'initial_progress', 0,
      'starts_on', current_date,
      'priority', 3,
      'color', '#3455db',
      'icon', 'target',
      'tracking_mode', 'manual'
    ),
    jsonb_build_object(
      'creditor', 'Smoke creditor',
      'annual_interest_rate', 12.5,
      'minimum_payment', 5000,
      'due_day', 15
    )
  ) <> test_target_id then
    raise exception 'atomic target did not return its id';
  end if;

  if not exists (
    select 1 from public.financial_target_debt_details detail
    where detail.user_id = test_user and detail.target_id = test_target_id
  ) then raise exception 'atomic debt detail was not created'; end if;

  if not exists (
    select 1 from public.audit_events event
    where event.user_id = test_user and event.entity_id in (expense_transaction, test_target_id)
  ) then raise exception 'finance audit events were not captured'; end if;
end;
$$;

set constraints transactions_transfer_group_v2_check immediate;

do $$
declare
  test_user uuid := (select auth.uid());
begin
  if exists (
    select 1
    from public.transactions transaction
    where transaction.user_id = test_user
      and transaction.kind in ('transfer_in', 'transfer_out')
    group by transaction.transfer_group_id
    having count(*) <> 2
      or count(*) filter (where transaction.kind = 'transfer_in') <> 1
      or count(*) filter (where transaction.kind = 'transfer_out') <> 1
      or max(transaction.base_amount) <> min(transaction.base_amount)
  ) then raise exception 'transfer ledger invariant failed'; end if;
end;
$$;

-- A signed-in identity outside the allowlist must see no tenant rows and cannot
-- call the financial reporting boundary. This uses no permanent auth row.
do $$
declare
  unauthorized_user uuid := gen_random_uuid();
  visible_accounts integer;
begin
  perform set_config('request.jwt.claim.sub', unauthorized_user::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', unauthorized_user, 'role', 'authenticated')::text,
    true
  );

  select count(*) into visible_accounts from public.accounts;
  if visible_accounts <> 0 then
    raise exception 'an unauthorized identity could read % account rows', visible_accounts;
  end if;

  begin
    perform public.get_finance_snapshot(date_trunc('month', current_date)::date);
    raise exception 'an unauthorized identity reached the reporting RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

rollback;
