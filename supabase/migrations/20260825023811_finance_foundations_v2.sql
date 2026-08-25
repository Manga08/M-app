-- Moneva finance foundations v2
--
-- This migration is intentionally additive. Existing screens keep their stable
-- API while the database gains explicit ownership links, immutable FX snapshots,
-- idempotent mutation receipts, an event ledger, valuations and ingestion drafts.

set lock_timeout = '10s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- Profile and account foundations
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists schema_version integer not null default 2,
  add constraint profiles_schema_version_check check (schema_version between 1 and 100);

alter table public.accounts
  add column if not exists currency_code text,
  add column if not exists expected_annual_return numeric(12, 8),
  add column if not exists version bigint not null default 1,
  add column if not exists archived_at timestamptz;

update public.accounts account
set currency_code = coalesce(profile.currency_code, 'COP')
from public.profiles profile
where profile.id = account.user_id
  and account.currency_code is null;

update public.accounts
set currency_code = 'COP'
where currency_code is null;

alter table public.accounts
  alter column currency_code set not null,
  alter column currency_code set default 'COP',
  add constraint accounts_currency_code_check check (currency_code ~ '^[A-Z]{3}$'),
  add constraint accounts_expected_return_check check (
    expected_annual_return is null
    or expected_annual_return between -100 and 1000
  ),
  add constraint accounts_version_check check (version > 0),
  add constraint accounts_archive_timestamp_check check (
    (archived and archived_at is not null) or (not archived and archived_at is null)
  );

comment on column public.accounts.currency_code is
  'ISO 4217 currency of the account. Historical movements retain their own currency snapshot.';
comment on column public.accounts.expected_annual_return is
  'Optional projection assumption only. It never mutates balances or creates real income.';

-- ---------------------------------------------------------------------------
-- Explicit main-category relationship (legacy group_key remains compatible)
-- ---------------------------------------------------------------------------

alter table public.group_allocations
  add constraint group_allocations_user_id_id_key unique (user_id, id);

alter table public.categories
  add column if not exists main_category_id uuid;

update public.categories category
set main_category_id = main_category.id
from public.group_allocations main_category
where category.user_id = main_category.user_id
  and category.transaction_kind = 'expense'
  and category.category_group = main_category.group_key
  and category.main_category_id is null;

alter table public.categories
  add constraint categories_main_category_owner_fkey
    foreign key (user_id, main_category_id)
    references public.group_allocations (user_id, id)
    on delete restrict,
  add constraint categories_main_category_shape_check check (
    (transaction_kind = 'income' and main_category_id is null and category_group = 'income')
    or
    (transaction_kind = 'expense' and main_category_id is not null and category_group <> 'income')
  );

create index categories_user_main_category_active_idx
  on public.categories (user_id, main_category_id, sort_order, id)
  where archived = false and transaction_kind = 'expense';

create or replace function private.assign_category_main_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transaction_kind = 'income' then
    new.category_group := 'income';
    new.main_category_id := null;
    return new;
  end if;

  select main_category.id
  into new.main_category_id
  from public.group_allocations main_category
  where main_category.user_id = new.user_id
    and main_category.group_key = new.category_group
    and main_category.archived = false;

  if new.main_category_id is null then
    raise exception 'the selected main category is not available';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_assign_main_category on public.categories;
create trigger categories_assign_main_category
before insert or update of user_id, category_group, transaction_kind
on public.categories
for each row execute function private.assign_category_main_category();

create or replace view public.main_categories
with (security_invoker = true)
as
select
  id,
  user_id,
  group_key as key,
  name,
  color,
  icon,
  target_percent,
  included_in_plan,
  sort_order,
  archived,
  is_default,
  created_at,
  updated_at
from public.group_allocations;

revoke all on public.main_categories from public, anon, authenticated;
grant select on public.main_categories to authenticated;

comment on table public.group_allocations is
  'Canonical main finance categories and their current allocation. The legacy name is retained for API compatibility.';
comment on view public.main_categories is
  'Stable, security-invoker vocabulary for main categories.';
comment on column public.categories.main_category_id is
  'Owner-safe FK to the main category. category_group is retained as a compatibility key.';

-- ---------------------------------------------------------------------------
-- Ledger events and immutable monetary snapshots
-- ---------------------------------------------------------------------------

create table public.ledger_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('income', 'expense', 'transfer', 'adjustment')),
  occurred_on date not null default current_date,
  description text not null check (char_length(description) between 1 and 200),
  merchant text check (merchant is null or char_length(merchant) <= 120),
  note text check (note is null or char_length(note) <= 1000),
  source text not null default 'manual' check (source in ('manual', 'recurring', 'import', 'ocr', 'ai', 'system')),
  idempotency_key uuid not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, idempotency_key)
);

alter table public.transactions
  add column if not exists ledger_event_id uuid,
  add column if not exists native_currency_code text,
  add column if not exists base_currency_code text,
  add column if not exists base_amount numeric,
  add column if not exists exchange_rate numeric,
  add column if not exists exchange_rate_date date,
  add column if not exists exchange_rate_source text,
  add column if not exists version bigint not null default 1;

update public.transactions transaction
set native_currency_code = coalesce(account.currency_code, 'COP'),
    base_currency_code = coalesce(profile.currency_code, account.currency_code, 'COP'),
    exchange_rate = 1,
    exchange_rate_date = transaction.occurred_on,
    exchange_rate_source = 'same_currency',
    base_amount = transaction.amount
from public.accounts account
join public.profiles profile on profile.id = account.user_id
where account.user_id = transaction.user_id
  and account.id = transaction.account_id
  and transaction.native_currency_code is null;

insert into public.ledger_events (
  id, user_id, event_type, occurred_on, description, merchant, note, source,
  idempotency_key, created_at, updated_at
)
select
  coalesce(transaction.transfer_group_id, transaction.id),
  transaction.user_id,
  case
    when transaction.kind = 'income' then 'income'
    when transaction.kind = 'expense' then 'expense'
    else 'transfer'
  end,
  min(transaction.occurred_on),
  min(transaction.description),
  min(transaction.merchant),
  min(transaction.note),
  case when bool_or(transaction.recurring_occurrence_id is not null) then 'recurring' else 'manual' end,
  coalesce(transaction.transfer_group_id, transaction.id),
  min(transaction.created_at),
  max(transaction.updated_at)
from public.transactions transaction
group by
  coalesce(transaction.transfer_group_id, transaction.id),
  transaction.user_id,
  case
    when transaction.kind = 'income' then 'income'
    when transaction.kind = 'expense' then 'expense'
    else 'transfer'
  end
on conflict (id) do nothing;

update public.transactions
set ledger_event_id = coalesce(transfer_group_id, id)
where ledger_event_id is null;

alter table public.transactions
  alter column ledger_event_id set not null,
  alter column native_currency_code set not null,
  alter column base_currency_code set not null,
  alter column base_amount set not null,
  alter column exchange_rate set not null,
  alter column exchange_rate_date set not null,
  alter column exchange_rate_source set not null,
  add constraint transactions_ledger_event_owner_fkey
    foreign key (user_id, ledger_event_id)
    references public.ledger_events (user_id, id)
    on delete cascade,
  add constraint transactions_currency_codes_check check (
    native_currency_code ~ '^[A-Z]{3}$' and base_currency_code ~ '^[A-Z]{3}$'
  ),
  add constraint transactions_base_amount_check check (base_amount > 0),
  add constraint transactions_exchange_rate_check check (exchange_rate > 0),
  add constraint transactions_exchange_rate_source_check check (
    exchange_rate_source in ('same_currency', 'manual', 'provider', 'imported')
  ),
  add constraint transactions_version_check check (version > 0),
  add constraint transactions_event_shape_check check (
    ledger_event_id = coalesce(transfer_group_id, id)
  );

create index ledger_events_user_timeline_idx
  on public.ledger_events (user_id, occurred_on desc, created_at desc, id);
create index transactions_user_event_idx
  on public.transactions (user_id, ledger_event_id);

create trigger ledger_events_set_updated_at
before update on public.ledger_events
for each row execute function public.set_updated_at();

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

  new.native_currency_code := coalesce(new.native_currency_code, account_currency);
  new.base_currency_code := coalesce(new.base_currency_code, reporting_currency, account_currency);
  new.exchange_rate := coalesce(
    new.exchange_rate,
    case when new.native_currency_code = new.base_currency_code then 1 else null end
  );
  if new.exchange_rate is null or new.exchange_rate <= 0 then
    raise exception 'a positive exchange rate is required for different currencies';
  end if;
  if tg_op = 'UPDATE'
    and (new.amount is distinct from old.amount or new.exchange_rate is distinct from old.exchange_rate)
    and new.base_amount is not distinct from old.base_amount
  then
    new.base_amount := round(new.amount * new.exchange_rate, 8);
  else
    new.base_amount := coalesce(new.base_amount, round(new.amount * new.exchange_rate, 8));
  end if;
  new.exchange_rate_date := coalesce(new.exchange_rate_date, new.occurred_on);
  new.exchange_rate_source := coalesce(
    new.exchange_rate_source,
    case when new.native_currency_code = new.base_currency_code then 'same_currency' else 'manual' end
  );
  new.ledger_event_id := coalesce(new.transfer_group_id, new.id);

  expected_event_type := case
    when new.kind = 'income' then 'income'
    when new.kind = 'expense' then 'expense'
    else 'transfer'
  end;

  insert into public.ledger_events (
    id, user_id, event_type, occurred_on, description, merchant, note, source, idempotency_key
  ) values (
    new.ledger_event_id,
    new.user_id,
    expected_event_type,
    new.occurred_on,
    new.description,
    new.merchant,
    new.note,
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

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger transactions_prepare_ledger
before insert or update on public.transactions
for each row execute function private.prepare_transaction_ledger();

create or replace function private.validate_transfer_group_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  checked_user uuid := coalesce(new.user_id, old.user_id);
  checked_group uuid := coalesce(new.transfer_group_id, old.transfer_group_id);
  row_count integer;
  out_count integer;
  in_count integer;
  account_count integer;
  event_count integer;
  min_base numeric;
  max_base numeric;
begin
  if checked_group is null then return null; end if;

  select
    count(*),
    count(*) filter (where kind = 'transfer_out'),
    count(*) filter (where kind = 'transfer_in'),
    count(distinct account_id),
    count(distinct ledger_event_id),
    min(base_amount),
    max(base_amount)
  into row_count, out_count, in_count, account_count, event_count, min_base, max_base
  from public.transactions
  where user_id = checked_user and transfer_group_id = checked_group;

  if row_count = 0 then return null; end if;
  if row_count <> 2 or out_count <> 1 or in_count <> 1 or account_count <> 2 or event_count <> 1 then
    raise exception 'a transfer must contain one outgoing and one incoming posting on different accounts';
  end if;
  if abs(min_base - max_base) > 0.00000001 then
    raise exception 'both transfer postings must represent the same reporting-currency amount';
  end if;
  return null;
end;
$$;

create constraint trigger transactions_transfer_group_v2_check
after insert or update or delete on public.transactions
deferrable initially deferred
for each row execute function private.validate_transfer_group_v2();

-- ---------------------------------------------------------------------------
-- Future-safe exchange rates, valuations and ingestion drafts
-- ---------------------------------------------------------------------------

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  base_currency_code text not null check (base_currency_code ~ '^[A-Z]{3}$'),
  quote_currency_code text not null check (quote_currency_code ~ '^[A-Z]{3}$'),
  rate_date date not null,
  rate numeric not null check (rate > 0),
  source text not null check (source in ('provider', 'manual', 'imported')),
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base_currency_code <> quote_currency_code),
  check ((source = 'manual' and user_id is not null) or source <> 'manual')
);

create unique index exchange_rates_system_unique_idx
  on public.exchange_rates (base_currency_code, quote_currency_code, rate_date, source, coalesce(provider, ''))
  where user_id is null;
create unique index exchange_rates_user_unique_idx
  on public.exchange_rates (user_id, base_currency_code, quote_currency_code, rate_date)
  where user_id is not null;
create index exchange_rates_lookup_idx
  on public.exchange_rates (base_currency_code, quote_currency_code, rate_date desc);

create table public.account_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  valued_on date not null,
  amount numeric not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  source text not null default 'manual' check (source in ('manual', 'imported', 'provider')),
  note text check (note is null or char_length(note) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id, valued_on, source),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete cascade
);

create index account_valuations_timeline_idx
  on public.account_valuations (user_id, account_id, valued_on desc, id);

create trigger exchange_rates_set_updated_at
before update on public.exchange_rates
for each row execute function public.set_updated_at();
create trigger account_valuations_set_updated_at
before update on public.account_valuations
for each row execute function public.set_updated_at();

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_kind text not null check (media_kind in ('image', 'audio', 'pdf', 'xlsx')),
  status text not null default 'draft' check (status in ('draft', 'processing', 'review', 'confirmed', 'failed', 'discarded')),
  storage_path text,
  extracted_candidate jsonb,
  confidence numeric check (confidence is null or confidence between 0 and 1),
  parser_version text,
  idempotency_key uuid not null,
  retained_until timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, idempotency_key),
  check (storage_path is null or storage_path like user_id::text || '/%')
);

create index ingestion_jobs_user_status_idx
  on public.ingestion_jobs (user_id, status, created_at desc);
create index ingestion_jobs_retention_idx
  on public.ingestion_jobs (retained_until)
  where retained_until is not null and status in ('confirmed', 'failed', 'discarded');

create trigger ingestion_jobs_set_updated_at
before update on public.ingestion_jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Idempotent operations and append-only audit history
-- ---------------------------------------------------------------------------

create table public.mutation_receipts (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 100),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index mutation_receipts_user_created_idx
  on public.mutation_receipts (user_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  previous_data jsonb,
  next_data jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_user_timeline_idx
  on public.audit_events (user_id, occurred_at desc, id desc);

create or replace function private.capture_finance_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := coalesce((to_jsonb(new)->>'user_id')::uuid, (to_jsonb(old)->>'user_id')::uuid);
  row_id uuid := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid, (to_jsonb(new)->>'target_id')::uuid, (to_jsonb(old)->>'target_id')::uuid);
begin
  if owner_id is null then return coalesce(new, old); end if;
  insert into public.audit_events (user_id, entity_type, entity_id, action, previous_data, next_data)
  values (
    owner_id,
    tg_table_name,
    row_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_finance_audit_event() from public, anon, authenticated, service_role;

create trigger accounts_capture_audit
after insert or update or delete on public.accounts
for each row execute function private.capture_finance_audit_event();
create trigger categories_capture_audit
after insert or update or delete on public.categories
for each row execute function private.capture_finance_audit_event();
create trigger main_categories_capture_audit
after insert or update or delete on public.group_allocations
for each row execute function private.capture_finance_audit_event();
create trigger transactions_capture_audit
after insert or update or delete on public.transactions
for each row execute function private.capture_finance_audit_event();
create trigger financial_targets_capture_audit
after insert or update or delete on public.financial_targets
for each row execute function private.capture_finance_audit_event();

-- ---------------------------------------------------------------------------
-- Atomic public APIs used by the durable client queue
-- ---------------------------------------------------------------------------

create or replace function public.upsert_transactions_v2(
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
  where operation_id = p_operation_id and user_id = caller_id and operation = 'transactions.upsert';
  if found then return coalesce(prior_count, 0); end if;

  if jsonb_typeof(p_transactions) <> 'array' or jsonb_array_length(p_transactions) not between 1 and 1000 then
    raise exception 'transactions must contain between 1 and 1000 rows';
  end if;

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
    row.transfer_group_id,
    row.description,
    row.merchant,
    row.note,
    row.icon,
    row.recurring_occurrence_id,
    row.financial_target_id,
    row.financial_target_effect,
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
    transfer_group_id uuid,
    description text,
    merchant text,
    note text,
    icon text,
    recurring_occurrence_id uuid,
    financial_target_id uuid,
    financial_target_effect text,
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
    transfer_group_id = excluded.transfer_group_id,
    description = excluded.description,
    merchant = excluded.merchant,
    note = excluded.note,
    icon = excluded.icon,
    recurring_occurrence_id = excluded.recurring_occurrence_id,
    financial_target_id = excluded.financial_target_id,
    financial_target_effect = excluded.financial_target_effect,
    occurred_on = excluded.occurred_on,
    native_currency_code = excluded.native_currency_code,
    base_currency_code = excluded.base_currency_code,
    base_amount = excluded.base_amount,
    exchange_rate = excluded.exchange_rate,
    exchange_rate_date = excluded.exchange_rate_date,
    exchange_rate_source = excluded.exchange_rate_source
  where public.transactions.user_id = caller_id;

  get diagnostics saved_count = row_count;
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'transactions.upsert', jsonb_build_object('count', saved_count));
  return saved_count;
end;
$$;

create or replace function public.delete_transactions_v2(
  p_operation_id uuid,
  p_transaction_id uuid,
  p_transfer_group_id uuid default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  deleted_count integer;
  prior_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or p_transaction_id is null then raise exception 'operation and transaction are required'; end if;
  select (result->>'count')::integer into prior_count
  from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'transactions.delete';
  if found then return coalesce(prior_count, 0); end if;

  if p_transfer_group_id is null then
    delete from public.transactions where id = p_transaction_id and user_id = caller_id;
  else
    delete from public.transactions where transfer_group_id = p_transfer_group_id and user_id = caller_id;
  end if;
  get diagnostics deleted_count = row_count;

  delete from public.ledger_events event
  where event.user_id = caller_id
    and not exists (
      select 1 from public.transactions transaction
      where transaction.user_id = caller_id and transaction.ledger_event_id = event.id
    );

  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'transactions.delete', jsonb_build_object('count', deleted_count));
  return deleted_count;
end;
$$;

create or replace function public.upsert_financial_target_v2(
  p_operation_id uuid,
  p_target jsonb,
  p_debt jsonb default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_target_id uuid := (p_target->>'id')::uuid;
  prior_id uuid;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or saved_target_id is null then raise exception 'operation and target are required'; end if;

  select (result->>'id')::uuid into prior_id
  from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'financial_target.upsert';
  if found then return prior_id; end if;

  insert into public.financial_targets (
    id, user_id, mode, kind, status, title, description, target_amount,
    initial_progress, starts_on, target_date, priority, color, icon, cover_path,
    account_id, category_id, tracking_mode, completed_at, archived_at
  ) values (
    saved_target_id,
    caller_id,
    p_target->>'mode',
    p_target->>'kind',
    p_target->>'status',
    p_target->>'title',
    nullif(p_target->>'description', ''),
    (p_target->>'target_amount')::numeric,
    coalesce((p_target->>'initial_progress')::numeric, 0),
    (p_target->>'starts_on')::date,
    nullif(p_target->>'target_date', '')::date,
    coalesce((p_target->>'priority')::smallint, 3),
    p_target->>'color',
    p_target->>'icon',
    nullif(p_target->>'cover_path', ''),
    nullif(p_target->>'account_id', '')::uuid,
    nullif(p_target->>'category_id', '')::uuid,
    p_target->>'tracking_mode',
    nullif(p_target->>'completed_at', '')::timestamptz,
    nullif(p_target->>'archived_at', '')::timestamptz
  )
  on conflict (id) do update set
    mode = excluded.mode,
    kind = excluded.kind,
    status = excluded.status,
    title = excluded.title,
    description = excluded.description,
    target_amount = excluded.target_amount,
    initial_progress = excluded.initial_progress,
    starts_on = excluded.starts_on,
    target_date = excluded.target_date,
    priority = excluded.priority,
    color = excluded.color,
    icon = excluded.icon,
    cover_path = excluded.cover_path,
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    tracking_mode = excluded.tracking_mode,
    completed_at = excluded.completed_at,
    archived_at = excluded.archived_at
  where public.financial_targets.user_id = caller_id;

  if p_target->>'kind' = 'debt' and p_debt is not null then
    insert into public.financial_target_debt_details (
      target_id, user_id, creditor, annual_interest_rate, minimum_payment, due_day
    ) values (
      saved_target_id,
      caller_id,
      nullif(p_debt->>'creditor', ''),
      nullif(p_debt->>'annual_interest_rate', '')::numeric,
      nullif(p_debt->>'minimum_payment', '')::numeric,
      nullif(p_debt->>'due_day', '')::smallint
    )
    on conflict (target_id) do update set
      creditor = excluded.creditor,
      annual_interest_rate = excluded.annual_interest_rate,
      minimum_payment = excluded.minimum_payment,
      due_day = excluded.due_day
    where public.financial_target_debt_details.user_id = caller_id;
  else
    delete from public.financial_target_debt_details
    where public.financial_target_debt_details.target_id = saved_target_id
      and public.financial_target_debt_details.user_id = caller_id;
  end if;

  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'financial_target.upsert', jsonb_build_object('id', saved_target_id));
  return saved_target_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and least-privilege grants
-- ---------------------------------------------------------------------------

alter table public.ledger_events enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.account_valuations enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.mutation_receipts enable row level security;
alter table public.audit_events enable row level security;

create policy ledger_events_owner on public.ledger_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy ledger_events_private_access on public.ledger_events
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

create policy exchange_rates_select on public.exchange_rates
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy exchange_rates_insert on public.exchange_rates
  for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy exchange_rates_update on public.exchange_rates
  for update to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy exchange_rates_delete on public.exchange_rates
  for delete to authenticated
  using (user_id = (select auth.uid()) and source = 'manual');
create policy exchange_rates_private_access on public.exchange_rates
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

create policy account_valuations_owner on public.account_valuations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy account_valuations_private_access on public.account_valuations
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

create policy ingestion_jobs_owner on public.ingestion_jobs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy ingestion_jobs_private_access on public.ingestion_jobs
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

create policy mutation_receipts_owner on public.mutation_receipts
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy mutation_receipts_insert_owner on public.mutation_receipts
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy mutation_receipts_private_access on public.mutation_receipts
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

create policy audit_events_owner on public.audit_events
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy audit_events_private_access on public.audit_events
  as restrictive for select to authenticated
  using ((select public.is_current_user_allowed()));

revoke all on public.ledger_events, public.exchange_rates, public.account_valuations,
  public.ingestion_jobs, public.mutation_receipts, public.audit_events
  from public, anon, authenticated;
grant select, insert, update, delete on public.ledger_events, public.exchange_rates,
  public.account_valuations, public.ingestion_jobs to authenticated;
grant select, insert on public.mutation_receipts to authenticated;
grant select on public.audit_events to authenticated;

revoke all on function public.upsert_transactions_v2(uuid, jsonb) from public, anon;
revoke all on function public.delete_transactions_v2(uuid, uuid, uuid) from public, anon;
revoke all on function public.upsert_financial_target_v2(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.upsert_transactions_v2(uuid, jsonb) to authenticated;
grant execute on function public.delete_transactions_v2(uuid, uuid, uuid) to authenticated;
grant execute on function public.upsert_financial_target_v2(uuid, jsonb, jsonb) to authenticated;

-- Redundant with unique indexes / reverse btree scans.
drop index if exists public.group_allocations_user_idx;
drop index if exists public.monthly_budget_plans_user_month_idx;
drop index if exists public.recurring_occurrences_rule_calendar_idx;

comment on table public.ledger_events is
  'Financial event header. transactions are its account postings and retain compatibility fields for current reports.';
comment on column public.transactions.base_amount is
  'Immutable amount converted to the user reporting currency at posting time.';
comment on table public.account_valuations is
  'Observed account values. Projection assumptions remain separate on accounts.';
comment on table public.ingestion_jobs is
  'Human-reviewed ingestion drafts. Automated parsers must not write ledger postings directly.';
comment on table public.audit_events is
  'Append-only per-user history of financial mutations.';
