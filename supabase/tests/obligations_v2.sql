-- Reversible integration contract for the unified obligations engine.
-- It uses one enabled user, exercises real RLS/RPC/ledger triggers, verifies
-- idempotency and rolls every row back.

begin;

do $$
declare
  first_user uuid;
  second_user uuid;
begin
  select auth_user.id into first_user
  from private.access_allowlist allowlist
  join auth.users auth_user on lower(auth_user.email) = lower(allowlist.email)
  where allowlist.enabled
  order by (allowlist.access_role = 'admin') desc, allowlist.created_at
  limit 1;
  if first_user is null then raise exception 'no enabled finance user is available for obligations tests'; end if;
  select auth_user.id into second_user
  from private.access_allowlist allowlist
  join auth.users auth_user on lower(auth_user.email) = lower(allowlist.email)
  where allowlist.enabled and auth_user.id <> first_user
  order by allowlist.created_at limit 1;
  perform set_config('moneva.test_first_user', first_user::text, true);
  perform set_config('moneva.test_second_user', coalesce(second_user::text, ''), true);
  perform set_config('request.jwt.claim.sub', first_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_user, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;

do $$
declare
  test_user uuid := auth.uid();
  liability_account uuid := gen_random_uuid();
  funding_account uuid := gen_random_uuid();
  invalid_account uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  terms_operation uuid := gen_random_uuid();
  obligation_operation uuid := gen_random_uuid();
  payment_operation uuid := gen_random_uuid();
  second_payment_operation uuid := gen_random_uuid();
  term_id uuid := gen_random_uuid();
  versioned_term_id uuid := gen_random_uuid();
  rate_id uuid := gen_random_uuid();
  obligation_id uuid := gen_random_uuid();
  debt_target_id uuid := gen_random_uuid();
  scheduled_obligation_id uuid := gen_random_uuid();
  split_obligation_id uuid := gen_random_uuid();
  split_payment_operation uuid := gen_random_uuid();
  target_intent_id uuid := gen_random_uuid();
  target_recurring_rule_id uuid := gen_random_uuid();
  future_movement_id uuid := gen_random_uuid();
  future_transfer_group uuid := gen_random_uuid();
  target_liability_account uuid;
  target_rule_id uuid;
  target_rule_version bigint;
  target_account_version bigint;
  target_liability_version bigint;
  balance_before numeric;
  balance_after numeric;
  payment_result jsonb;
  liability_result jsonb;
  lifecycle_result jsonb;
  overview jsonb;
  drawdown_group uuid := gen_random_uuid();
begin
  insert into public.accounts (
    id, user_id, name, account_type, initial_balance, color, icon,
    currency_code, opening_balance_date, opening_exchange_rate
  ) values
    (funding_account, test_user, '__obligation_funding__', 'checking', 1000, '#112233', 'wallet', 'COP', current_date, 1),
    (invalid_account, test_user, '__obligation_invalid__', 'checking', 0, '#223344', 'wallet', 'COP', current_date, 1);

  liability_result := public.upsert_liability_v2(
    operation_id,
    jsonb_build_object(
      'id', liability_account, 'name', '__obligation_test__',
      'opening_debt', 500, 'color', '#334455', 'icon', 'landmark',
      'currency_code', 'COP', 'opening_balance_date', current_date,
      'opening_exchange_rate', 1
    ),
    jsonb_build_object(
      'account_id', liability_account, 'kind', 'personal_debt',
      'status', 'active', 'creditor_name', '__test_creditor__',
      'original_principal', 500, 'originated_on', current_date
    )
  );
  if liability_result->>'accountId' <> liability_account::text then
    raise exception 'liability upsert returned another account';
  end if;
  if public.upsert_liability_v2(operation_id, '{}'::jsonb, '{}'::jsonb) <> liability_result then
    raise exception 'liability idempotent replay changed its result';
  end if;
  if (select count(*) from public.accounts where user_id = test_user and id = liability_account) <> 1
     or (select count(*) from public.liabilities where user_id = test_user and account_id = liability_account) <> 1 then
    raise exception 'liability upsert duplicated its source account';
  end if;

  begin
    update public.accounts
    set initial_balance = initial_balance - 1
    where user_id = test_user and id = liability_account;
    raise exception 'direct liability balance edit was accepted';
  exception when others then
    if sqlerrm = 'direct liability balance edit was accepted' then raise; end if;
    if position('dedicated flow' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    update public.accounts
    set archived = true, archived_at = now()
    where user_id = test_user and id = liability_account;
    raise exception 'direct liability archive was accepted';
  exception when others then
    if sqlerrm = 'direct liability archive was accepted' then raise; end if;
    if position('dedicated flow' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.accounts
    where user_id = test_user and id = liability_account;
    raise exception 'direct liability deletion was accepted';
  exception when others then
    if sqlerrm = 'direct liability deletion was accepted' then raise; end if;
    if position('archive them instead' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    insert into public.accounts (
      id, user_id, name, account_type, initial_balance, color, icon,
      currency_code, opening_balance_date, opening_exchange_rate
    ) values (
      gen_random_uuid(), test_user, '__orphan_credit__', 'credit', -10,
      '#000000', 'credit-card', 'COP', current_date, 1
    );
    raise exception 'direct orphan credit account was accepted';
  exception when others then
    if sqlerrm = 'direct orphan credit account was accepted' then raise; end if;
    if position('card or debt flow' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    insert into public.transactions (
      id, user_id, account_id, kind, amount, description, occurred_on,
      native_currency_code, base_currency_code, base_amount, exchange_rate,
      exchange_rate_date, exchange_rate_source
    ) values (
      gen_random_uuid(), test_user, liability_account, 'adjustment_out', 1,
      '__generic_liability_adjustment__', current_date,
      'COP', 'COP', 1, 1, current_date, 'same_currency'
    );
    set constraints liability_transactions_require_metadata_v2 immediate;
    raise exception 'generic liability posting was accepted';
  exception when others then
    if sqlerrm = 'generic liability posting was accepted' then raise; end if;
    if position('dedicated flow' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.upsert_liability_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', liability_account, 'name', '__obligation_test__',
        'opening_debt', 500, 'color', '#334455', 'icon', 'landmark',
        'currency_code', 'COP', 'opening_balance_date', current_date,
        'opening_exchange_rate', 1
      ),
      jsonb_build_object(
        'account_id', liability_account, 'kind', 'personal_debt',
        'status', 'settled', 'creditor_name', '__test_creditor__',
        'original_principal', 500, 'originated_on', current_date
      ),
      (liability_result->>'accountVersion')::bigint,
      (liability_result->>'liabilityVersion')::bigint
    );
    raise exception 'generic upsert changed the liability lifecycle';
  exception when others then
    if sqlerrm = 'generic upsert changed the liability lifecycle' then raise; end if;
    if position('lifecycle action' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.upsert_liability_terms_v2(
    terms_operation,
    jsonb_build_object(
      'id', term_id, 'account_id', liability_account, 'starts_on', current_date,
      'payment_frequency', 'monthly', 'calculation_method', 'amortized',
      'amortization_method', 'constant_payment', 'first_due_on', current_date + 30,
      'installment_count', 1, 'scheduled_payment', 200,
      'variable_rate', false, 'prepayment_strategy', 'reduce_term'
    ),
    jsonb_build_array(jsonb_build_object(
      'id', rate_id, 'rate_kind', 'principal', 'rate_basis', 'effective_annual',
      'reported_value', 0, 'effective_annual_rate', 0,
      'starts_on', current_date, 'source', 'manual'
    ))
  );
  if not exists (
    select 1 from public.liability_rate_periods
    where user_id = test_user and id = rate_id and reported_value = 0
  ) then raise exception 'zero-interest method/rate was not preserved'; end if;

  perform public.upsert_liability_obligation_v2(
    obligation_operation,
    jsonb_build_object(
      'id', obligation_id, 'account_id', liability_account,
      'kind', 'loan_installment', 'sequence_number', 1,
      'due_on', current_date + 30, 'principal_due', 200,
      'interest_due', 0, 'fee_due', 0, 'minimum_due', 200,
      'total_due', 200, 'status', 'open', 'source', 'contract'
    )
  );

  payment_result := public.record_liability_payment_v2(
    payment_operation,
    jsonb_build_object(
      'liability_account_id', liability_account,
      'funding_account_id', funding_account,
      'liability_amount', 100, 'funding_amount', 100,
      'occurred_on', current_date, 'description', '__obligation_payment__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'obligation_id', obligation_id, 'amount', 100, 'allocated_on', current_date
    ))
  );
  if public.record_liability_payment_v2(payment_operation, '{}'::jsonb, '[]'::jsonb) <> payment_result then
    raise exception 'payment idempotent replay changed its result';
  end if;
  if (select count(*) from public.transactions where user_id = test_user and transfer_group_id = payment_operation) <> 2 then
    raise exception 'liability payment did not create exactly two ledger postings';
  end if;
  if (select count(*) from public.ledger_events where user_id = test_user and id = payment_operation) <> 1 then
    raise exception 'liability payment duplicated its ledger event';
  end if;
  if (select status from public.liability_obligations where user_id = test_user and id = obligation_id) <> 'partial' then
    raise exception 'partially allocated obligation did not remain partial';
  end if;
  perform public.record_liability_payment_v2(
    second_payment_operation,
    jsonb_build_object(
      'liability_account_id', liability_account,
      'funding_account_id', funding_account,
      'liability_amount', 100, 'funding_amount', 100,
      'occurred_on', current_date, 'description', '__obligation_payment_two__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'obligation_id', obligation_id, 'amount', 100, 'allocated_on', current_date
    ))
  );
  if (
    select account.initial_balance + coalesce(sum(
      case when movement.kind in ('income', 'transfer_in', 'adjustment_in')
        then movement.amount else -movement.amount end
    ), 0)
    from public.accounts account
    left join public.transactions movement
      on movement.user_id = account.user_id and movement.account_id = account.id
      and movement.occurred_on <= current_date
    where account.user_id = test_user and account.id = liability_account
    group by account.initial_balance
  ) <> -300 then
    raise exception 'liability debt is not derived from its account ledger';
  end if;
  if (select status from public.liability_obligations where user_id = test_user and id = obligation_id) <> 'paid' then
    raise exception 'fully allocated obligation was not marked paid';
  end if;

  -- A payment is not all principal. For a 100 installment made of 80
  -- principal, 15 interest and 5 fees, charge postings first increase the
  -- liability by 20 and the transfer then lowers it by 100: net principal is
  -- exactly 80. This also protects reports from silently losing real expenses.
  perform public.upsert_liability_obligation_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', split_obligation_id, 'account_id', liability_account,
      'kind', 'loan_installment', 'sequence_number', 2,
      'due_on', current_date, 'principal_due', 80,
      'interest_due', 15, 'fee_due', 5, 'minimum_due', 100,
      'total_due', 100, 'status', 'due', 'source', 'contract'
    )
  );
  select account.initial_balance + coalesce(sum(
    case when movement.kind in ('income', 'transfer_in', 'adjustment_in')
      then movement.amount else -movement.amount end
  ), 0)
  into balance_before
  from public.accounts account
  left join public.transactions movement
    on movement.user_id = account.user_id and movement.account_id = account.id
      and movement.occurred_on <= current_date
  where account.user_id = test_user and account.id = liability_account
  group by account.initial_balance;

  payment_result := public.record_liability_payment_v2(
    split_payment_operation,
    jsonb_build_object(
      'liability_account_id', liability_account,
      'funding_account_id', funding_account,
      'liability_amount', 100, 'funding_amount', 100,
      'occurred_on', current_date, 'description', '__obligation_split_payment__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'obligation_id', split_obligation_id, 'amount', 100,
      'allocated_on', current_date
    ))
  );
  select account.initial_balance + coalesce(sum(
    case when movement.kind in ('income', 'transfer_in', 'adjustment_in')
      then movement.amount else -movement.amount end
  ), 0)
  into balance_after
  from public.accounts account
  left join public.transactions movement
    on movement.user_id = account.user_id and movement.account_id = account.id
      and movement.occurred_on <= current_date
  where account.user_id = test_user and account.id = liability_account
  group by account.initial_balance;

  if balance_after - balance_before <> 80 then
    raise exception 'interest/fee split changed principal by %, expected 80', balance_after - balance_before;
  end if;
  if (payment_result->>'interestAmount')::numeric <> 15
     or (payment_result->>'feeAmount')::numeric <> 5 then
    raise exception 'payment result omitted the 15/5 charge split';
  end if;
  if (
    select count(*)
    from public.liability_event_metadata metadata
    join public.transactions movement
      on movement.user_id = metadata.user_id
     and movement.ledger_event_id = metadata.ledger_event_id
    where metadata.user_id = test_user
      and metadata.account_id = liability_account
      and metadata.role in ('interest', 'fee')
      and movement.kind = 'expense'
      and movement.id in (
        (payment_result->>'interestTransactionId')::uuid,
        (payment_result->>'feeTransactionId')::uuid
      )
  ) <> 2 then
    raise exception 'interest and fee were not persisted as two auditable expenses';
  end if;

  perform public.upsert_financial_target_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
      'title', '__legacy_funding_debt__', 'description', null,
      'target_amount', 500, 'initial_progress', 0, 'starts_on', current_date,
      'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
      'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
      'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
    ),
    jsonb_build_object(
      'creditor', '__legacy_creditor__', 'principal', 500,
      'funding_account_id', funding_account,
      'annual_interest_rate', 12.5, 'calculation_method', 'amortized',
      'amortization_method', 'constant_payment', 'payment_frequency', 'monthly',
      'schedule', jsonb_build_array(jsonb_build_object(
        'id', scheduled_obligation_id, 'sequence_number', 1,
        'due_on', current_date + 30, 'principal_due', 500,
        'interest_due', 0, 'fee_due', 0, 'minimum_due', 500,
        'total_due', 500, 'status', 'projected'
      ))
    )
  );
  select detail.migrated_liability_account_id into target_liability_account
  from public.financial_target_debt_details detail
  where detail.user_id = test_user and detail.target_id = debt_target_id;
  if target_liability_account is null or target_liability_account = invalid_account then
    raise exception 'legacy funding account was reused as a liability';
  end if;
  if (select account_id from public.financial_targets where user_id = test_user and id = debt_target_id)
      <> invalid_account then
    raise exception 'legacy funding account link was overwritten';
  end if;
  if not exists (
    select 1 from public.liability_rate_periods rate
    where rate.user_id = test_user and rate.account_id = target_liability_account
      and rate.rate_kind = 'principal' and rate.reported_value = 12.5
  ) then raise exception 'legacy annual interest was not synchronized'; end if;
  if not exists (
    select 1 from public.liability_obligations obligation
    where obligation.user_id = test_user and obligation.id = scheduled_obligation_id
  ) then raise exception 'calculated debt schedule was not synchronized'; end if;
  select rule.id into target_rule_id
  from public.liability_payment_rules rule
  where rule.user_id = test_user and rule.account_id = target_liability_account
    and rule.funding_account_id = funding_account and not rule.active
    and rule.recording_mode = 'manual' and rule.detached_at is null;
  if target_rule_id is null then
    raise exception 'target funding account was not persisted as a safe payment rule';
  end if;

  -- Opening stock and currency belong to the ledger. Editing the target may
  -- replan future installments, but must never rewrite either value.
  begin
    perform public.upsert_financial_target_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
        'title', '__legacy_funding_debt__', 'description', null,
        'target_amount', 500, 'initial_progress', 0, 'starts_on', current_date,
        'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
        'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
        'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
      ),
      jsonb_build_object(
        'liability_account_id', target_liability_account,
        'creditor', '__legacy_creditor__', 'principal', 500,
        'currency_code', 'USD'
      )
    );
    raise exception 'an existing COP debt changed to USD';
  exception when others then
    if sqlerrm = 'an existing COP debt changed to USD' then raise; end if;
    if position('existing debt currency cannot change' in sqlerrm) = 0 then raise; end if;
  end;
  if (select currency_code from public.accounts where user_id = test_user and id = target_liability_account) <> 'COP' then
    raise exception 'rejected currency edit still changed the liability account';
  end if;

  begin
    perform public.upsert_financial_target_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
        'title', '__legacy_funding_debt__', 'description', null,
        'target_amount', 500, 'initial_progress', 0, 'starts_on', current_date,
        'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
        'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
        'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
      ),
      jsonb_build_object(
        'liability_account_id', target_liability_account,
        'creditor', '__legacy_creditor__', 'principal', 700,
        'currency_code', 'COP'
      )
    );
    raise exception 'an existing debt principal changed without a ledger event';
  exception when others then
    if sqlerrm = 'an existing debt principal changed without a ledger event' then raise; end if;
    if position('existing debt balance cannot be edited' in sqlerrm) = 0 then raise; end if;
  end;
  if (select initial_balance from public.accounts where user_id = test_user and id = target_liability_account) <> -500
     or (select original_principal from public.liabilities where user_id = test_user and account_id = target_liability_account) <> 500
     or (select target_amount from public.financial_targets where user_id = test_user and id = debt_target_id) <> 500 then
    raise exception 'rejected principal edit changed target, original principal or ledger stock';
  end if;

  begin
    perform public.upsert_financial_target_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
        'title', '__legacy_funding_debt__', 'description', null,
        'target_amount', 700, 'initial_progress', 0, 'starts_on', current_date,
        'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
        'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
        'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
      ),
      jsonb_build_object(
        'liability_account_id', target_liability_account,
        'creditor', '__legacy_creditor__', 'principal', 500,
        'currency_code', 'COP'
      )
    );
    raise exception 'an existing debt target amount changed without a ledger event';
  exception when others then
    if sqlerrm = 'an existing debt target amount changed without a ledger event' then raise; end if;
    if position('existing debt principal cannot be edited' in sqlerrm) = 0 then raise; end if;
  end;

  -- Lifecycle is a compound state change: pausing a debt must stop both its
  -- progress recurrence and its payment automation; resuming may only restore
  -- rows that this exact lifecycle transition suspended.
  select rule.version into target_rule_version
  from public.liability_payment_rules rule
  where rule.user_id = test_user and rule.id = target_rule_id;
  perform public.upsert_liability_payment_rule_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', target_rule_id, 'account_id', target_liability_account,
      'funding_account_id', funding_account, 'strategy', 'current_balance',
      'days_before_due', 0, 'recording_mode', 'manual', 'active', true
    ),
    target_rule_version
  );
  perform public.upsert_liability_payment_intent_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', target_intent_id, 'account_id', target_liability_account,
      'rule_id', target_rule_id, 'obligation_id', scheduled_obligation_id,
      'scheduled_for', current_date + 20, 'planned_amount', 100,
      'status', 'needs_confirmation'
    )
  );
  insert into public.recurring_rules (
    id, user_id, account_id, destination_account_id, kind, amount,
    destination_amount, description, cadence, interval_count, next_run_on,
    active, starts_on, ends_on, anchor_day, posting_policy, timezone,
    auto_post, include_in_budget, include_in_income_target, status,
    exchange_rate, exchange_rate_date, exchange_rate_source,
    financial_target_id, financial_target_effect
  ) values (
    target_recurring_rule_id, test_user, funding_account,
    target_liability_account, 'transfer', 50, 50,
    '__target_lifecycle_transfer__', 'monthly', 1, current_date + 20,
    true, current_date + 20, current_date + 20,
    extract(day from current_date + 20)::smallint, 'scheduled_date',
    'America/Bogota', false, false, false, 'active', 1, current_date,
    'same_currency', debt_target_id, 'advance'
  );

  lifecycle_result := public.set_financial_target_status_v2(
    gen_random_uuid(), debt_target_id, 'paused'
  );
  if lifecycle_result->>'targetStatus' <> 'paused'
     or (select status from public.financial_targets where user_id = test_user and id = debt_target_id) <> 'paused'
     or (select status from public.liabilities where user_id = test_user and account_id = target_liability_account) <> 'paused'
     or not exists (
       select 1 from public.liability_payment_rules rule
       where rule.user_id = test_user and rule.id = target_rule_id
         and not rule.active and rule.suspended_by_target
     )
     or not exists (
       select 1 from public.liability_payment_intents intent
       where intent.user_id = test_user and intent.id = target_intent_id
         and intent.status = 'cancelled' and intent.suspended_by_target
     )
     or not exists (
       select 1 from public.recurring_rules rule
       where rule.user_id = test_user and rule.id = target_recurring_rule_id
         and rule.status = 'paused' and not rule.active and rule.suspended_by_target
     )
     or exists (
       select 1 from public.recurring_occurrences occurrence
       where occurrence.user_id = test_user
         and occurrence.rule_id = target_recurring_rule_id
         and occurrence.status = 'planned'
     ) then
    raise exception 'pausing a target did not stop every linked automation atomically';
  end if;

  lifecycle_result := public.set_financial_target_status_v2(
    gen_random_uuid(), debt_target_id, 'active'
  );
  if lifecycle_result->>'targetStatus' <> 'active'
     or (select status from public.financial_targets where user_id = test_user and id = debt_target_id) <> 'active'
     or (select status from public.liabilities where user_id = test_user and account_id = target_liability_account) <> 'active'
     or not exists (
       select 1 from public.liability_payment_rules rule
       where rule.user_id = test_user and rule.id = target_rule_id
         and rule.active and not rule.suspended_by_target
     )
     or not exists (
       select 1 from public.liability_payment_intents intent
       where intent.user_id = test_user and intent.id = target_intent_id
         and intent.status = 'needs_confirmation' and not intent.suspended_by_target
     )
     or not exists (
       select 1 from public.recurring_rules rule
       where rule.user_id = test_user and rule.id = target_recurring_rule_id
         and rule.status = 'active' and rule.active and not rule.suspended_by_target
     ) then
    raise exception 'resuming a target did not selectively restore its automations';
  end if;

  perform public.upsert_financial_target_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
      'title', '__legacy_funding_debt__', 'description', null,
      'target_amount', 500, 'initial_progress', 0, 'starts_on', current_date,
      'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
      'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
      'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
    ),
    jsonb_build_object(
      'creditor', '__legacy_creditor__', 'principal', 500,
      'annual_interest_rate', null, 'schedule', '[]'::jsonb
    )
  );
  if exists (
    select 1 from public.liability_obligations obligation
    where obligation.user_id = test_user and obligation.id = scheduled_obligation_id
  ) then raise exception 'an explicit empty schedule did not clear projections'; end if;
  if exists (
    select 1 from public.liability_rate_periods rate
    where rate.user_id = test_user and rate.account_id = target_liability_account
      and rate.rate_kind = 'principal' and rate.source = 'manual'
  ) then raise exception 'an explicit null rate preserved stale terms'; end if;
  if not exists (
    select 1 from public.liability_payment_rules rule
    where rule.user_id = test_user and rule.id = target_rule_id
      and rule.funding_account_id = funding_account and rule.detached_at is null
  ) then raise exception 'an omitted funding account changed the existing payment rule'; end if;

  perform public.upsert_financial_target_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', debt_target_id, 'mode', 'pay_down', 'kind', 'debt', 'status', 'active',
      'title', '__legacy_funding_debt__', 'description', null,
      'target_amount', 500, 'initial_progress', 0, 'starts_on', current_date,
      'target_date', current_date + 365, 'priority', 3, 'color', '#445566',
      'icon', 'landmark', 'account_id', invalid_account, 'category_id', null,
      'tracking_mode', 'movements', 'completed_at', null, 'archived_at', null
    ),
    jsonb_build_object(
      'creditor', '__legacy_creditor__', 'principal', 500,
      'funding_account_id', null
    )
  );
  if not exists (
    select 1 from public.liability_payment_rules rule
    where rule.user_id = test_user and rule.id = target_rule_id
      and not rule.active and not rule.suspended_by_target
      and rule.detached_at is not null
  ) then raise exception 'an explicit null funding account did not safely detach the payment rule'; end if;

  begin
    perform public.set_financial_target_status_v2(
      gen_random_uuid(), debt_target_id, 'completed'
    );
    raise exception 'a target with outstanding debt was completed';
  exception when others then
    if sqlerrm = 'a target with outstanding debt was completed' then raise; end if;
    if position('pay the full debt' in sqlerrm) = 0 then raise; end if;
  end;

  -- Even if a future posting would make the all-time balance zero, it remains
  -- an outstanding commitment and must block completion independently.
  begin
    perform public.upsert_transactions_v3(
      gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object(
          'id', future_movement_id, 'account_id', target_liability_account,
          'kind', 'transfer_out', 'amount', 10,
          'transfer_group_id', future_transfer_group,
          'description', '__future_target_drawdown__',
          'occurred_on', current_date + 10,
          'native_currency_code', 'COP', 'base_currency_code', 'COP',
          'exchange_rate', 1, 'exchange_rate_source', 'same_currency'
        ),
        jsonb_build_object(
          'id', gen_random_uuid(), 'account_id', funding_account,
          'kind', 'transfer_in', 'amount', 10,
          'transfer_group_id', future_transfer_group,
          'description', '__future_target_drawdown__',
          'occurred_on', current_date + 10,
          'native_currency_code', 'COP', 'base_currency_code', 'COP',
          'exchange_rate', 1, 'exchange_rate_source', 'same_currency'
        )
      )
    );
    perform public.set_financial_target_status_v2(
      gen_random_uuid(), debt_target_id, 'completed'
    );
    raise exception 'a target with future movements was completed';
  exception when others then
    if sqlerrm = 'a target with future movements was completed' then raise; end if;
    if position('remove future movements' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.record_liability_payment_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'liability_account_id', target_liability_account,
      'funding_account_id', funding_account,
      'liability_amount', 500, 'funding_amount', 500,
      'occurred_on', current_date, 'description', '__close_target_debt__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    '[]'::jsonb
  );
  lifecycle_result := public.set_financial_target_status_v2(
    gen_random_uuid(), debt_target_id, 'completed'
  );
  if lifecycle_result->>'targetStatus' <> 'completed'
     or (select status from public.financial_targets where user_id = test_user and id = debt_target_id) <> 'completed'
     or (select status from public.liabilities where user_id = test_user and account_id = target_liability_account) <> 'settled'
     or exists (
       select 1 from public.recurring_rules rule
       where rule.user_id = test_user and rule.financial_target_id = debt_target_id
         and rule.status <> 'archived'
     )
     or exists (
       select 1 from public.recurring_occurrences occurrence
       where occurrence.user_id = test_user
         and occurrence.rule_id = target_recurring_rule_id
         and occurrence.status = 'planned'
      ) then
    raise exception 'completing a paid debt did not close its linked lifecycle: %',
      jsonb_build_object(
        'result', lifecycle_result,
        'targetStatus', (select status from public.financial_targets where user_id = test_user and id = debt_target_id),
        'liabilityStatus', (select status from public.liabilities where user_id = test_user and account_id = target_liability_account),
        'openRules', (select count(*) from public.recurring_rules rule where rule.user_id = test_user and rule.financial_target_id = debt_target_id and rule.status <> 'archived'),
        'plannedOccurrences', (select count(*) from public.recurring_occurrences occurrence where occurrence.user_id = test_user and occurrence.rule_id = target_recurring_rule_id and occurrence.status = 'planned')
      );
  end if;

  select account.version into target_account_version
  from public.accounts account
  where account.user_id = test_user and account.id = target_liability_account;
  select liability.version into target_liability_version
  from public.liabilities liability
  where liability.user_id = test_user and liability.account_id = target_liability_account;
  lifecycle_result := public.archive_liability_v2(
    gen_random_uuid(), target_liability_account,
    target_account_version, target_liability_version
  );
  if lifecycle_result->>'targetStatus' <> 'archived'
     or (select status from public.financial_targets where user_id = test_user and id = debt_target_id) <> 'archived'
     or (select status from public.liabilities where user_id = test_user and account_id = target_liability_account) <> 'archived'
     or not (select archived from public.accounts where user_id = test_user and id = target_liability_account) then
    raise exception 'archiving a linked liability left target/account state behind';
  end if;

  begin
    perform public.upsert_liability_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', invalid_account, 'name', '__obligation_invalid__',
        'currency_code', 'COP', 'color', '#223344', 'icon', 'wallet'
      ),
      jsonb_build_object(
        'account_id', invalid_account, 'kind', 'personal_debt',
        'status', 'active', 'original_principal', 100
      ),
      1,
      null
    );
    raise exception 'non-credit account was accepted as a liability';
  exception when others then
    if sqlerrm = 'non-credit account was accepted as a liability' then raise; end if;
    if position('credit account' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.upsert_liability_terms_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', versioned_term_id, 'account_id', liability_account,
      'starts_on', current_date + 1, 'payment_frequency', 'monthly',
      'calculation_method', 'manual', 'amortization_method', 'manual',
      'variable_rate', false, 'prepayment_strategy', 'manual'
    ),
    '[]'::jsonb,
    null
  );
  if (select ends_on from public.liability_terms where user_id = test_user and id = term_id) <> current_date
     or not exists (
       select 1 from public.liability_terms
       where user_id = test_user and id = versioned_term_id
         and starts_on = current_date + 1
     ) then raise exception 'versioning terms did not close the prior window'; end if;

  overview := public.get_liability_overview_v2(false);
  if jsonb_array_length(overview->'items') < 1
     or not exists (
       select 1 from jsonb_array_elements(overview->'items') item
       where item->>'accountId' = liability_account::text
         and (item->>'nativeDebt')::numeric = 220
     ) then raise exception 'liability overview omitted the ledger-derived debt'; end if;

  perform public.upsert_transactions_v3(
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(), 'account_id', liability_account,
        'kind', 'transfer_out', 'amount', 10,
        'transfer_group_id', drawdown_group,
        'description', '__liability_drawdown__', 'occurred_on', current_date,
        'native_currency_code', 'COP', 'base_currency_code', 'COP',
        'exchange_rate', 1, 'exchange_rate_source', 'same_currency'
      ),
      jsonb_build_object(
        'id', gen_random_uuid(), 'account_id', funding_account,
        'kind', 'transfer_in', 'amount', 10,
        'transfer_group_id', drawdown_group,
        'description', '__liability_drawdown__', 'occurred_on', current_date,
        'native_currency_code', 'COP', 'base_currency_code', 'COP',
        'exchange_rate', 1, 'exchange_rate_source', 'same_currency'
      )
    )
  );
  if not exists (
    select 1 from public.liability_event_metadata metadata
    where metadata.user_id = test_user
      and metadata.ledger_event_id = drawdown_group
      and metadata.account_id = liability_account
      and metadata.role = 'drawdown'
  ) then raise exception 'a liability drawdown was not tagged at the database boundary'; end if;
  begin
    update public.transactions movement
    set description = '__forged_drawdown_edit__'
    where movement.user_id = test_user and movement.transfer_group_id = drawdown_group;
    raise exception 'generic history edited a protected liability event';
  exception when others then
    if sqlerrm = 'generic history edited a protected liability event' then raise; end if;
    if position('conservar el historial' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

-- A rollback does not fire deferred constraint triggers. Force every deferred
-- finance invariant now so this reversible test cannot report a false pass.
set constraints all immediate;

reset role;
do $$
begin
  if private.liability_payment_cap_v2('loan', 100, 110, 8, 2, 0) <> 110 then
    raise exception 'the final loan installment excluded unposted interest or fees';
  end if;
  if private.liability_payment_cap_v2('loan', 100, 110, 8, 2, 5) <> 105 then
    raise exception 'a partially paid installment double-counted its remaining charges';
  end if;
  if private.liability_payment_cap_v2('credit_card', 100, 110, 8, 2, 0) <> 100 then
    raise exception 'a card payment duplicated statement charges already in its ledger';
  end if;
  if private.liability_rule_obligation_amount_v2('minimum_due', null, 50, 500, 50) <> 0 then
    raise exception 'a manually covered card minimum remained eligible for automatic payment';
  end if;
  if private.liability_rule_obligation_amount_v2('fixed', 100, 500, 500, 100) <> 0 then
    raise exception 'a manually covered fixed payment would be charged twice';
  end if;
  if private.liability_rule_obligation_amount_v2('fixed', 100, 500, 500, 40) <> 60 then
    raise exception 'a partial manual payment did not reduce the scheduled fixed amount';
  end if;
end;
$$;
set local role authenticated;
set constraints all deferred;

do $$
declare
  test_user uuid := auth.uid();
  card_account uuid := gen_random_uuid();
  funding_account uuid := gen_random_uuid();
  purchase_id uuid := gen_random_uuid();
  plan_id uuid := gen_random_uuid();
  installment_id uuid := gen_random_uuid();
  test_statement_id uuid := gen_random_uuid();
  statement_operation uuid := gen_random_uuid();
  payment_operation uuid := gen_random_uuid();
  preview jsonb;
  statement_version bigint;
begin
  insert into public.accounts (
    id, user_id, name, account_type, initial_balance, color, icon,
    currency_code, opening_balance_date, opening_exchange_rate
  ) values (
    funding_account, test_user, '__card_statement_funding__', 'checking',
    1000, '#223344', 'wallet', 'COP', current_date, 1
  );

  perform public.upsert_credit_card_v1(
    gen_random_uuid(),
    jsonb_build_object(
      'id', card_account, 'name', '__card_statement_test__',
      'opening_debt', 0, 'color', '#334455', 'icon', 'credit-card',
      'currency_code', 'COP', 'opening_balance_date', current_date,
      'opening_exchange_rate', 1
    ),
    jsonb_build_object(
      'network', 'visa', 'last_four', '4242', 'credit_limit', 2000,
      'cutoff_day', extract(day from current_date)::integer,
      'due_day', extract(day from current_date + 10)::integer,
      'annual_fee', 0
    )
  );

  perform public.create_credit_card_purchase_v1(
    gen_random_uuid(),
    jsonb_build_object(
      'id', purchase_id, 'account_id', card_account, 'category_id', null,
      'kind', 'expense', 'amount', 450, 'description', '__card_purchase__',
      'merchant', '__card_merchant__', 'occurred_on', current_date,
      'native_currency_code', 'COP', 'base_currency_code', 'COP',
      'base_amount', 450, 'exchange_rate', 1,
      'exchange_rate_date', current_date, 'exchange_rate_source', 'same_currency'
    ),
    jsonb_build_object(
      'id', plan_id, 'installment_count', 1, 'financing_type', 'no_interest',
      'first_due_on', current_date + 10
    ),
    jsonb_build_array(jsonb_build_object(
      'id', installment_id, 'installment_number', 1,
      'due_on', current_date + 10, 'principal', 450,
      'estimated_interest', 0, 'estimated_fee', 0
    ))
  );

  preview := public.preview_liability_reconciliation_v2(
    card_account, current_date, 500, test_statement_id, current_date - 30, 40, 10
  );
  if (preview->>'ledgerDebtBeforeStatementCharges')::numeric <> 450
     or (preview->>'interestToPost')::numeric <> 40
     or (preview->>'feesToPost')::numeric <> 10
     or (preview->>'ledgerDebt')::numeric <> 500
     or not (preview->>'isBalanced')::boolean then
    raise exception 'statement preview did not project the explicit 40/10 bank charges: %', preview;
  end if;

  perform public.upsert_liability_obligation_v2(
    statement_operation,
    jsonb_build_object(
      'id', test_statement_id, 'account_id', card_account,
      'kind', 'credit_card_statement', 'period_start', current_date - 30,
      'period_end', current_date, 'due_on', current_date + 10,
      'principal_due', 450, 'interest_due', 40, 'fee_due', 10,
      'minimum_due', 50, 'total_due', 500, 'status', 'open',
      'source', 'statement'
    ),
    jsonb_build_object(
      'cutoff_on', current_date, 'purchases', 450, 'advances', 0,
      'interest', 40, 'fees', 10,
      -- Deliberately greater than total_due: this is bank-cycle context, not
      -- a ledger-backed settlement signal.
      'payments', 750, 'refunds', 0, 'status', 'reconciled',
      'reconciled_at', now(), 'version', 1,
      'reconciliation_exchange_rate', null,
      'reconciliation_exchange_rate_source', null
    ),
    '[]'::jsonb,
    false,
    null
  );
  set constraints credit_card_statements_validate_reconciliation_v2 immediate;
  set constraints credit_card_statements_validate_reconciliation_v2 deferred;

  if (select status from public.liability_obligations
      where user_id = test_user and id = test_statement_id) = 'paid' then
    raise exception 'a reconciled statement or its payments subtotal incorrectly marked the obligation paid';
  end if;
  if (select status from public.credit_card_installments
      where user_id = test_user and id = installment_id) <> 'billed' then
    raise exception 'reconciling the statement did not mark its installment billed';
  end if;
  if (select installment.statement_id from public.credit_card_installments installment
      where installment.user_id = test_user and installment.id = installment_id) <> test_statement_id then
    raise exception 'billed installment was not linked to its statement';
  end if;
  if (select status from public.credit_card_purchase_plans
      where user_id = test_user and id = plan_id) <> 'active' then
    raise exception 'a billed but unpaid purchase plan was completed early';
  end if;

  select obligation.version into statement_version
  from public.liability_obligations obligation
  where obligation.user_id = test_user and obligation.id = test_statement_id;
  begin
    perform public.upsert_liability_obligation_v2(
      gen_random_uuid(),
      jsonb_build_object(
        'id', test_statement_id, 'account_id', card_account,
        'kind', 'credit_card_statement', 'period_start', current_date - 30,
        'period_end', current_date, 'due_on', current_date + 10,
        'principal_due', 450, 'interest_due', 40, 'fee_due', 10,
        'minimum_due', 50, 'total_due', 500, 'status', 'paid',
        'source', 'statement'
      ),
      jsonb_build_object(
        'cutoff_on', current_date, 'purchases', 450, 'advances', 0,
        'interest', 40, 'fees', 10, 'payments', 750, 'refunds', 0,
        'status', 'paid', 'reconciled_at', now(), 'version', 1
      ),
      '[]'::jsonb,
      false,
      statement_version
    );
    raise exception 'an unpaid statement accepted a manual paid status';
  exception when others then
    if sqlerrm = 'an unpaid statement accepted a manual paid status' then raise; end if;
    if position('ledger-backed payment allocations' in sqlerrm) = 0 then raise; end if;
  end;
  if (select status from public.credit_card_statements
      where user_id = test_user and id = test_statement_id) <> 'reconciled' then
    raise exception 'rejected paid status still changed the statement';
  end if;

  begin
    delete from public.credit_card_statements
    where user_id = test_user and id = test_statement_id;
    raise exception 'statement history was deleted through legacy DML';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm = 'statement history was deleted through legacy DML' then raise; end if;
      raise;
  end;
  if not exists (
    select 1 from public.credit_card_statements
    where user_id = test_user and id = test_statement_id
  ) then raise exception 'rejected statement deletion still removed its history'; end if;

  preview := public.preview_liability_reconciliation_v2(
    card_account, current_date, 500, test_statement_id, current_date - 30, 40, 10
  );
  if (preview->>'interestToPost')::numeric <> 0
     or (preview->>'feesToPost')::numeric <> 0
     or (preview->>'difference')::numeric <> 0 then
    raise exception 'repeated statement preview would duplicate reconciled charges: %', preview;
  end if;
  if (
    select count(*)
    from public.liability_event_metadata metadata
    where metadata.user_id = test_user
      and metadata.related_obligation_id = test_statement_id
      and metadata.role in ('interest', 'fee')
  ) <> 2 then
    raise exception 'statement charges were not recorded exactly once with obligation provenance';
  end if;

  select obligation.version into statement_version
  from public.liability_obligations obligation
  where obligation.user_id = test_user and obligation.id = test_statement_id;
  perform public.upsert_liability_obligation_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', test_statement_id, 'account_id', card_account,
      'kind', 'credit_card_statement', 'period_start', current_date - 30,
      'period_end', current_date, 'due_on', current_date + 10,
      'principal_due', 450, 'interest_due', 40, 'fee_due', 10,
      'minimum_due', 50, 'total_due', 500, 'status', 'open',
      'source', 'statement'
    ),
    jsonb_build_object(
      'cutoff_on', current_date, 'purchases', 450, 'advances', 0,
      'interest', 40, 'fees', 10, 'payments', 750, 'refunds', 0,
      'status', 'reconciled', 'reconciled_at', now(), 'version', 1
    ),
    '[]'::jsonb,
    false,
    statement_version
  );
  set constraints credit_card_statements_validate_reconciliation_v2 immediate;
  set constraints credit_card_statements_validate_reconciliation_v2 deferred;
  if (
    select count(*)
    from public.liability_event_metadata metadata
    where metadata.user_id = test_user
      and metadata.related_obligation_id = test_statement_id
      and metadata.role in ('interest', 'fee')
  ) <> 2 then
    raise exception 'reconciling the same statement twice duplicated its charges';
  end if;

  perform public.record_liability_payment_v2(
    payment_operation,
    jsonb_build_object(
      'liability_account_id', card_account,
      'funding_account_id', funding_account,
      'liability_amount', 500, 'funding_amount', 500,
      'occurred_on', current_date, 'description', '__card_statement_payment__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'obligation_id', test_statement_id, 'amount', 500, 'allocated_on', current_date
    ))
  );
  set constraints credit_card_statements_validate_reconciliation_v2 immediate;
  set constraints credit_card_statements_validate_reconciliation_v2 deferred;

  if (select status from public.liability_obligations
      where user_id = test_user and id = test_statement_id) <> 'paid'
     or (select status from public.credit_card_statements
      where user_id = test_user and id = test_statement_id) <> 'paid' then
    raise exception 'ledger-backed allocation did not pay both statement representations';
  end if;
  if (select status from public.credit_card_installments
      where user_id = test_user and id = installment_id) <> 'paid'
     or (select status from public.credit_card_purchase_plans
      where user_id = test_user and id = plan_id) <> 'completed' then
    raise exception 'paying a statement did not complete its installment lifecycle';
  end if;
  if (
    select count(*)
    from public.liability_event_metadata metadata
    join public.transactions movement
      on movement.user_id = metadata.user_id
     and movement.ledger_event_id = metadata.ledger_event_id
     and movement.account_id = metadata.account_id
    where metadata.user_id = test_user
      and metadata.related_obligation_id = test_statement_id
      and metadata.role in ('interest', 'fee')
      and movement.kind = 'expense'
  ) <> 2 then
    raise exception 'statement payment duplicated its already reconciled interest or fees';
  end if;
  if not exists (
    select 1
    from public.audit_events event
    where event.user_id = test_user
      and event.entity_type = 'credit_card_installments'
      and event.entity_id = installment_id
      and event.action = 'update'
  ) then
    raise exception 'installment lifecycle changes were not captured in the audit trail';
  end if;
end;
$$;

-- A manual payment recorded after an automatic minimum was planned must
-- retire that stale intent. Re-materializing and running the worker may never
-- charge the same minimum a second time.
set local role authenticated;
do $$
declare
  test_user uuid := auth.uid();
  card_account uuid := gen_random_uuid();
  funding_account uuid := gen_random_uuid();
  payment_rule uuid := gen_random_uuid();
  test_obligation uuid := gen_random_uuid();
begin
  insert into public.accounts (
    id, user_id, name, account_type, initial_balance, color, icon,
    currency_code, opening_balance_date, opening_exchange_rate
  ) values (
    funding_account, test_user, '__minimum_race_funding__', 'checking',
    1000, '#223344', 'wallet', 'COP', current_date, 1
  );

  perform public.upsert_credit_card_v1(
    gen_random_uuid(),
    jsonb_build_object(
      'id', card_account, 'name', '__minimum_race_card__',
      'opening_debt', 500, 'color', '#334455', 'icon', 'credit-card',
      'currency_code', 'COP', 'opening_balance_date', current_date,
      'opening_exchange_rate', 1
    ),
    jsonb_build_object(
      'network', 'visa', 'last_four', '5050', 'credit_limit', 2000,
      'cutoff_day', extract(day from current_date)::integer,
      'due_day', extract(day from current_date)::integer,
      'annual_fee', 0
    )
  );

  perform public.upsert_liability_payment_rule_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', payment_rule, 'account_id', card_account,
      'funding_account_id', funding_account, 'strategy', 'minimum_due',
      'days_before_due', 0, 'recording_mode', 'auto_post', 'active', true
    )
  );
  perform set_config('moneva.minimum_race_card', card_account::text, true);
  perform set_config('moneva.minimum_race_funding', funding_account::text, true);
  perform set_config('moneva.minimum_race_rule', payment_rule::text, true);
  perform set_config('moneva.minimum_race_obligation', test_obligation::text, true);
end;
$$;

reset role;
do $$
declare
  test_user uuid := current_setting('moneva.test_first_user')::uuid;
begin
  insert into public.liability_obligations (
    id, user_id, account_id, kind, period_start, period_end, due_on,
    principal_due, interest_due, fee_due, minimum_due, total_due,
    status, source
  ) values (
    current_setting('moneva.minimum_race_obligation')::uuid,
    test_user, current_setting('moneva.minimum_race_card')::uuid,
    'credit_card_statement', current_date - 30, current_date, current_date,
    500, 0, 0, 50, 500, 'open', 'statement'
  );
  insert into public.liability_payment_intents (
    id, user_id, account_id, rule_id, obligation_id, scheduled_for,
    planned_amount, status
  ) values (
    gen_random_uuid(), test_user,
    current_setting('moneva.minimum_race_card')::uuid,
    current_setting('moneva.minimum_race_rule')::uuid,
    current_setting('moneva.minimum_race_obligation')::uuid,
    current_date, 50, 'confirmed'
  );
  perform private.materialize_liability_payment_intents_v2(current_date);
  if (select count(*) from public.liability_payment_intents intent
    where intent.user_id = test_user
      and intent.rule_id = current_setting('moneva.minimum_race_rule')::uuid
      and intent.obligation_id = current_setting('moneva.minimum_race_obligation')::uuid
  ) <> 1 or not exists (
    select 1 from public.liability_payment_intents intent
    where intent.user_id = test_user
      and intent.rule_id = current_setting('moneva.minimum_race_rule')::uuid
      and intent.obligation_id = current_setting('moneva.minimum_race_obligation')::uuid
      and intent.status = 'confirmed' and intent.planned_amount = 50
  ) then
    raise exception 'the automatic minimum did not reuse the existing noncanonical intent';
  end if;
end;
$$;

set local role authenticated;
do $$
declare
  test_user uuid := auth.uid();
begin
  perform public.record_liability_payment_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'liability_account_id', current_setting('moneva.minimum_race_card')::uuid,
      'funding_account_id', current_setting('moneva.minimum_race_funding')::uuid,
      'liability_amount', 50, 'funding_amount', 50,
      'occurred_on', current_date, 'description', '__manual_minimum_before_worker__',
      'funding_exchange_rate', 1, 'liability_exchange_rate', 1
    ),
    jsonb_build_array(jsonb_build_object(
      'obligation_id', current_setting('moneva.minimum_race_obligation')::uuid,
      'amount', 50, 'allocated_on', current_date
    ))
  );
end;
$$;

reset role;
do $$
declare
  test_user uuid := current_setting('moneva.test_first_user')::uuid;
begin
  perform private.materialize_liability_payment_intents_v2(current_date);
  perform private.process_due_liability_payments_v2(100);
  if not exists (
    select 1 from public.liability_payment_intents intent
    where intent.user_id = test_user
      and intent.rule_id = current_setting('moneva.minimum_race_rule')::uuid
      and intent.obligation_id = current_setting('moneva.minimum_race_obligation')::uuid
      and intent.status = 'cancelled' and intent.planned_amount = 0
      and intent.failure_reason = 'already covered by recorded payments'
  ) then
    raise exception 'the stale automatic minimum intent was not retired';
  end if;
  if (
    select count(*)
    from public.liability_event_metadata metadata
    where metadata.user_id = test_user
      and metadata.account_id = current_setting('moneva.minimum_race_card')::uuid
      and metadata.role = 'payment'
  ) <> 1 then
    raise exception 'the covered minimum produced more than its one manual payment event';
  end if;
end;
$$;

set local role authenticated;
do $$
declare
  test_user uuid := auth.uid();
  loan_account uuid := gen_random_uuid();
  funding_account uuid := gen_random_uuid();
  payment_rule uuid := gen_random_uuid();
  test_obligation uuid := gen_random_uuid();
begin
  insert into public.accounts (
    id, user_id, name, account_type, initial_balance, color, icon,
    currency_code, opening_balance_date, opening_exchange_rate
  ) values (
    funding_account, test_user, '__final_installment_funding__', 'checking',
    1000, '#223344', 'wallet', 'COP', current_date, 1
  );
  perform public.upsert_liability_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', loan_account, 'name', '__final_installment_loan__',
      'opening_debt', 100, 'color', '#334455', 'icon', 'landmark',
      'currency_code', 'COP', 'opening_balance_date', current_date,
      'opening_exchange_rate', 1
    ),
    jsonb_build_object(
      'account_id', loan_account, 'kind', 'loan', 'status', 'active',
      'creditor_name', '__final_installment_creditor__',
      'original_principal', 100, 'originated_on', current_date
    )
  );
  perform public.upsert_liability_payment_rule_v2(
    gen_random_uuid(),
    jsonb_build_object(
      'id', payment_rule, 'account_id', loan_account,
      'funding_account_id', funding_account, 'strategy', 'fixed',
      'fixed_amount', 110, 'days_before_due', 0,
      'recording_mode', 'auto_post', 'active', true
    )
  );
  perform set_config('moneva.final_installment_loan', loan_account::text, true);
  perform set_config('moneva.final_installment_rule', payment_rule::text, true);
  perform set_config('moneva.final_installment_obligation', test_obligation::text, true);
end;
$$;

reset role;
do $$
declare
  test_user uuid := current_setting('moneva.test_first_user')::uuid;
begin
  insert into public.liability_obligations (
    id, user_id, account_id, kind, sequence_number, due_on,
    principal_due, interest_due, fee_due, minimum_due, total_due,
    status, source
  ) values (
    current_setting('moneva.final_installment_obligation')::uuid,
    test_user, current_setting('moneva.final_installment_loan')::uuid,
    'loan_installment', 1, current_date,
    100, 8, 2, 110, 110, 'open', 'contract'
  );
  perform private.materialize_liability_payment_intents_v2(current_date);
  perform private.process_due_liability_payments_v2(100);

  if (select status from public.liability_obligations obligation
      where obligation.user_id = test_user
        and obligation.id = current_setting('moneva.final_installment_obligation')::uuid) <> 'paid'
     or (select status from public.liabilities liability
      where liability.user_id = test_user
        and liability.account_id = current_setting('moneva.final_installment_loan')::uuid) <> 'settled' then
    raise exception 'the automatic final installment did not settle the loan: obligation %, liability %, balance %, intent %',
      (select status from public.liability_obligations obligation
       where obligation.user_id = test_user
         and obligation.id = current_setting('moneva.final_installment_obligation')::uuid),
      (select status from public.liabilities liability
       where liability.user_id = test_user
         and liability.account_id = current_setting('moneva.final_installment_loan')::uuid),
      private.liability_native_balance_at_v2(
        test_user, current_setting('moneva.final_installment_loan')::uuid, current_date
      ),
      (select jsonb_build_object(
          'status', intent.status, 'planned', intent.planned_amount,
          'failure', intent.failure_reason
        )
       from public.liability_payment_intents intent
       where intent.user_id = test_user
         and intent.rule_id = current_setting('moneva.final_installment_rule')::uuid
       order by intent.updated_at desc limit 1);
  end if;
  if coalesce(private.liability_native_balance_at_v2(
      test_user, current_setting('moneva.final_installment_loan')::uuid, current_date
    ), 1) <> 0 then
    raise exception 'the automatic final installment left a ledger balance';
  end if;
  if not exists (
    select 1
    from public.liability_payment_intents intent
    where intent.user_id = test_user
      and intent.rule_id = current_setting('moneva.final_installment_rule')::uuid
      and intent.status = 'posted' and intent.planned_amount = 110
  ) then
    raise exception 'the automatic final installment was clipped below its charges';
  end if;
  if (
    select coalesce(sum(movement.amount), 0)
    from public.transactions movement
    where movement.user_id = test_user
      and movement.account_id = current_setting('moneva.final_installment_loan')::uuid
      and movement.kind = 'expense'
      and movement.description in (
        'Intereses del pago de obligacion', 'Cargos del pago de obligacion'
      )
  ) <> 10 then
    raise exception 'the automatic final installment did not post its 8/2 charges exactly once';
  end if;
end;
$$;

set local role authenticated;
set constraints all immediate;

do $$
declare
  first_user uuid := current_setting('moneva.test_first_user')::uuid;
  second_user_text text := current_setting('moneva.test_second_user', true);
  first_account uuid;
begin
  if coalesce(second_user_text, '') = '' then
    raise exception 'tenant isolation requires two enabled finance users';
  end if;
  select account_id into first_account from public.liabilities
  where user_id = first_user and creditor_name = '__test_creditor__' limit 1;
  perform set_config('request.jwt.claim.sub', second_user_text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', second_user_text::uuid, 'role', 'authenticated'
  )::text, true);
  if exists (select 1 from public.liabilities where account_id = first_account) then
    raise exception 'RLS exposed another tenant liability';
  end if;
end;
$$;

rollback;
