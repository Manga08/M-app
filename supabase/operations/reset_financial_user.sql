-- Resets one authorized Moneva user to the same financial state as a new user.
--
-- Preserved:
--   * auth.users and auth.identities (Google sign-in)
--   * private.access_allowlist (enabled flag and access role)
--   * public.profiles (name, avatar, locale, currency and appearance settings)
--     except for the monotonic reset marker used to invalidate local caches
--
-- Removed:
--   * every user-owned financial row, including history, scheduled items,
--     imports, audit events and mutation receipts
--
-- Recreated:
--   * the default zero-balance cash account
--   * the five default main categories
--   * the default income and expense subcategories
--
-- OPERATOR CHECKLIST
--   1. Make sure the user has finished syncing and closed Moneva on every device.
--   2. Replace the sentinel UUID below with the exact auth.users.id.
--   3. Run the whole file as a privileged database operator.
--   4. Reopen Moneva only after the transaction commits.
--
-- The sentinel and the assertions intentionally make this script fail closed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $reset_financial_user$
declare
  target_user_id constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  target_email text;
  target_metadata jsonb;
  profile_before public.profiles%rowtype;
  profile_after public.profiles%rowtype;
  unexpected_table text;
begin
  if target_user_id = (
    '00000000-0000-' || '0000-0000-000000000000'
  )::uuid then
    raise exception 'Replace the sentinel UUID before running the financial reset';
  end if;

  -- Serializes resets for the same identity without locking unrelated users.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('moneva-financial-reset:' || target_user_id::text, 0)
  );

  select lower(auth_user.email), auth_user.raw_user_meta_data
  into target_email, target_metadata
  from auth.users auth_user
  where auth_user.id = target_user_id
  for update;

  if not found then
    raise exception 'No auth.users row exists for user %', target_user_id;
  end if;

  if not exists (
    select 1
    from private.access_allowlist access
    where access.email = target_email
      and access.enabled
  ) then
    raise exception 'User % is not enabled in the private access list', target_user_id;
  end if;

  select profile.*
  into profile_before
  from public.profiles profile
  where profile.id = target_user_id
  for update;

  if not found then
    raise exception 'No public.profiles row exists for user %', target_user_id;
  end if;

  -- Abort when a future migration introduces another user-owned table. This
  -- prevents a partial reset from silently leaving new financial data behind.
  select relation.relname
  into unexpected_table
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = relation.oid
        and attribute.attname = 'user_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
    )
    and relation.relname <> all (array[
      'account_entities',
      'account_valuations',
      'accounts',
      'audit_events',
      'budgets',
      'categories',
      'credit_card_installments',
      'credit_card_payment_allocations',
      'credit_card_profiles',
      'credit_card_purchase_plans',
      'credit_card_rate_periods',
      'credit_card_statements',
      'exchange_rates',
      'financial_target_debt_details',
      'financial_target_entries',
      'financial_targets',
      'group_allocations',
      'ingestion_jobs',
      'ledger_events',
      'liabilities',
      'liability_event_metadata',
      'liability_obligations',
      'liability_payment_allocations',
      'liability_payment_intents',
      'liability_payment_rules',
      'liability_rate_periods',
      'liability_terms',
      'monthly_budget_plans',
      'mutation_receipts',
      'recurring_occurrences',
      'recurring_rules',
      'transactions'
    ]::name[])
  order by relation.relname
  limit 1;

  if unexpected_table is not null then
    raise exception 'Unhandled user-owned table: public.%', unexpected_table;
  end if;

  -- Child-to-parent order follows the current foreign-key graph.
  delete from public.liability_payment_allocations where user_id = target_user_id;
  delete from public.liability_payment_intents where user_id = target_user_id;
  delete from public.liability_event_metadata where user_id = target_user_id;
  delete from public.liability_payment_rules where user_id = target_user_id;
  delete from public.credit_card_payment_allocations where user_id = target_user_id;
  delete from public.credit_card_installments where user_id = target_user_id;
  delete from public.credit_card_purchase_plans where user_id = target_user_id;
  -- Statements are immutable compatibility rows. Removing their parent
  -- obligations lets the ownership FK cascade them without bypassing history
  -- protection or leaving orphan obligations behind.
  delete from public.liability_obligations where user_id = target_user_id;
  delete from public.credit_card_rate_periods where user_id = target_user_id;
  delete from public.liability_rate_periods where user_id = target_user_id;
  delete from public.liability_terms where user_id = target_user_id;
  delete from public.credit_card_profiles where user_id = target_user_id;
  delete from public.recurring_occurrences where user_id = target_user_id;
  delete from public.recurring_rules where user_id = target_user_id;
  delete from public.transactions where user_id = target_user_id;
  delete from public.financial_target_entries where user_id = target_user_id;
  delete from public.financial_target_debt_details where user_id = target_user_id;
  delete from public.financial_targets where user_id = target_user_id;
  delete from public.liabilities where user_id = target_user_id;
  delete from public.budgets where user_id = target_user_id;
  delete from public.monthly_budget_plans where user_id = target_user_id;
  delete from public.account_valuations where user_id = target_user_id;
  delete from public.ledger_events where user_id = target_user_id;
  delete from public.categories where user_id = target_user_id;
  delete from public.accounts where user_id = target_user_id;
  delete from public.account_entities where user_id = target_user_id;
  delete from public.group_allocations where user_id = target_user_id;
  delete from public.exchange_rates where user_id = target_user_id;
  delete from public.ingestion_jobs where user_id = target_user_id;
  delete from public.mutation_receipts where user_id = target_user_id;

  -- Reuse the canonical new-user seed so this operation cannot drift from the
  -- real onboarding defaults.
  perform private.provision_finance_user(
    target_user_id,
    target_email,
    coalesce(target_metadata, '{}'::jsonb)
  );

  -- Signal every browser profile belonging to this user before it is allowed
  -- to replay an encrypted offline queue against the newly seeded records.
  update public.profiles
  set financial_reset_generation = profile_before.financial_reset_generation + 1,
      updated_at = now()
  where id = target_user_id;

  -- Deletes generated audit noise as well as the previous financial history.
  delete from public.audit_events where user_id = target_user_id;

  select profile.*
  into profile_after
  from public.profiles profile
  where profile.id = target_user_id;

  if (to_jsonb(profile_after) - array['updated_at', 'financial_reset_generation'])
      is distinct from (to_jsonb(profile_before) - array['updated_at', 'financial_reset_generation']) then
    raise exception 'Profile settings changed during reset for user %', target_user_id;
  end if;

  if profile_after.financial_reset_generation <> profile_before.financial_reset_generation + 1 then
    raise exception 'Financial reset generation did not advance for user %', target_user_id;
  end if;

  if (select count(*) from public.accounts where user_id = target_user_id) <> 1
    or not exists (
      select 1
      from public.accounts account
      where account.user_id = target_user_id
        and account.name = 'Efectivo'
        and account.initial_balance = 0
        and not account.archived
    ) then
    raise exception 'Default zero-balance cash account was not recreated';
  end if;

  if (select count(*) from public.group_allocations where user_id = target_user_id) <> 5 then
    raise exception 'The five default main categories were not recreated';
  end if;

  if (select count(*) from public.categories where user_id = target_user_id) <> 11 then
    raise exception 'The default subcategories were not recreated';
  end if;

  if exists (
    select 1 from public.transactions where user_id = target_user_id
    union all select 1 from public.ledger_events where user_id = target_user_id
    union all select 1 from public.budgets where user_id = target_user_id
    union all select 1 from public.monthly_budget_plans where user_id = target_user_id
    union all select 1 from public.recurring_rules where user_id = target_user_id
    union all select 1 from public.recurring_occurrences where user_id = target_user_id
    union all select 1 from public.financial_targets where user_id = target_user_id
    union all select 1 from public.financial_target_entries where user_id = target_user_id
    union all select 1 from public.financial_target_debt_details where user_id = target_user_id
    union all select 1 from public.credit_card_profiles where user_id = target_user_id
    union all select 1 from public.credit_card_rate_periods where user_id = target_user_id
    union all select 1 from public.credit_card_statements where user_id = target_user_id
    union all select 1 from public.credit_card_purchase_plans where user_id = target_user_id
    union all select 1 from public.credit_card_installments where user_id = target_user_id
    union all select 1 from public.credit_card_payment_allocations where user_id = target_user_id
    union all select 1 from public.liabilities where user_id = target_user_id
    union all select 1 from public.liability_terms where user_id = target_user_id
    union all select 1 from public.liability_rate_periods where user_id = target_user_id
    union all select 1 from public.liability_obligations where user_id = target_user_id
    union all select 1 from public.liability_event_metadata where user_id = target_user_id
    union all select 1 from public.liability_payment_rules where user_id = target_user_id
    union all select 1 from public.liability_payment_intents where user_id = target_user_id
    union all select 1 from public.liability_payment_allocations where user_id = target_user_id
    union all select 1 from public.account_entities where user_id = target_user_id
    union all select 1 from public.account_valuations where user_id = target_user_id
    union all select 1 from public.exchange_rates where user_id = target_user_id
    union all select 1 from public.ingestion_jobs where user_id = target_user_id
    union all select 1 from public.mutation_receipts where user_id = target_user_id
    union all select 1 from public.audit_events where user_id = target_user_id
  ) then
    raise exception 'Financial reset verification failed for user %', target_user_id;
  end if;

  raise notice 'Financial reset completed for user % (%)', target_user_id, target_email;
end;
$reset_financial_user$;

commit;
