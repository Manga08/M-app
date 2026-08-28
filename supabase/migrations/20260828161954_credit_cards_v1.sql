-- Credit cards remain accounts in the double-entry ledger. These tables add
-- card-specific identity, statement-cycle and installment metadata without
-- storing a PAN, CVV, PIN, document or credential.

set lock_timeout = '10s';
set statement_timeout = '120s';

create table public.credit_card_profiles (
  account_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null default 'other'
    check (network in ('visa', 'mastercard', 'amex', 'diners', 'other')),
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  credit_limit numeric(20, 2) not null check (credit_limit >= 0),
  cutoff_day smallint not null check (cutoff_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  annual_fee numeric(20, 2) not null default 0 check (annual_fee >= 0),
  purchase_rate_ea numeric(9, 6) check (purchase_rate_ea is null or purchase_rate_ea between 0 and 1000),
  cash_advance_rate_ea numeric(9, 6) check (cash_advance_rate_ea is null or cash_advance_rate_ea between 0 and 1000),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade
);

create table public.credit_card_rate_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  rate_kind text not null check (rate_kind in ('purchase', 'cash_advance', 'late_fee')),
  annual_effective_rate numeric(9, 6) not null check (annual_effective_rate between 0 and 1000),
  starts_on date not null,
  ends_on date,
  source text not null default 'manual' check (source in ('manual', 'statement', 'issuer')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id)
    references public.credit_card_profiles (user_id, account_id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on)
);

create table public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  cutoff_on date not null,
  due_on date not null,
  total_due numeric(20, 2) not null check (total_due >= 0),
  minimum_due numeric(20, 2) not null default 0 check (minimum_due >= 0),
  purchases numeric(20, 2) not null default 0 check (purchases >= 0),
  advances numeric(20, 2) not null default 0 check (advances >= 0),
  interest numeric(20, 2) not null default 0 check (interest >= 0),
  fees numeric(20, 2) not null default 0 check (fees >= 0),
  payments numeric(20, 2) not null default 0 check (payments >= 0),
  refunds numeric(20, 2) not null default 0 check (refunds >= 0),
  status text not null default 'open'
    check (status in ('open', 'due', 'paid', 'overdue', 'reconciled')),
  reconciled_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, cutoff_on),
  unique (user_id, id),
  foreign key (user_id, account_id)
    references public.credit_card_profiles (user_id, account_id) on delete cascade,
  check (period_end >= period_start and due_on > cutoff_on and minimum_due <= total_due)
);

create table public.credit_card_purchase_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  transaction_id uuid not null,
  installment_count smallint not null default 1 check (installment_count between 1 and 120),
  financing_type text not null default 'unknown'
    check (financing_type in ('no_interest', 'known_rate', 'unknown')),
  annual_effective_rate numeric(9, 6) check (annual_effective_rate is null or annual_effective_rate between 0 and 1000),
  first_due_on date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, transaction_id),
  unique (user_id, id),
  foreign key (user_id, account_id)
    references public.credit_card_profiles (user_id, account_id) on delete cascade,
  foreign key (user_id, transaction_id)
    references public.transactions (user_id, id) on delete cascade,
  check (
    (financing_type = 'known_rate' and annual_effective_rate is not null)
    or (financing_type <> 'known_rate')
  )
);

create table public.credit_card_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null,
  installment_number smallint not null check (installment_number between 1 and 120),
  due_on date not null,
  principal numeric(20, 2) not null check (principal >= 0),
  estimated_interest numeric(20, 2) not null default 0 check (estimated_interest >= 0),
  estimated_fee numeric(20, 2) not null default 0 check (estimated_fee >= 0),
  status text not null default 'planned' check (status in ('planned', 'billed', 'paid', 'cancelled')),
  statement_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, plan_id, installment_number),
  foreign key (user_id, plan_id)
    references public.credit_card_purchase_plans (user_id, id) on delete cascade,
  foreign key (user_id, statement_id)
    references public.credit_card_statements (user_id, id) on delete set null
);

create table public.credit_card_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid not null,
  transfer_group_id uuid not null,
  amount numeric(20, 2) not null check (amount > 0),
  allocated_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, statement_id, transfer_group_id),
  foreign key (user_id, statement_id)
    references public.credit_card_statements (user_id, id) on delete cascade
);

create index credit_card_profiles_user_active_idx
  on public.credit_card_profiles (user_id, cutoff_day, due_day);
create index credit_card_rate_periods_account_timeline_idx
  on public.credit_card_rate_periods (user_id, account_id, starts_on desc);
create index credit_card_statements_account_timeline_idx
  on public.credit_card_statements (user_id, account_id, cutoff_on desc);
create index credit_card_statements_user_due_idx
  on public.credit_card_statements (user_id, due_on, status)
  where status in ('open', 'due', 'overdue');
create index credit_card_purchase_plans_account_active_idx
  on public.credit_card_purchase_plans (user_id, account_id, first_due_on)
  where status = 'active';
create index credit_card_installments_user_due_idx
  on public.credit_card_installments (user_id, due_on, status)
  where status in ('planned', 'billed');
create index credit_card_payment_allocations_statement_idx
  on public.credit_card_payment_allocations (user_id, statement_id, allocated_on desc);

create trigger credit_card_profiles_set_updated_at before update on public.credit_card_profiles
for each row execute function public.set_updated_at();
create trigger credit_card_statements_set_updated_at before update on public.credit_card_statements
for each row execute function public.set_updated_at();
create trigger credit_card_purchase_plans_set_updated_at before update on public.credit_card_purchase_plans
for each row execute function public.set_updated_at();

create or replace function private.validate_credit_card_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.accounts account
    where account.id = new.account_id
      and account.user_id = new.user_id
      and account.account_type = 'credit'
      and not account.archived
  ) then
    raise exception 'credit card account is not available';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_credit_card_account() from public, anon, authenticated;
create trigger credit_card_profiles_validate_account
before insert or update on public.credit_card_profiles
for each row execute function private.validate_credit_card_account();

create trigger credit_card_profiles_capture_audit after insert or update or delete on public.credit_card_profiles
for each row execute function private.capture_finance_audit_event();
create trigger credit_card_statements_capture_audit after insert or update or delete on public.credit_card_statements
for each row execute function private.capture_finance_audit_event();
create trigger credit_card_purchase_plans_capture_audit after insert or update or delete on public.credit_card_purchase_plans
for each row execute function private.capture_finance_audit_event();

alter table public.credit_card_profiles enable row level security;
alter table public.credit_card_rate_periods enable row level security;
alter table public.credit_card_statements enable row level security;
alter table public.credit_card_purchase_plans enable row level security;
alter table public.credit_card_installments enable row level security;
alter table public.credit_card_payment_allocations enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'credit_card_profiles', 'credit_card_rate_periods', 'credit_card_statements',
    'credit_card_purchase_plans', 'credit_card_installments', 'credit_card_payment_allocations'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      table_name || '_owner', table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.is_current_user_allowed())) with check ((select public.is_current_user_allowed()))',
      table_name || '_private_access', table_name
    );
  end loop;
end;
$$;

revoke all on table public.credit_card_profiles, public.credit_card_rate_periods,
  public.credit_card_statements, public.credit_card_purchase_plans,
  public.credit_card_installments, public.credit_card_payment_allocations
from public, anon, authenticated;
grant select, insert, update, delete on table public.credit_card_profiles,
  public.credit_card_rate_periods, public.credit_card_statements,
  public.credit_card_purchase_plans, public.credit_card_installments,
  public.credit_card_payment_allocations to authenticated;

create or replace function public.upsert_credit_card_v1(
  p_operation_id uuid,
  p_account jsonb,
  p_card jsonb,
  p_expected_account_version bigint default null,
  p_expected_card_version bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_account public.accounts%rowtype;
  saved_card public.credit_card_profiles%rowtype;
  requested_account_id uuid := (p_account->>'id')::uuid;
  entity_id uuid := nullif(p_account->>'entity_id', '')::uuid;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or requested_account_id is null then raise exception 'operation and account are required'; end if;
  select result into prior_result from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'credit-card.upsert.v1';
  if found then return prior_result; end if;

  if trim(coalesce(p_account->>'name', '')) = '' then raise exception 'card name is required'; end if;
  if (p_account->>'currency_code') not in ('COP', 'USD') then raise exception 'unsupported account currency'; end if;
  if coalesce(p_account->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid card color'; end if;
  if entity_id is not null and not exists (
    select 1 from public.account_entities entity
    where entity.id = entity_id and entity.user_id = caller_id and not entity.archived
  ) then raise exception 'account entity is not available'; end if;

  select * into saved_account from public.accounts
  where id = requested_account_id and user_id = caller_id for update;

  if found then
    if p_expected_account_version is null or saved_account.version <> p_expected_account_version then
      raise exception 'card account was modified elsewhere';
    end if;
    if saved_account.currency_code is distinct from p_account->>'currency_code'
       and exists (select 1 from public.transactions where user_id = caller_id and account_id = saved_account.id) then
      raise exception 'account currency cannot change after it has movements';
    end if;
    update public.accounts set
      name = trim(p_account->>'name'), account_type = 'credit', color = p_account->>'color',
      icon = nullif(p_account->>'icon', ''), entity_id = entity_id,
      currency_code = p_account->>'currency_code', version = version + 1
    where id = requested_account_id and user_id = caller_id returning * into saved_account;
  else
    if p_expected_account_version is not null then raise exception 'card account is not available'; end if;
    insert into public.accounts (
      id, user_id, name, account_type, initial_balance, color, icon, currency_code,
      opening_balance_date, opening_exchange_rate, entity_id
    ) values (
      requested_account_id, caller_id, trim(p_account->>'name'), 'credit',
      -abs(coalesce((p_account->>'opening_debt')::numeric, 0)), p_account->>'color',
      nullif(p_account->>'icon', ''), p_account->>'currency_code',
      coalesce(nullif(p_account->>'opening_balance_date', '')::date, current_date),
      case when p_account->>'currency_code' = 'COP' then 1 else (p_account->>'opening_exchange_rate')::numeric end,
      entity_id
    ) returning * into saved_account;
  end if;

  select * into saved_card from public.credit_card_profiles
  where account_id = requested_account_id and user_id = caller_id for update;
  if found and (p_expected_card_version is null or saved_card.version <> p_expected_card_version) then
    raise exception 'card details were modified elsewhere';
  end if;

  insert into public.credit_card_profiles (
    account_id, user_id, network, last_four, credit_limit, cutoff_day, due_day,
    annual_fee, purchase_rate_ea, cash_advance_rate_ea
  ) values (
    requested_account_id, caller_id, coalesce(nullif(p_card->>'network', ''), 'other'),
    nullif(p_card->>'last_four', ''), (p_card->>'credit_limit')::numeric,
    (p_card->>'cutoff_day')::smallint, (p_card->>'due_day')::smallint,
    coalesce((p_card->>'annual_fee')::numeric, 0),
    nullif(p_card->>'purchase_rate_ea', '')::numeric,
    nullif(p_card->>'cash_advance_rate_ea', '')::numeric
  ) on conflict (account_id) do update set
    network = excluded.network, last_four = excluded.last_four,
    credit_limit = excluded.credit_limit, cutoff_day = excluded.cutoff_day,
    due_day = excluded.due_day, annual_fee = excluded.annual_fee,
    purchase_rate_ea = excluded.purchase_rate_ea,
    cash_advance_rate_ea = excluded.cash_advance_rate_ea,
    version = public.credit_card_profiles.version + 1
  where public.credit_card_profiles.user_id = caller_id
  returning * into saved_card;

  prior_result := jsonb_build_object(
    'accountId', saved_account.id, 'accountVersion', saved_account.version,
    'cardVersion', saved_card.version
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'credit-card.upsert.v1', prior_result);
  return prior_result;
end;
$$;

revoke all on function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint) from public, anon;
grant execute on function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint) to authenticated;

create or replace function public.create_credit_card_purchase_v1(
  p_operation_id uuid,
  p_transaction jsonb,
  p_plan jsonb,
  p_installments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  requested_transaction_id uuid := (p_transaction->>'id')::uuid;
  card_account_id uuid := (p_transaction->>'account_id')::uuid;
  requested_plan_id uuid := (p_plan->>'id')::uuid;
  transaction_amount numeric := (p_transaction->>'amount')::numeric;
  installment_count integer := (p_plan->>'installment_count')::integer;
  saved_installments integer;
  installment_principal numeric;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or requested_transaction_id is null or requested_plan_id is null then
    raise exception 'operation, transaction and plan are required';
  end if;
  select result into prior_result from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'credit-card.purchase.create.v1';
  if found then return prior_result; end if;

  if p_transaction->>'kind' <> 'expense' then raise exception 'a card purchase must be an expense'; end if;
  if transaction_amount is null or transaction_amount <= 0 then raise exception 'purchase amount must be positive'; end if;
  if not exists (
    select 1 from public.credit_card_profiles card
    where card.user_id = caller_id and card.account_id = card_account_id
  ) then raise exception 'credit card is not available'; end if;
  if jsonb_typeof(p_installments) <> 'array' or jsonb_array_length(p_installments) <> installment_count then
    raise exception 'installment schedule does not match its count';
  end if;
  select coalesce(sum(row.principal), 0), count(*)
  into installment_principal, saved_installments
  from jsonb_to_recordset(p_installments) as row(principal numeric);
  if abs(installment_principal - transaction_amount) > 0.01 then
    raise exception 'installment principal must equal the purchase amount';
  end if;

  insert into public.transactions (
    id, user_id, account_id, category_id, kind, amount, description, merchant,
    note, icon, occurred_on, native_currency_code, base_currency_code,
    base_amount, exchange_rate, exchange_rate_date, exchange_rate_source,
    reference_exchange_rate, reference_rate_source
  ) values (
    requested_transaction_id, caller_id, card_account_id,
    nullif(p_transaction->>'category_id', '')::uuid, 'expense', transaction_amount,
    p_transaction->>'description', nullif(p_transaction->>'merchant', ''),
    nullif(p_transaction->>'note', ''), nullif(p_transaction->>'icon', ''),
    (p_transaction->>'occurred_on')::date,
    nullif(p_transaction->>'native_currency_code', ''),
    nullif(p_transaction->>'base_currency_code', ''),
    nullif(p_transaction->>'base_amount', '')::numeric,
    nullif(p_transaction->>'exchange_rate', '')::numeric,
    nullif(p_transaction->>'exchange_rate_date', '')::date,
    nullif(p_transaction->>'exchange_rate_source', ''),
    nullif(p_transaction->>'reference_exchange_rate', '')::numeric,
    nullif(p_transaction->>'reference_rate_source', '')
  );

  insert into public.credit_card_purchase_plans (
    id, user_id, account_id, transaction_id, installment_count,
    financing_type, annual_effective_rate, first_due_on
  ) values (
    requested_plan_id, caller_id, card_account_id, requested_transaction_id, installment_count,
    p_plan->>'financing_type', nullif(p_plan->>'annual_effective_rate', '')::numeric,
    (p_plan->>'first_due_on')::date
  );

  insert into public.credit_card_installments (
    id, user_id, plan_id, installment_number, due_on, principal,
    estimated_interest, estimated_fee
  )
  select row.id, caller_id, requested_plan_id, row.installment_number, row.due_on,
    row.principal, coalesce(row.estimated_interest, 0), coalesce(row.estimated_fee, 0)
  from jsonb_to_recordset(p_installments) as row(
    id uuid, installment_number smallint, due_on date, principal numeric,
    estimated_interest numeric, estimated_fee numeric
  );

  prior_result := jsonb_build_object(
    'transactionId', requested_transaction_id, 'planId', requested_plan_id,
    'installmentCount', saved_installments
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'credit-card.purchase.create.v1', prior_result);
  return prior_result;
end;
$$;

revoke all on function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on table public.credit_card_profiles is
  'Non-sensitive credit-card metadata attached to an account. Never stores a full PAN, CVV, PIN, credential or document.';
comment on table public.credit_card_purchase_plans is
  'Installment plan metadata. The full purchase remains the ledger expense; installments are future commitments and never duplicate that expense.';
comment on table public.credit_card_statements is
  'Authoritative statement snapshots only after user reconciliation; live UI estimates remain derived from ledger movements.';
