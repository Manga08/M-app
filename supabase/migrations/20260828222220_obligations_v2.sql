-- Unified obligations engine. Accounts and their ledger postings remain the
-- only source of truth for balances. Everything below describes contracts,
-- due items and allocation metadata; none of these tables stores current debt.

set lock_timeout = '10s';
set statement_timeout = '120s';

create table public.liabilities (
  account_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('credit_card', 'loan', 'personal_debt', 'bnpl', 'revolving_credit', 'other')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'settled', 'archived')),
  creditor_name text check (creditor_name is null or char_length(creditor_name) <= 120),
  original_principal numeric(20, 2) check (original_principal is null or original_principal >= 0),
  originated_on date,
  maturity_on date,
  legacy_target_id uuid,
  migration_status text not null default 'native'
    check (migration_status in ('native', 'migrated', 'needs_review')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id),
  unique (user_id, legacy_target_id),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade,
  foreign key (user_id, legacy_target_id)
    references public.financial_targets (user_id, id)
    on delete set null (legacy_target_id),
  check (maturity_on is null or originated_on is null or maturity_on >= originated_on)
);

create table public.liability_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  starts_on date not null,
  ends_on date,
  payment_frequency text not null default 'monthly'
    check (payment_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'irregular')),
  interval_count smallint not null default 1 check (interval_count between 1 and 365),
  calculation_method text not null default 'manual'
    check (calculation_method in ('simple', 'amortized', 'revolving', 'statement_balance', 'manual')),
  amortization_method text not null default 'manual'
    check (amortization_method in ('constant_payment', 'constant_principal', 'interest_only', 'balloon', 'manual')),
  statement_cutoff_day smallint check (statement_cutoff_day is null or statement_cutoff_day between 1 and 31),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  first_due_on date,
  installment_count integer check (installment_count is null or installment_count between 1 and 1200),
  scheduled_payment numeric(20, 2) check (scheduled_payment is null or scheduled_payment >= 0),
  contractual_minimum numeric(20, 2) check (contractual_minimum is null or contractual_minimum >= 0),
  periodic_fee numeric(20, 2) not null default 0 check (periodic_fee >= 0),
  periodic_insurance numeric(20, 2) not null default 0 check (periodic_insurance >= 0),
  variable_rate boolean not null default false,
  index_name text check (index_name is null or char_length(index_name) <= 80),
  spread_rate numeric(12, 8) check (spread_rate is null or spread_rate between -1000 and 1000),
  prepayment_strategy text not null default 'manual'
    check (prepayment_strategy in ('reduce_term', 'reduce_payment', 'manual')),
  source text not null default 'manual' check (source in ('manual', 'statement', 'issuer', 'migration')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id, starts_on),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on),
  check ((variable_rate and index_name is not null) or (not variable_rate and index_name is null and spread_rate is null))
);

create table public.liability_rate_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  rate_kind text not null
    check (rate_kind in ('principal', 'purchase', 'cash_advance', 'late', 'other')),
  rate_basis text not null
    check (rate_basis in ('effective_annual', 'nominal_annual', 'monthly', 'fixed_amount')),
  reported_value numeric(20, 8) not null check (reported_value >= 0),
  effective_annual_rate numeric(12, 8)
    check (effective_annual_rate is null or effective_annual_rate between 0 and 1000),
  starts_on date not null,
  ends_on date,
  source text not null default 'manual' check (source in ('manual', 'statement', 'issuer', 'migration')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id, rate_kind, starts_on),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on),
  check (
    (rate_basis = 'fixed_amount' and effective_annual_rate is null)
    or rate_basis <> 'fixed_amount'
  )
);

create table public.liability_obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  kind text not null check (kind in ('credit_card_statement', 'loan_installment', 'manual_due')),
  sequence_number integer check (sequence_number is null or sequence_number > 0),
  period_start date,
  period_end date,
  due_on date not null,
  principal_due numeric(20, 2) not null default 0 check (principal_due >= 0),
  interest_due numeric(20, 2) not null default 0 check (interest_due >= 0),
  fee_due numeric(20, 2) not null default 0 check (fee_due >= 0),
  minimum_due numeric(20, 2) not null default 0 check (minimum_due >= 0),
  total_due numeric(20, 2) not null check (total_due >= 0),
  status text not null default 'open'
    check (status in ('projected', 'open', 'due', 'partial', 'paid', 'overdue', 'waived', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'statement', 'contract', 'migration')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id, kind, due_on, sequence_number),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  check (period_end is null or period_start is null or period_end >= period_start),
  check (minimum_due <= total_due)
);

create table public.liability_event_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ledger_event_id uuid not null,
  account_id uuid not null,
  role text not null
    check (role in ('purchase', 'drawdown', 'payment', 'interest', 'fee', 'refund', 'cash_advance', 'forgiveness', 'adjustment')),
  related_ledger_event_id uuid,
  related_obligation_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, ledger_event_id, account_id),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  foreign key (user_id, ledger_event_id)
    references public.ledger_events (user_id, id) on delete cascade,
  foreign key (user_id, related_ledger_event_id)
    references public.ledger_events (user_id, id) on delete restrict,
  foreign key (user_id, related_obligation_id)
    references public.liability_obligations (user_id, id) on delete cascade
    deferrable initially deferred,
  check (related_ledger_event_id is null or related_ledger_event_id <> ledger_event_id)
);

create table public.liability_payment_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  funding_account_id uuid not null,
  strategy text not null check (strategy in ('fixed', 'minimum_due', 'statement_total', 'current_balance')),
  fixed_amount numeric(20, 2) check (fixed_amount is null or fixed_amount > 0),
  maximum_amount numeric(20, 2) check (maximum_amount is null or maximum_amount > 0),
  days_before_due smallint not null default 0 check (days_before_due between 0 and 30),
  recording_mode text not null default 'manual'
    check (recording_mode in ('manual', 'auto_post')),
  active boolean not null default true,
  -- Internal lifecycle marker. It lets a paused target restore only the rule
  -- that Moneva paused, without re-enabling a rule the user disabled.
  suspended_by_target boolean not null default false,
  -- A detached rule is retained only for historical intents/audit. It is not
  -- presented as the current payment setup and can never be materialized.
  detached_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, account_id),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  foreign key (user_id, funding_account_id)
    references public.accounts (user_id, id) on delete restrict,
  check (funding_account_id <> account_id),
  check ((strategy = 'fixed' and fixed_amount is not null) or (strategy <> 'fixed' and fixed_amount is null))
);

create table public.liability_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  rule_id uuid,
  obligation_id uuid,
  scheduled_for date not null,
  planned_amount numeric(20, 2) not null check (planned_amount >= 0),
  status text not null default 'planned'
    check (status in ('planned', 'needs_confirmation', 'confirmed', 'posted', 'skipped', 'failed', 'cancelled')),
  suspended_by_target boolean not null default false,
  -- Distinguishes a safe payment-source detach from an explicit user
  -- cancellation. A later reattach may only revive intents with this marker.
  detached_by_rule boolean not null default false,
  ledger_event_id uuid,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, rule_id, obligation_id),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  foreign key (user_id, rule_id)
    references public.liability_payment_rules (user_id, id) on delete cascade,
  foreign key (user_id, obligation_id)
    references public.liability_obligations (user_id, id) on delete cascade,
  foreign key (user_id, ledger_event_id)
    references public.ledger_events (user_id, id) on delete restrict,
  check (rule_id is not null or obligation_id is not null),
  check ((status = 'posted' and ledger_event_id is not null) or status <> 'posted')
);

create table public.liability_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  obligation_id uuid not null,
  ledger_event_id uuid not null,
  amount numeric(20, 2) not null check (amount > 0),
  allocated_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, obligation_id, ledger_event_id),
  foreign key (user_id, account_id)
    references public.liabilities (user_id, account_id) on delete cascade,
  foreign key (user_id, obligation_id)
    references public.liability_obligations (user_id, id) on delete cascade,
  foreign key (user_id, ledger_event_id)
    references public.ledger_events (user_id, id) on delete restrict
);

-- Recurring movements existed before obligations V2. The marker keeps target
-- pause/resume reversible without reviving a rule or occurrence that the user
-- had already stopped independently.
alter table public.recurring_rules
  add column suspended_by_target boolean not null default false;
alter table public.recurring_occurrences
  add column suspended_by_target boolean not null default false;

-- Reconcile schedules that already belonged to a non-active target before this
-- migration. Without this one-time pass an old planned occurrence could still
-- post even though the target is paused, completed or archived.
with stopped_occurrences as (
  select distinct occurrence.user_id, occurrence.id
  from public.recurring_occurrences occurrence
  join public.recurring_rules rule
    on rule.user_id = occurrence.user_id and rule.id = occurrence.rule_id
  join public.financial_targets target
    on target.user_id = occurrence.user_id
   and target.id in (occurrence.financial_target_id, rule.financial_target_id)
  where target.status <> 'active' and occurrence.status = 'planned'
)
update public.recurring_occurrences occurrence
set status = 'cancelled', suspended_by_target = true, failure_reason = null
from stopped_occurrences stopped
where occurrence.user_id = stopped.user_id and occurrence.id = stopped.id;

update public.recurring_rules rule
set status = case when target.status = 'paused' then 'paused' else 'archived' end,
    active = false,
    suspended_by_target = true
from public.financial_targets target
where target.user_id = rule.user_id and target.id = rule.financial_target_id
  and target.status <> 'active' and rule.status = 'active';

create index liabilities_user_status_kind_idx
  on public.liabilities (user_id, status, kind, updated_at desc);
create index liability_terms_account_timeline_idx
  on public.liability_terms (user_id, account_id, starts_on desc);
create index liability_rate_periods_current_idx
  on public.liability_rate_periods (user_id, account_id, rate_kind, starts_on desc);
create index liability_obligations_due_idx
  on public.liability_obligations (user_id, due_on, status)
  where status in ('projected', 'open', 'due', 'partial', 'overdue');
create index liability_obligations_account_timeline_idx
  on public.liability_obligations (user_id, account_id, due_on desc, id);
create index liability_event_metadata_account_idx
  on public.liability_event_metadata (user_id, account_id, role, ledger_event_id);
create index liability_event_metadata_obligation_idx
  on public.liability_event_metadata (user_id, related_obligation_id, role, ledger_event_id)
  where related_obligation_id is not null;
create index liability_payment_rules_active_idx
  on public.liability_payment_rules (user_id, account_id) where active;
create index liability_payment_intents_due_idx
  on public.liability_payment_intents (user_id, scheduled_for, status)
  where status in ('planned', 'confirmed', 'failed');
create index liability_payment_allocations_obligation_idx
  on public.liability_payment_allocations (user_id, obligation_id, allocated_on desc);

create unique index liability_payment_intents_rule_obligation_unique_idx
  on public.liability_payment_intents (user_id, rule_id, obligation_id)
  where rule_id is not null and obligation_id is not null;
-- An unassigned intent is a mutable prompt, not a confirmed obligation. Keep
-- at most one active prompt per rule; posted history may retain the same date.
create unique index liability_payment_intents_rule_unassigned_active_unique_idx
  on public.liability_payment_intents (user_id, rule_id)
  where rule_id is not null and obligation_id is null
    and status in ('planned', 'needs_confirmation', 'confirmed', 'failed');

-- ---------------------------------------------------------------------------
-- Cross-table invariants and compatibility adapters
-- ---------------------------------------------------------------------------

create trigger liabilities_set_updated_at before update on public.liabilities
for each row execute function public.set_updated_at();
create trigger liability_terms_set_updated_at before update on public.liability_terms
for each row execute function public.set_updated_at();
create trigger liability_obligations_set_updated_at before update on public.liability_obligations
for each row execute function public.set_updated_at();
create trigger liability_payment_rules_set_updated_at before update on public.liability_payment_rules
for each row execute function public.set_updated_at();
create trigger liability_payment_intents_set_updated_at before update on public.liability_payment_intents
for each row execute function public.set_updated_at();

create or replace function private.validate_liability_account_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.accounts account
    where account.user_id = new.user_id
      and account.id = new.account_id
      and account.account_type = 'credit'
  ) then
    raise exception 'liability account must be an owned credit account';
  end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on function private.validate_liability_account_v2() from public, anon, authenticated;

create trigger liabilities_validate_account
before insert or update on public.liabilities
for each row execute function private.validate_liability_account_v2();

create or replace function private.protect_liability_account_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_liability boolean := false;
begin
  -- Public RPCs execute as their SECURITY DEFINER owner, while direct Data API
  -- mutations execute as `authenticated`. This keeps ordinary asset-account
  -- editing intact but forces every liability mutation through its atomic RPC.
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' and new.account_type = 'credit' then
      raise exception 'credit accounts must be created through the card or debt flow';
    end if;

    if tg_op in ('UPDATE', 'DELETE') then
      select exists (
        select 1
        from public.liabilities liability
        where liability.user_id = old.user_id and liability.account_id = old.id
      ) into linked_liability;

      if linked_liability and tg_op = 'DELETE' then
        raise exception 'liability accounts cannot be deleted; archive them instead';
      end if;

      if linked_liability and (
        new.account_type is distinct from old.account_type
        or new.initial_balance is distinct from old.initial_balance
        or new.currency_code is distinct from old.currency_code
        or new.opening_balance_date is distinct from old.opening_balance_date
        or new.opening_exchange_rate is distinct from old.opening_exchange_rate
        or new.archived is distinct from old.archived
        or new.archived_at is distinct from old.archived_at
      ) then
        raise exception 'liability balances, currency and lifecycle must change through their dedicated flow';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.account_type <> 'credit'
     and new.account_type = 'credit' then
    raise exception 'an existing asset account cannot become a liability';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.protect_liability_account_v2() from public, anon, authenticated;
create trigger accounts_protect_liability_v2
before insert or update or delete on public.accounts
for each row execute function private.protect_liability_account_v2();

create or replace function private.validate_liability_term_window_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.liability_terms term
    where term.user_id = new.user_id
      and term.account_id = new.account_id
      and term.id <> new.id
      and term.starts_on <> new.starts_on
      and daterange(term.starts_on, coalesce(term.ends_on + 1, 'infinity'::date), '[)')
          && daterange(new.starts_on, coalesce(new.ends_on + 1, 'infinity'::date), '[)')
  ) then
    raise exception 'liability term periods cannot overlap';
  end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on function private.validate_liability_term_window_v2() from public, anon, authenticated;
create trigger liability_terms_validate_window
before insert or update on public.liability_terms
for each row execute function private.validate_liability_term_window_v2();

create or replace function private.validate_liability_rate_window_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.liability_rate_periods rate
    where rate.user_id = new.user_id
      and rate.account_id = new.account_id
      and rate.rate_kind = new.rate_kind
      and rate.id <> new.id
      and rate.starts_on <> new.starts_on
      and daterange(rate.starts_on, coalesce(rate.ends_on + 1, 'infinity'::date), '[)')
          && daterange(new.starts_on, coalesce(new.ends_on + 1, 'infinity'::date), '[)')
  ) then
    raise exception 'liability rate periods cannot overlap';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_liability_rate_window_v2() from public, anon, authenticated;
create trigger liability_rate_periods_validate_window
before insert or update on public.liability_rate_periods
for each row execute function private.validate_liability_rate_window_v2();

create or replace function private.validate_liability_event_metadata_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting_kind text;
  related_account_id uuid;
begin
  select movement.kind into posting_kind
  from public.transactions movement
  where movement.user_id = new.user_id
    and movement.ledger_event_id = new.ledger_event_id
    and movement.account_id = new.account_id
  order by movement.created_at, movement.id
  limit 1;
  if posting_kind is null then
    raise exception 'liability event must post to the same liability account';
  end if;
  if new.role = 'payment' and posting_kind <> 'transfer_in' then
    raise exception 'a liability payment must be a transfer into the liability account';
  elsif new.role in ('purchase', 'drawdown', 'cash_advance')
        and posting_kind not in ('expense', 'transfer_out', 'adjustment_out') then
    raise exception 'a liability charge must increase the liability balance';
  elsif new.role in ('interest', 'fee')
        and posting_kind not in ('expense', 'adjustment_out', 'adjustment_in') then
    raise exception 'an interest or fee posting must change the liability balance';
  elsif new.role in ('refund', 'forgiveness')
        and posting_kind not in ('income', 'adjustment_in', 'transfer_in') then
    raise exception 'a liability credit must reduce the liability balance';
  end if;
  if new.related_obligation_id is not null then
    select obligation.account_id into related_account_id
    from public.liability_obligations obligation
    where obligation.user_id = new.user_id
      and obligation.id = new.related_obligation_id;
    if related_account_id is null or related_account_id <> new.account_id then
      raise exception 'related obligation must belong to the same liability account';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_liability_event_metadata_v2() from public, anon, authenticated;
create constraint trigger liability_event_metadata_validate_posting
after insert or update on public.liability_event_metadata
deferrable initially deferred
for each row execute function private.validate_liability_event_metadata_v2();

-- A transfer out of a liability is not an ordinary account transfer: it is a
-- drawdown (or a cash advance for a card) and must remain part of the debt
-- ledger. Tag it at the database boundary even if a stale client omits the
-- domain marker.
create or replace function private.tag_liability_drawdown_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare liability_kind text;
begin
  if new.kind <> 'transfer_out' then return new; end if;
  select liability.kind into liability_kind
  from public.liabilities liability
  where liability.user_id = new.user_id
    and liability.account_id = new.account_id
    and liability.status <> 'archived';
  if liability_kind is null then return new; end if;

  insert into public.liability_event_metadata (
    user_id, ledger_event_id, account_id, role
  ) values (
    new.user_id, new.ledger_event_id, new.account_id,
    case when liability_kind = 'credit_card' then 'cash_advance' else 'drawdown' end
  ) on conflict (user_id, ledger_event_id, account_id) do nothing;
  return new;
end;
$$;

revoke all on function private.tag_liability_drawdown_v2()
  from public, anon, authenticated, service_role;
drop trigger if exists tag_liability_drawdown_v2 on public.transactions;
create trigger tag_liability_drawdown_v2
after insert on public.transactions
for each row execute function private.tag_liability_drawdown_v2();

-- Domain postings participate in allocations, statements or installment
-- plans. Generic movement editing cannot keep those aggregates consistent, so
-- only a future dedicated reversal RPC may undo them atomically.
create or replace function private.protect_liability_posting_v2()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (
    exists (
      select 1 from public.liability_event_metadata metadata
      where metadata.user_id = old.user_id
        and metadata.ledger_event_id = old.ledger_event_id
    )
    or exists (
      select 1 from public.liabilities liability
      where liability.user_id = old.user_id
        and liability.account_id = old.account_id
    )
  ) then
    raise exception 'Este movimiento pertenece a una deuda o tarjeta. Corrígelo desde su detalle para conservar el historial.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_liability_posting_v2()
  from public, anon, authenticated, service_role;
drop trigger if exists protect_liability_posting_v2 on public.transactions;
create trigger protect_liability_posting_v2
before update or delete on public.transactions
for each row execute function private.protect_liability_posting_v2();

-- Every new ledger posting on a liability needs a domain role by commit time.
-- Dedicated RPCs write that metadata atomically; generic or stale clients are
-- rejected instead of silently changing debt without reconciliation.
create or replace function private.require_liability_posting_metadata_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.liabilities liability
    where liability.user_id = new.user_id
      and liability.account_id = new.account_id
  ) and not exists (
    select 1 from public.liability_event_metadata metadata
    where metadata.user_id = new.user_id
      and metadata.ledger_event_id = new.ledger_event_id
      and metadata.account_id = new.account_id
  ) then
    raise exception 'liability postings must be created through their dedicated flow';
  end if;
  return new;
end;
$$;

revoke all on function private.require_liability_posting_metadata_v2()
  from public, anon, authenticated, service_role;
drop trigger if exists liability_transactions_require_metadata_v2 on public.transactions;
create constraint trigger liability_transactions_require_metadata_v2
after insert or update on public.transactions
deferrable initially deferred
for each row execute function private.require_liability_posting_metadata_v2();

create or replace function private.validate_liability_payment_allocation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  checked_user uuid := coalesce(new.user_id, old.user_id);
  checked_account uuid := coalesce(new.account_id, old.account_id);
  checked_obligation uuid := coalesce(new.obligation_id, old.obligation_id);
  checked_event uuid := coalesce(new.ledger_event_id, old.ledger_event_id);
  obligation_account uuid;
  payment_amount numeric;
  allocated_amount numeric;
  obligation_total numeric;
begin
  if tg_op = 'DELETE' then return null; end if;
  select obligation.account_id, obligation.total_due
  into obligation_account, obligation_total
  from public.liability_obligations obligation
  where obligation.user_id = checked_user and obligation.id = checked_obligation;
  if obligation_account is distinct from checked_account then
    raise exception 'payment allocation and obligation must use the same liability';
  end if;
  select coalesce(sum(movement.amount), 0) into payment_amount
  from public.transactions movement
  where movement.user_id = checked_user
    and movement.ledger_event_id = checked_event
    and movement.account_id = checked_account
    and movement.kind = 'transfer_in';
  if payment_amount <= 0 then raise exception 'allocation requires a posted liability payment'; end if;
  select coalesce(sum(allocation.amount), 0) into allocated_amount
  from public.liability_payment_allocations allocation
  where allocation.user_id = checked_user
    and allocation.ledger_event_id = checked_event;
  if allocated_amount > payment_amount + 0.01 then
    raise exception 'payment allocations exceed the liability posting';
  end if;
  select coalesce(sum(allocation.amount), 0) into allocated_amount
  from public.liability_payment_allocations allocation
  where allocation.user_id = checked_user
    and allocation.obligation_id = checked_obligation;
  if allocated_amount > obligation_total + 0.01 then
    raise exception 'payment allocations exceed the obligation total';
  end if;
  return null;
end;
$$;

revoke all on function private.validate_liability_payment_allocation_v2() from public, anon, authenticated;
create constraint trigger liability_payment_allocations_validate
after insert or update or delete on public.liability_payment_allocations
deferrable initially deferred
for each row execute function private.validate_liability_payment_allocation_v2();

create or replace function private.validate_liability_payment_intent_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rule_id is not null and not exists (
    select 1 from public.liability_payment_rules rule
    where rule.user_id = new.user_id and rule.id = new.rule_id and rule.account_id = new.account_id
  ) then raise exception 'payment intent rule belongs to another liability'; end if;
  if new.obligation_id is not null and not exists (
    select 1 from public.liability_obligations obligation
    where obligation.user_id = new.user_id and obligation.id = new.obligation_id and obligation.account_id = new.account_id
  ) then raise exception 'payment intent obligation belongs to another liability'; end if;
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on function private.validate_liability_payment_intent_v2() from public, anon, authenticated;
create trigger liability_payment_intents_validate
before insert or update on public.liability_payment_intents
for each row execute function private.validate_liability_payment_intent_v2();

-- V1 credit-card writes remain supported. This trigger creates the common
-- subtype before the V1 profile row is constrained to it.
create or replace function private.validate_credit_card_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_kind text;
begin
  perform private.require_current_finance_user_v2();
  if not exists (
    select 1 from public.accounts account
    where account.id = new.account_id and account.user_id = new.user_id
      and account.account_type = 'credit' and not account.archived
  ) then raise exception 'credit card account is not available'; end if;

  select liability.kind into existing_kind
  from public.liabilities liability
  where liability.user_id = new.user_id and liability.account_id = new.account_id;
  if existing_kind is not null and existing_kind <> 'credit_card' then
    raise exception 'this account already belongs to another liability type';
  end if;

  insert into public.liabilities (account_id, user_id, kind, status, migration_status)
  values (new.account_id, new.user_id, 'credit_card', 'active', 'native')
  on conflict (account_id) do nothing;
  return new;
end;
$$;

revoke all on function private.validate_credit_card_account() from public, anon, authenticated;

-- Existing cards become common liabilities without touching their accounts or
-- historical postings.
insert into public.liabilities (account_id, user_id, kind, status, migration_status, created_at, updated_at)
select card.account_id, card.user_id, 'credit_card',
  case when account.archived then 'archived' else 'active' end,
  'migrated', card.created_at, card.updated_at
from public.credit_card_profiles card
join public.accounts account on account.user_id = card.user_id and account.id = card.account_id
on conflict (account_id) do update set kind = 'credit_card', migration_status = 'migrated';

alter table public.credit_card_profiles
  add constraint credit_card_profiles_liability_owner_fkey
  foreign key (user_id, account_id)
  references public.liabilities (user_id, account_id) on delete cascade;

create or replace function private.sync_credit_card_profile_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_date date;
begin
  select (coalesce(new.updated_at, now()) at time zone profile.timezone)::date
  into effective_date
  from public.profiles profile where profile.id = new.user_id;
  effective_date := coalesce(effective_date, current_date);
  update public.liability_terms term
  set ends_on = effective_date - 1,
      version = term.version + 1,
      updated_at = now()
  where term.user_id = new.user_id
    and term.account_id = new.account_id
    and term.starts_on < effective_date
    and (term.ends_on is null or term.ends_on >= effective_date);

  insert into public.liability_terms (
    user_id, account_id, starts_on, payment_frequency, calculation_method,
    statement_cutoff_day, due_day, periodic_fee, source
  ) values (
    new.user_id, new.account_id, effective_date, 'monthly', 'statement_balance',
    new.cutoff_day, new.due_day, round(new.annual_fee / 12.0, 2), 'issuer'
  ) on conflict (user_id, account_id, starts_on) do update set
    statement_cutoff_day = excluded.statement_cutoff_day,
    due_day = excluded.due_day,
    periodic_fee = excluded.periodic_fee,
    source = excluded.source;

  update public.liability_rate_periods rate
  set ends_on = effective_date - 1
  where rate.user_id = new.user_id and rate.account_id = new.account_id
    and rate.rate_kind = 'purchase' and rate.starts_on < effective_date
    and (rate.ends_on is null or rate.ends_on >= effective_date);
  if new.purchase_rate_ea is null then
    delete from public.liability_rate_periods rate
    where rate.user_id = new.user_id and rate.account_id = new.account_id
      and rate.rate_kind = 'purchase' and rate.starts_on = effective_date
      and rate.source = 'issuer';
  else
    insert into public.liability_rate_periods (
      user_id, account_id, rate_kind, rate_basis, reported_value,
      effective_annual_rate, starts_on, source
    ) values (
      new.user_id, new.account_id, 'purchase', 'effective_annual', new.purchase_rate_ea,
      new.purchase_rate_ea, effective_date, 'issuer'
    ) on conflict (user_id, account_id, rate_kind, starts_on) do update set
      reported_value = excluded.reported_value,
      effective_annual_rate = excluded.effective_annual_rate,
      source = excluded.source;
  end if;
  update public.liability_rate_periods rate
  set ends_on = effective_date - 1
  where rate.user_id = new.user_id and rate.account_id = new.account_id
    and rate.rate_kind = 'cash_advance' and rate.starts_on < effective_date
    and (rate.ends_on is null or rate.ends_on >= effective_date);
  if new.cash_advance_rate_ea is null then
    delete from public.liability_rate_periods rate
    where rate.user_id = new.user_id and rate.account_id = new.account_id
      and rate.rate_kind = 'cash_advance' and rate.starts_on = effective_date
      and rate.source = 'issuer';
  else
    insert into public.liability_rate_periods (
      user_id, account_id, rate_kind, rate_basis, reported_value,
      effective_annual_rate, starts_on, source
    ) values (
      new.user_id, new.account_id, 'cash_advance', 'effective_annual', new.cash_advance_rate_ea,
      new.cash_advance_rate_ea, effective_date, 'issuer'
    ) on conflict (user_id, account_id, rate_kind, starts_on) do update set
      reported_value = excluded.reported_value,
      effective_annual_rate = excluded.effective_annual_rate,
      source = excluded.source;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_credit_card_profile_v2() from public, anon, authenticated;
create trigger zz_credit_card_profiles_sync_v2
after insert or update on public.credit_card_profiles
for each row execute function private.sync_credit_card_profile_v2();

-- Seed V2 terms/rates for already existing cards.
insert into public.liability_terms (
  user_id, account_id, starts_on, payment_frequency, calculation_method,
  statement_cutoff_day, due_day, periodic_fee, source
)
select card.user_id, card.account_id, card.created_at::date, 'monthly', 'statement_balance',
  card.cutoff_day, card.due_day, 0, 'migration'
from public.credit_card_profiles card
on conflict (user_id, account_id, starts_on) do nothing;

insert into public.liability_rate_periods (
  id, user_id, account_id, rate_kind, rate_basis, reported_value,
  effective_annual_rate, starts_on, ends_on, source, created_at
)
with deduplicated as (
  select distinct on (rate.user_id, rate.account_id, rate.rate_kind, rate.starts_on)
    rate.*
  from public.credit_card_rate_periods rate
  order by rate.user_id, rate.account_id, rate.rate_kind, rate.starts_on,
    rate.created_at desc, rate.id desc
), ordered as (
  select rate.*,
    lead(rate.starts_on) over (
      partition by rate.user_id, rate.account_id, rate.rate_kind
      order by rate.starts_on, rate.id
    ) as next_starts_on
  from deduplicated rate
)
select rate.id, rate.user_id, rate.account_id,
  case when rate.rate_kind = 'late_fee' then 'late' else rate.rate_kind end,
  'effective_annual', rate.annual_effective_rate, rate.annual_effective_rate,
  rate.starts_on,
  case when rate.next_starts_on is null then rate.ends_on
    else least(coalesce(rate.ends_on, rate.next_starts_on - 1), rate.next_starts_on - 1) end,
  case when rate.source = 'manual' then 'manual' else rate.source end,
  rate.created_at
from ordered rate
on conflict (user_id, account_id, rate_kind, starts_on) do nothing;

insert into public.liability_rate_periods (
  user_id, account_id, rate_kind, rate_basis, reported_value,
  effective_annual_rate, starts_on, source
)
select card.user_id, card.account_id, 'purchase', 'effective_annual',
  card.purchase_rate_ea, card.purchase_rate_ea, card.created_at::date, 'migration'
from public.credit_card_profiles card
where card.purchase_rate_ea is not null
  and not exists (
    select 1 from public.credit_card_rate_periods legacy_rate
    where legacy_rate.user_id = card.user_id and legacy_rate.account_id = card.account_id
      and legacy_rate.rate_kind = 'purchase'
  )
on conflict (user_id, account_id, rate_kind, starts_on) do nothing;

-- ---------------------------------------------------------------------------
-- Atomic/idempotent public APIs
-- ---------------------------------------------------------------------------

create or replace function private.require_current_finance_user_v2()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if not (select public.is_current_user_allowed()) then
    raise exception 'private access is not enabled';
  end if;
  return caller_id;
end;
$$;

revoke all on function private.require_current_finance_user_v2()
  from public, anon, authenticated, service_role;

create or replace function public.upsert_liability_v2(
  p_operation_id uuid,
  p_account jsonb,
  p_liability jsonb,
  p_expected_account_version bigint default null,
  p_expected_liability_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  requested_account_id uuid := coalesce(
    nullif(p_account->>'id', '')::uuid,
    nullif(p_liability->>'account_id', '')::uuid
  );
  account_record public.accounts%rowtype;
  liability_record public.liabilities%rowtype;
  prior_result jsonb;
  requested_currency text := coalesce(nullif(p_account->>'currency_code', ''), 'COP');
  requested_kind text := coalesce(nullif(p_liability->>'kind', ''), 'personal_debt');
  requested_status text := coalesce(nullif(p_liability->>'status', ''), 'active');
  liability_exists boolean := false;
  legacy_target_id uuid := nullif(p_liability->>'legacy_target_id', '')::uuid;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null then raise exception 'operation is required'; end if;
  select receipt.result into prior_result
  from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.upsert.v2';
  if found then return prior_result; end if;
  if requested_account_id is null then raise exception 'liability account is required'; end if;

  if trim(coalesce(p_account->>'name', '')) = '' then raise exception 'liability name is required'; end if;
  if requested_currency not in ('COP', 'USD') then raise exception 'unsupported liability currency'; end if;
  if requested_kind not in ('credit_card', 'loan', 'personal_debt', 'bnpl', 'revolving_credit', 'other') then
    raise exception 'unsupported liability kind';
  end if;
  if legacy_target_id is not null and not exists (
    select 1 from public.financial_targets target
    where target.user_id = caller_id and target.id = legacy_target_id and target.kind = 'debt'
  ) then raise exception 'legacy debt target is not available'; end if;

  select * into account_record from public.accounts account
  where account.user_id = caller_id and account.id = requested_account_id for update;
  if found then
    if account_record.account_type <> 'credit' then raise exception 'liability account must be a credit account'; end if;
    if p_expected_account_version is null or account_record.version <> p_expected_account_version then
      raise exception 'liability account was modified elsewhere';
    end if;
    if account_record.currency_code is distinct from requested_currency
       and exists (select 1 from public.transactions movement where movement.user_id = caller_id and movement.account_id = requested_account_id) then
      raise exception 'account currency cannot change after it has movements';
    end if;
    update public.accounts set
      name = trim(p_account->>'name'), color = p_account->>'color',
      icon = nullif(p_account->>'icon', ''),
      entity_id = nullif(p_account->>'entity_id', '')::uuid,
      currency_code = requested_currency,
      opening_exchange_rate = case when requested_currency = 'COP' then 1
        else coalesce(nullif(p_account->>'opening_exchange_rate', '')::numeric, opening_exchange_rate) end,
      version = version + 1
    where user_id = caller_id and id = requested_account_id
    returning * into account_record;
  else
    if p_expected_account_version is not null then raise exception 'liability account is not available'; end if;
    insert into public.accounts (
      id, user_id, name, account_type, initial_balance, color, icon, currency_code,
      opening_balance_date, opening_exchange_rate, entity_id
    ) values (
      requested_account_id, caller_id, trim(p_account->>'name'), 'credit',
      -abs(coalesce(nullif(p_account->>'opening_debt', '')::numeric,
        nullif(p_liability->>'original_principal', '')::numeric, 0)),
      p_account->>'color', nullif(p_account->>'icon', ''), requested_currency,
      coalesce(nullif(p_account->>'opening_balance_date', '')::date, current_date),
      case when requested_currency = 'COP' then 1
        else nullif(p_account->>'opening_exchange_rate', '')::numeric end,
      nullif(p_account->>'entity_id', '')::uuid
    ) returning * into account_record;
  end if;

  select * into liability_record from public.liabilities liability
  where liability.user_id = caller_id and liability.account_id = requested_account_id for update;
  liability_exists := found;
  if liability_exists and (p_expected_liability_version is null or liability_record.version <> p_expected_liability_version) then
    raise exception 'liability details were modified elsewhere';
  end if;
  if liability_exists and requested_status <> liability_record.status then
    raise exception 'liability status must change through its lifecycle action';
  end if;
  if not liability_exists and requested_status <> 'active' then
    raise exception 'a new liability must start active';
  end if;
  if liability_exists and requested_kind <> liability_record.kind then
    raise exception 'liability type cannot change after it is created';
  end if;

  insert into public.liabilities (
    account_id, user_id, kind, status, creditor_name, original_principal,
    originated_on, maturity_on, legacy_target_id, migration_status
  ) values (
    requested_account_id, caller_id, requested_kind,
    requested_status,
    nullif(p_liability->>'creditor_name', ''),
    nullif(p_liability->>'original_principal', '')::numeric,
    nullif(p_liability->>'originated_on', '')::date,
    nullif(p_liability->>'maturity_on', '')::date,
    legacy_target_id, 'native'
  ) on conflict (account_id) do update set
    kind = public.liabilities.kind, status = public.liabilities.status,
    creditor_name = excluded.creditor_name,
    original_principal = excluded.original_principal,
    originated_on = excluded.originated_on, maturity_on = excluded.maturity_on,
    legacy_target_id = excluded.legacy_target_id, migration_status = excluded.migration_status,
    version = public.liabilities.version + 1
  where public.liabilities.user_id = caller_id
  returning * into liability_record;

  if legacy_target_id is not null then
    update public.financial_targets set account_id = requested_account_id
    where user_id = caller_id and id = legacy_target_id
      and (
        account_id is null
        or exists (
          select 1 from public.accounts existing_account
          where existing_account.user_id = caller_id
            and existing_account.id = public.financial_targets.account_id
            and existing_account.account_type = 'credit'
        )
      );
    update public.financial_target_debt_details
    set migrated_liability_account_id = requested_account_id, migration_status = 'migrated'
    where user_id = caller_id and target_id = legacy_target_id;
  end if;

  prior_result := jsonb_build_object(
    'accountId', account_record.id,
    'accountVersion', account_record.version,
    'liabilityVersion', liability_record.version,
    'legacyTargetId', liability_record.legacy_target_id
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.upsert.v2', prior_result);
  return prior_result;
end;
$$;

create or replace function public.upsert_liability_terms_v2(
  p_operation_id uuid,
  p_term jsonb,
  p_rates jsonb default '[]'::jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  term_id uuid := (p_term->>'id')::uuid;
  liability_account_id uuid := (p_term->>'account_id')::uuid;
  requested_starts_on date := (p_term->>'starts_on')::date;
  term_record public.liability_terms%rowtype;
  prior_result jsonb;
  rate_count integer;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or term_id is null or liability_account_id is null then
    raise exception 'operation, term and liability are required';
  end if;
  select receipt.result into prior_result from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.terms.upsert.v2';
  if found then return prior_result; end if;
  if jsonb_typeof(p_rates) <> 'array' or jsonb_array_length(p_rates) > 20 then
    raise exception 'rates must be an array of at most 20 rows';
  end if;
  if not exists (
    select 1 from public.liabilities liability
    where liability.user_id = caller_id and liability.account_id = liability_account_id
  ) then raise exception 'liability is not available'; end if;

  select * into term_record from public.liability_terms term
  where term.user_id = caller_id and term.id = term_id for update;
  if found and (p_expected_version is null or term_record.version <> p_expected_version) then
    raise exception 'liability terms were modified elsewhere';
  end if;
  update public.liability_terms term set
    ends_on = requested_starts_on - 1, version = term.version + 1, updated_at = now()
  where term.user_id = caller_id and term.account_id = liability_account_id
    and term.id <> term_id and term.starts_on < requested_starts_on
    and (term.ends_on is null or term.ends_on >= requested_starts_on);

  insert into public.liability_terms (
    id, user_id, account_id, starts_on, ends_on, payment_frequency,
    interval_count, calculation_method, amortization_method,
    statement_cutoff_day, due_day, first_due_on, installment_count,
    scheduled_payment, contractual_minimum, periodic_fee, periodic_insurance,
    variable_rate, index_name, spread_rate, prepayment_strategy, source
  ) values (
    term_id, caller_id, liability_account_id, requested_starts_on,
    nullif(p_term->>'ends_on', '')::date,
    coalesce(nullif(p_term->>'payment_frequency', ''), 'monthly'),
    coalesce(nullif(p_term->>'interval_count', '')::smallint, 1),
    coalesce(nullif(p_term->>'calculation_method', ''), 'manual'),
    coalesce(nullif(p_term->>'amortization_method', ''), 'manual'),
    nullif(p_term->>'statement_cutoff_day', '')::smallint,
    nullif(p_term->>'due_day', '')::smallint,
    nullif(p_term->>'first_due_on', '')::date,
    nullif(p_term->>'installment_count', '')::integer,
    nullif(p_term->>'scheduled_payment', '')::numeric,
    nullif(p_term->>'contractual_minimum', '')::numeric,
    coalesce(nullif(p_term->>'periodic_fee', '')::numeric, 0),
    coalesce(nullif(p_term->>'periodic_insurance', '')::numeric, 0),
    coalesce(nullif(p_term->>'variable_rate', '')::boolean, false),
    nullif(p_term->>'index_name', ''), nullif(p_term->>'spread_rate', '')::numeric,
    coalesce(nullif(p_term->>'prepayment_strategy', ''), 'manual'),
    coalesce(nullif(p_term->>'source', ''), 'manual')
  ) on conflict (id) do update set
    starts_on = excluded.starts_on, ends_on = excluded.ends_on,
    payment_frequency = excluded.payment_frequency, interval_count = excluded.interval_count,
    calculation_method = excluded.calculation_method,
    amortization_method = excluded.amortization_method,
    statement_cutoff_day = excluded.statement_cutoff_day, due_day = excluded.due_day,
    first_due_on = excluded.first_due_on, installment_count = excluded.installment_count,
    scheduled_payment = excluded.scheduled_payment,
    contractual_minimum = excluded.contractual_minimum,
    periodic_fee = excluded.periodic_fee, periodic_insurance = excluded.periodic_insurance,
    variable_rate = excluded.variable_rate, index_name = excluded.index_name,
    spread_rate = excluded.spread_rate, prepayment_strategy = excluded.prepayment_strategy,
    source = excluded.source,
    version = public.liability_terms.version + 1
  where public.liability_terms.user_id = caller_id
  returning * into term_record;

  update public.liability_rate_periods rate
  set ends_on = requested_starts_on - 1
  where rate.user_id = caller_id and rate.account_id = liability_account_id
    and rate.starts_on < requested_starts_on
    and (rate.ends_on is null or rate.ends_on >= requested_starts_on)
    and exists (
      select 1 from jsonb_array_elements(p_rates) item
      where item->>'rate_kind' = rate.rate_kind
    );
  insert into public.liability_rate_periods (
    id, user_id, account_id, rate_kind, rate_basis, reported_value,
    effective_annual_rate, starts_on, ends_on, source
  )
  select row.id, caller_id, liability_account_id, row.rate_kind, row.rate_basis,
    row.reported_value, row.effective_annual_rate, row.starts_on, row.ends_on,
    coalesce(row.source, 'manual')
  from jsonb_to_recordset(p_rates) as row(
    id uuid, rate_kind text, rate_basis text, reported_value numeric,
    effective_annual_rate numeric, starts_on date, ends_on date, source text
  )
  on conflict (id) do update set
    rate_kind = excluded.rate_kind, rate_basis = excluded.rate_basis,
    reported_value = excluded.reported_value,
    effective_annual_rate = excluded.effective_annual_rate,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, source = excluded.source
  where public.liability_rate_periods.user_id = caller_id
    and public.liability_rate_periods.account_id = liability_account_id;
  get diagnostics rate_count = row_count;

  prior_result := jsonb_build_object(
    'termId', term_record.id, 'termVersion', term_record.version, 'rateCount', rate_count
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.terms.upsert.v2', prior_result);
  return prior_result;
end;
$$;

create or replace function public.upsert_liability_payment_rule_v2(
  p_operation_id uuid,
  p_rule jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  rule_id uuid := (p_rule->>'id')::uuid;
  rule_record public.liability_payment_rules%rowtype;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or rule_id is null then raise exception 'operation and rule are required'; end if;
  select receipt.result into prior_result from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.payment-rule.upsert.v2';
  if found then return prior_result; end if;
  select * into rule_record from public.liability_payment_rules rule
  where rule.user_id = caller_id and rule.id = rule_id for update;
  if found and (p_expected_version is null or rule_record.version <> p_expected_version) then
    raise exception 'payment rule was modified elsewhere';
  end if;
  if found and rule_record.account_id is distinct from (p_rule->>'account_id')::uuid then
    raise exception 'a payment rule cannot move to another liability; create a new rule';
  end if;
  if coalesce(nullif(p_rule->>'active', '')::boolean, true) and not exists (
    select 1
    from public.liabilities liability
    join public.accounts account
      on account.user_id = liability.user_id and account.id = liability.account_id
    where liability.user_id = caller_id
      and liability.account_id = (p_rule->>'account_id')::uuid
      and liability.status = 'active'
      and not account.archived
  ) then
    raise exception 'resume the debt before enabling its payment rule';
  end if;
  insert into public.liability_payment_rules (
    id, user_id, account_id, funding_account_id, strategy, fixed_amount,
    maximum_amount, days_before_due, recording_mode, active,
    suspended_by_target, detached_at
  ) values (
    rule_id, caller_id, (p_rule->>'account_id')::uuid,
    (p_rule->>'funding_account_id')::uuid, p_rule->>'strategy',
    nullif(p_rule->>'fixed_amount', '')::numeric,
    nullif(p_rule->>'maximum_amount', '')::numeric,
    coalesce(nullif(p_rule->>'days_before_due', '')::smallint, 0),
    coalesce(nullif(p_rule->>'recording_mode', ''), 'manual'),
    coalesce(nullif(p_rule->>'active', '')::boolean, true), false, null
  ) on conflict (id) do update set
    account_id = excluded.account_id, funding_account_id = excluded.funding_account_id,
    strategy = excluded.strategy, fixed_amount = excluded.fixed_amount,
    maximum_amount = excluded.maximum_amount,
    days_before_due = excluded.days_before_due,
    recording_mode = excluded.recording_mode, active = excluded.active,
    suspended_by_target = false, detached_at = null,
    version = public.liability_payment_rules.version + 1
  where public.liability_payment_rules.user_id = caller_id
  returning * into rule_record;
  prior_result := jsonb_build_object('ruleId', rule_record.id, 'ruleVersion', rule_record.version);
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.payment-rule.upsert.v2', prior_result);
  return prior_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared balance and legacy-target synchronization helpers
-- ---------------------------------------------------------------------------

create or replace function private.liability_native_balance_at_v2(
  p_user_id uuid,
  p_account_id uuid,
  p_as_of date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when account.id is null then null
    else
      case when account.opening_balance_date <= p_as_of then account.initial_balance else 0 end
      + coalesce(sum(
          case when movement.kind in ('income', 'transfer_in', 'adjustment_in')
            then movement.amount else -movement.amount end
        ) filter (where movement.occurred_on <= p_as_of), 0)
  end
  from public.accounts account
  left join public.transactions movement
    on movement.user_id = account.user_id and movement.account_id = account.id
  where account.user_id = p_user_id and account.id = p_account_id
  group by account.id, account.opening_balance_date, account.initial_balance;
$$;

create or replace function private.liability_reporting_balance_at_v2(
  p_user_id uuid,
  p_account_id uuid,
  p_as_of date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when account.id is null then null
    else
      case when account.opening_balance_date <= p_as_of
        then account.initial_balance * account.opening_exchange_rate else 0 end
      + coalesce(sum(
          case when movement.kind in ('income', 'transfer_in', 'adjustment_in')
            then movement.base_amount else -movement.base_amount end
        ) filter (where movement.occurred_on <= p_as_of), 0)
  end
  from public.accounts account
  left join public.transactions movement
    on movement.user_id = account.user_id and movement.account_id = account.id
  where account.user_id = p_user_id and account.id = p_account_id
  group by account.id, account.opening_balance_date, account.initial_balance,
    account.opening_exchange_rate;
$$;

revoke all on function private.liability_native_balance_at_v2(uuid, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.liability_reporting_balance_at_v2(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create or replace function private.sync_financial_target_liability_v2(
  p_user_id uuid,
  p_target_id uuid,
  p_debt jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_record public.financial_targets%rowtype;
  detail_record public.financial_target_debt_details%rowtype;
  liability_account_id uuid;
  requested_account_id uuid := nullif(p_debt->>'liability_account_id', '')::uuid;
  existing_liability_account_id uuid;
  liability_account_record public.accounts%rowtype;
  liability_account_exists boolean := false;
  requested_currency text;
  requested_principal numeric;
  live_principal numeric;
  local_today date;
  principal_supplied boolean := p_debt ? 'principal'
    and nullif(p_debt->>'principal', '') is not null;
  currency_supplied boolean := p_debt ? 'currency_code'
    and nullif(p_debt->>'currency_code', '') is not null;
  requested_kind text := coalesce(nullif(p_debt->>'debt_type', ''), 'personal_debt');
  term_id uuid := coalesce(nullif(p_debt->>'term_id', '')::uuid, gen_random_uuid());
  term_start date;
  rate_id uuid := coalesce(nullif(p_debt->>'rate_id', '')::uuid, gen_random_uuid());
  schedule jsonb := coalesce(p_debt->'schedule', '[]'::jsonb);
  schedule_count integer;
begin
  select * into target_record
  from public.financial_targets target
  where target.user_id = p_user_id and target.id = p_target_id and target.kind = 'debt'
  for update;
  if not found then raise exception 'debt target is not available'; end if;

  select * into detail_record
  from public.financial_target_debt_details detail
  where detail.user_id = p_user_id and detail.target_id = p_target_id
  for update;
  if not found then raise exception 'debt details are required'; end if;

  if requested_kind not in ('loan', 'personal_debt', 'bnpl', 'revolving_credit', 'other') then
    raise exception 'unsupported debt type';
  end if;

  -- Once a debt has a native ledger account, neither a stale client nor a
  -- crafted RPC may silently point the target to another account.
  select coalesce(
    (
      select account.id from public.accounts account
      where account.user_id = p_user_id
        and account.id = detail_record.migrated_liability_account_id
        and account.account_type = 'credit'
    ),
    (
      select liability.account_id
      from public.liabilities liability
      join public.accounts account
        on account.user_id = liability.user_id and account.id = liability.account_id
      where liability.user_id = p_user_id and liability.legacy_target_id = p_target_id
        and account.account_type = 'credit'
      order by liability.account_id
      limit 1
    ),
    (
      select account.id from public.accounts account
      where account.user_id = p_user_id and account.id = target_record.account_id
        and account.account_type = 'credit'
    )
  ) into existing_liability_account_id;

  if existing_liability_account_id is not null
     and requested_account_id is not null
     and requested_account_id <> existing_liability_account_id then
    raise exception 'an existing debt ledger account cannot be replaced';
  end if;
  liability_account_id := coalesce(
    existing_liability_account_id,
    requested_account_id,
    gen_random_uuid()
  );

  select * into liability_account_record
  from public.accounts account
  where account.user_id = p_user_id and account.id = liability_account_id
  for update;
  liability_account_exists := found;

  if liability_account_exists then
    if liability_account_record.account_type <> 'credit' then
      raise exception 'a debt target can only link to a liability account';
    end if;
    if liability_account_record.currency_code not in ('COP', 'USD') then
      raise exception 'unsupported debt currency';
    end if;
    if currency_supplied
       and (p_debt->>'currency_code') <> liability_account_record.currency_code then
      raise exception 'an existing debt currency cannot change';
    end if;
    requested_currency := liability_account_record.currency_code;
    select (now() at time zone coalesce(profile.timezone, 'America/Bogota'))::date
    into local_today
    from public.profiles profile
    where profile.id = p_user_id;
    local_today := coalesce(local_today, current_date);
    live_principal := greatest(
      -coalesce(
        private.liability_native_balance_at_v2(p_user_id, liability_account_id, local_today),
        liability_account_record.initial_balance
      ),
      0
    );
    if principal_supplied then
      requested_principal := (p_debt->>'principal')::numeric;
      if requested_principal < 0 then raise exception 'debt principal cannot be negative'; end if;
      if abs(requested_principal - live_principal) > 0.01 then
        raise exception 'an existing debt balance cannot be edited; record a payment or reconciliation';
      end if;
    end if;
    requested_principal := live_principal;
  else
    requested_currency := coalesce(nullif(p_debt->>'currency_code', ''), 'COP');
    if requested_currency not in ('COP', 'USD') then raise exception 'unsupported debt currency'; end if;
    requested_principal := coalesce(
      nullif(p_debt->>'principal', '')::numeric,
      greatest(target_record.target_amount - target_record.initial_progress, 0)
    );
    if requested_principal < 0 then raise exception 'debt principal cannot be negative'; end if;
    insert into public.accounts (
      id, user_id, name, account_type, initial_balance, color, icon,
      currency_code, opening_balance_date, opening_exchange_rate
    ) values (
      liability_account_id, p_user_id, target_record.title, 'credit', -requested_principal,
      target_record.color, target_record.icon, requested_currency, target_record.starts_on,
      case when requested_currency = 'COP' then 1
        else nullif(p_debt->>'opening_exchange_rate', '')::numeric end
    );
  end if;

  update public.accounts account
  set name = target_record.title, color = target_record.color,
      icon = target_record.icon, version = account.version + 1,
      updated_at = now()
  where account.user_id = p_user_id and account.id = liability_account_id
    and account.account_type = 'credit'
    and (
      account.name is distinct from target_record.title
      or account.color is distinct from target_record.color
      or account.icon is distinct from target_record.icon
    );

  insert into public.liabilities (
    account_id, user_id, kind, status, creditor_name, original_principal,
    originated_on, maturity_on, legacy_target_id, migration_status
  ) values (
    liability_account_id, p_user_id, requested_kind,
    case target_record.status when 'archived' then 'archived' when 'completed' then 'settled'
      when 'paused' then 'paused' else 'active' end,
    coalesce(nullif(p_debt->>'creditor', ''), detail_record.creditor),
    requested_principal, target_record.starts_on, target_record.target_date,
    p_target_id, 'native'
  ) on conflict (account_id) do update set
    kind = case when public.liabilities.kind = 'credit_card' then 'credit_card' else excluded.kind end,
    status = excluded.status, creditor_name = excluded.creditor_name,
    original_principal = coalesce(public.liabilities.original_principal, excluded.original_principal),
    originated_on = coalesce(public.liabilities.originated_on, excluded.originated_on),
    maturity_on = excluded.maturity_on,
    legacy_target_id = excluded.legacy_target_id,
    migration_status = 'native',
    version = public.liabilities.version + 1
  where public.liabilities.user_id = p_user_id;

  update public.financial_targets
  set account_id = liability_account_id
  where user_id = p_user_id and id = p_target_id
    and (
      account_id is null
      or exists (
        select 1 from public.accounts existing_account
        where existing_account.user_id = p_user_id
          and existing_account.id = public.financial_targets.account_id
          and existing_account.account_type = 'credit'
      )
    );
  update public.financial_target_debt_details
  set migrated_liability_account_id = liability_account_id,
      migration_status = 'migrated'
  where user_id = p_user_id and target_id = p_target_id;

  -- The optional funding account belongs to the payment setup, never to the
  -- target or liability account. Presence is significant: an absent key keeps
  -- the existing setup, a UUID links it, and explicit null detaches it without
  -- deleting historical intents or audit rows.
  if p_debt ? 'funding_account_id' then
    if nullif(p_debt->>'funding_account_id', '') is null then
      update public.liability_payment_rules rule
      set active = false, suspended_by_target = false, detached_at = now(),
          version = rule.version + 1, updated_at = now()
      where rule.user_id = p_user_id and rule.account_id = liability_account_id
        and rule.detached_at is null;

      update public.liability_payment_intents intent
      set status = 'cancelled', suspended_by_target = false,
          detached_by_rule = true,
          version = intent.version + 1, updated_at = now()
      where intent.user_id = p_user_id and intent.account_id = liability_account_id
        and intent.status in ('planned', 'needs_confirmation', 'confirmed');
    else
      if not exists (
        select 1 from public.accounts funding
        where funding.user_id = p_user_id
          and funding.id = (p_debt->>'funding_account_id')::uuid
          and not funding.archived and funding.account_type <> 'credit'
      ) then raise exception 'funding account is not available'; end if;

      insert into public.liability_payment_rules (
        id, user_id, account_id, funding_account_id, strategy, fixed_amount,
        maximum_amount, days_before_due, recording_mode, active,
        suspended_by_target, detached_at
      ) values (
        gen_random_uuid(), p_user_id, liability_account_id,
        (p_debt->>'funding_account_id')::uuid, 'current_balance', null,
        null, 0, 'manual', false, false, null
      ) on conflict (user_id, account_id) do update set
        funding_account_id = excluded.funding_account_id,
        active = case when public.liability_payment_rules.detached_at is null
          then public.liability_payment_rules.active else false end,
        suspended_by_target = case when public.liability_payment_rules.detached_at is null
          then public.liability_payment_rules.suspended_by_target else false end,
        detached_at = null,
        version = public.liability_payment_rules.version + 1,
        updated_at = now();
    end if;
  end if;

  term_start := coalesce(nullif(p_debt->>'terms_start_on', '')::date, target_record.starts_on);
  if nullif(p_debt->>'term_id', '') is null then
    select term.id into term_id
    from public.liability_terms term
    where term.user_id = p_user_id and term.account_id = liability_account_id
      and term.starts_on = term_start
    order by term.id limit 1;
    term_id := coalesce(term_id, gen_random_uuid());
  end if;
  update public.liability_terms term
  set ends_on = term_start - 1, version = term.version + 1, updated_at = now()
  where term.user_id = p_user_id and term.account_id = liability_account_id
    and term.starts_on < term_start and (term.ends_on is null or term.ends_on >= term_start);
  insert into public.liability_terms (
    id, user_id, account_id, starts_on, ends_on, payment_frequency,
    interval_count, calculation_method, amortization_method, due_day, first_due_on,
    installment_count, scheduled_payment, contractual_minimum, periodic_fee,
    periodic_insurance, variable_rate, index_name, spread_rate,
    prepayment_strategy, source
  ) values (
    term_id, p_user_id, liability_account_id, term_start,
    nullif(p_debt->>'terms_end_on', '')::date,
    coalesce(nullif(p_debt->>'payment_frequency', ''), 'monthly'),
    coalesce(nullif(p_debt->>'interval_count', '')::smallint, 1),
    coalesce(nullif(p_debt->>'calculation_method', ''), 'manual'),
    coalesce(nullif(p_debt->>'amortization_method', ''), 'manual'),
    coalesce(nullif(p_debt->>'due_day', '')::smallint, detail_record.due_day),
    nullif(p_debt->>'first_due_on', '')::date,
    nullif(p_debt->>'installment_count', '')::integer,
    nullif(p_debt->>'scheduled_payment', '')::numeric,
    coalesce(nullif(p_debt->>'minimum_payment', '')::numeric, detail_record.minimum_payment),
    coalesce(nullif(p_debt->>'periodic_fee', '')::numeric, 0),
    coalesce(nullif(p_debt->>'periodic_insurance', '')::numeric, 0),
    coalesce(nullif(p_debt->>'variable_rate', '')::boolean, false),
    nullif(p_debt->>'index_name', ''), nullif(p_debt->>'spread_rate', '')::numeric,
    coalesce(nullif(p_debt->>'prepayment_strategy', ''), 'manual'), 'manual'
  ) on conflict (id) do update set
    starts_on = excluded.starts_on, ends_on = excluded.ends_on,
    payment_frequency = excluded.payment_frequency, interval_count = excluded.interval_count,
    calculation_method = excluded.calculation_method,
    amortization_method = excluded.amortization_method, due_day = excluded.due_day,
    first_due_on = excluded.first_due_on, installment_count = excluded.installment_count,
    scheduled_payment = excluded.scheduled_payment,
    contractual_minimum = excluded.contractual_minimum,
    periodic_fee = excluded.periodic_fee, periodic_insurance = excluded.periodic_insurance,
    variable_rate = excluded.variable_rate, index_name = excluded.index_name,
    spread_rate = excluded.spread_rate,
    prepayment_strategy = excluded.prepayment_strategy, source = excluded.source,
    version = public.liability_terms.version + 1
  where public.liability_terms.user_id = p_user_id;

  if p_debt ? 'rate_value' or p_debt ? 'effective_annual_rate'
     or p_debt ? 'annual_interest_rate' then
    if nullif(p_debt->>'rate_id', '') is null then
      select rate.id into rate_id
      from public.liability_rate_periods rate
      where rate.user_id = p_user_id and rate.account_id = liability_account_id
        and rate.rate_kind = 'principal' and rate.starts_on = term_start
      order by rate.id limit 1;
      rate_id := coalesce(rate_id, gen_random_uuid());
    end if;
    update public.liability_rate_periods rate
    set ends_on = term_start - 1
    where rate.user_id = p_user_id and rate.account_id = liability_account_id
      and rate.rate_kind = 'principal' and rate.starts_on < term_start
      and (rate.ends_on is null or rate.ends_on >= term_start);
    if nullif(p_debt->>'rate_value', '') is null
       and nullif(p_debt->>'effective_annual_rate', '') is null
       and nullif(p_debt->>'annual_interest_rate', '') is null then
      delete from public.liability_rate_periods rate
      where rate.user_id = p_user_id and rate.account_id = liability_account_id
        and rate.rate_kind = 'principal' and rate.source = 'manual'
        and rate.starts_on >= term_start;
    else
      insert into public.liability_rate_periods (
        id, user_id, account_id, rate_kind, rate_basis, reported_value,
        effective_annual_rate, starts_on, source
      ) values (
        rate_id, p_user_id, liability_account_id, 'principal',
        coalesce(nullif(p_debt->>'rate_basis', ''), 'effective_annual'),
        coalesce(nullif(p_debt->>'rate_value', '')::numeric,
          nullif(p_debt->>'effective_annual_rate', '')::numeric,
          nullif(p_debt->>'annual_interest_rate', '')::numeric),
        coalesce(nullif(p_debt->>'effective_annual_rate', '')::numeric,
          nullif(p_debt->>'annual_interest_rate', '')::numeric),
        term_start, 'manual'
      ) on conflict (id) do update set
        rate_basis = excluded.rate_basis, reported_value = excluded.reported_value,
        effective_annual_rate = excluded.effective_annual_rate,
        starts_on = excluded.starts_on, ends_on = null, source = excluded.source
      where public.liability_rate_periods.user_id = p_user_id;
    end if;
  end if;

  if p_debt ? 'schedule' then
    if jsonb_typeof(schedule) <> 'array' then raise exception 'debt schedule must be an array'; end if;
    schedule_count := jsonb_array_length(schedule);
    if schedule_count > 1200 then raise exception 'debt schedule exceeds 1200 obligations'; end if;
    if exists (
      select 1 from jsonb_array_elements(schedule) item
      where nullif(item->>'id', '') is null
        or nullif(item->>'sequence_number', '') is null
        or nullif(item->>'due_on', '') is null
        or nullif(item->>'total_due', '') is null
    ) then raise exception 'every scheduled obligation needs id, sequence, date and total'; end if;

    delete from public.liability_obligations obligation
    where obligation.user_id = p_user_id and obligation.account_id = liability_account_id
      and obligation.source = 'contract' and obligation.status in ('projected', 'open')
      and not exists (
        select 1 from public.liability_payment_allocations allocation
        where allocation.user_id = obligation.user_id and allocation.obligation_id = obligation.id
      )
      and not exists (
        select 1 from jsonb_array_elements(schedule) item
        where (item->>'id')::uuid = obligation.id
      );

    if schedule_count > 0 then
      insert into public.liability_obligations (
      id, user_id, account_id, kind, sequence_number, period_start, period_end,
      due_on, principal_due, interest_due, fee_due, minimum_due, total_due,
      status, source
    )
    select row.id, p_user_id, liability_account_id, 'loan_installment',
      row.sequence_number, row.period_start, row.period_end, row.due_on,
      coalesce(row.principal_due, 0), coalesce(row.interest_due, 0),
      coalesce(row.fee_due, 0), coalesce(row.minimum_due, row.total_due),
      row.total_due, coalesce(row.status, 'projected'), 'contract'
    from jsonb_to_recordset(schedule) as row(
      id uuid, sequence_number integer, period_start date, period_end date,
      due_on date, principal_due numeric, interest_due numeric, fee_due numeric,
      minimum_due numeric, total_due numeric, status text
    )
    on conflict (id) do update set
      sequence_number = excluded.sequence_number, period_start = excluded.period_start,
      period_end = excluded.period_end, due_on = excluded.due_on,
      principal_due = excluded.principal_due, interest_due = excluded.interest_due,
      fee_due = excluded.fee_due, minimum_due = excluded.minimum_due,
      total_due = excluded.total_due, status = excluded.status,
      source = excluded.source,
      version = public.liability_obligations.version + 1
      where public.liability_obligations.user_id = p_user_id
        and public.liability_obligations.account_id = liability_account_id
        and public.liability_obligations.status in ('projected', 'open')
        and not exists (
          select 1 from public.liability_payment_allocations allocation
          where allocation.user_id = public.liability_obligations.user_id
            and allocation.obligation_id = public.liability_obligations.id
        );
    end if;
  end if;

  return liability_account_id;
end;
$$;

revoke all on function private.sync_financial_target_liability_v2(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

insert into public.liability_rate_periods (
  user_id, account_id, rate_kind, rate_basis, reported_value,
  effective_annual_rate, starts_on, source
)
select card.user_id, card.account_id, 'cash_advance', 'effective_annual',
  card.cash_advance_rate_ea, card.cash_advance_rate_ea, card.created_at::date, 'migration'
from public.credit_card_profiles card
where card.cash_advance_rate_ea is not null
  and not exists (
    select 1 from public.credit_card_rate_periods legacy_rate
    where legacy_rate.user_id = card.user_id and legacy_rate.account_id = card.account_id
      and legacy_rate.rate_kind = 'cash_advance'
  )
on conflict (user_id, account_id, rate_kind, starts_on) do nothing;

create or replace function private.sync_credit_card_rate_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.liability_rate_periods rate
    where rate.user_id = old.user_id and rate.id = old.id;
    return old;
  end if;
  update public.liability_rate_periods rate
  set ends_on = new.starts_on - 1
  where rate.user_id = new.user_id and rate.account_id = new.account_id
    and rate.rate_kind = case when new.rate_kind = 'late_fee' then 'late' else new.rate_kind end
    and rate.id <> new.id and rate.starts_on < new.starts_on
    and (rate.ends_on is null or rate.ends_on >= new.starts_on);
  insert into public.liability_rate_periods (
    id, user_id, account_id, rate_kind, rate_basis, reported_value,
    effective_annual_rate, starts_on, ends_on, source, created_at
  ) values (
    new.id, new.user_id, new.account_id,
    case when new.rate_kind = 'late_fee' then 'late' else new.rate_kind end,
    'effective_annual', new.annual_effective_rate, new.annual_effective_rate,
    new.starts_on, new.ends_on,
    case when new.source = 'manual' then 'manual' else new.source end,
    new.created_at
  ) on conflict (id) do update set
    account_id = excluded.account_id, rate_kind = excluded.rate_kind,
    reported_value = excluded.reported_value,
    effective_annual_rate = excluded.effective_annual_rate,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on, source = excluded.source
  where public.liability_rate_periods.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function private.sync_credit_card_rate_v2() from public, anon, authenticated;
create trigger credit_card_rate_periods_sync_v2
after insert or update or delete on public.credit_card_rate_periods
for each row execute function private.sync_credit_card_rate_v2();

insert into public.liability_obligations (
  id, user_id, account_id, kind, period_start, period_end, due_on,
  principal_due, interest_due, fee_due, minimum_due, total_due, status, source,
  version, created_at, updated_at
)
select statement.id, statement.user_id, statement.account_id, 'credit_card_statement',
  statement.period_start, statement.period_end, statement.due_on,
  greatest(statement.total_due - statement.interest - statement.fees, 0),
  statement.interest, statement.fees, statement.minimum_due, statement.total_due,
  case
    -- `reconciled` confirms the cutoff; `payments` is only the bank's cycle
    -- summary. Neither proves this obligation was paid through Moneva.
    when statement.total_due <= 0.01 then 'paid'
    when statement.due_on < current_date then 'overdue'
    when statement.due_on = current_date then 'due'
    else 'open'
  end,
  'migration', statement.version, statement.created_at, statement.updated_at
from public.credit_card_statements statement
on conflict (id) do nothing;

alter table public.credit_card_statements
  add constraint credit_card_statements_obligation_owner_fkey
  foreign key (user_id, id)
  references public.liability_obligations (user_id, id) on delete cascade;

create or replace function private.sync_credit_card_statement_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated_total numeric := 0;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'credit card statement history cannot be deleted';
  end if;
  if exists (
    select 1
    from public.liability_obligations obligation
    where obligation.user_id = new.user_id and obligation.id = new.id
      and (
        obligation.account_id is distinct from new.account_id
        or obligation.kind <> 'credit_card_statement'
      )
  ) then
    raise exception 'a statement id cannot move to another account or obligation type';
  end if;
  select coalesce(sum(allocation.amount), 0) into allocated_total
  from public.liability_payment_allocations allocation
  where allocation.user_id = new.user_id
    and allocation.obligation_id = new.id;
  if new.status = 'paid'
     and new.total_due > 0.01
     and allocated_total < new.total_due - 0.01 then
    raise exception 'a paid statement requires ledger-backed payment allocations';
  end if;
  if new.total_due <= 0.01 or allocated_total >= new.total_due - 0.01 then
    new.status := 'paid';
  end if;
  insert into public.liability_obligations (
    id, user_id, account_id, kind, period_start, period_end, due_on,
    principal_due, interest_due, fee_due, minimum_due, total_due, status, source,
    version, created_at, updated_at
  ) values (
    new.id, new.user_id, new.account_id, 'credit_card_statement',
    new.period_start, new.period_end, new.due_on,
    greatest(new.total_due - new.interest - new.fees, 0),
    new.interest, new.fees, new.minimum_due, new.total_due,
    case
      when new.status = 'paid' then 'paid'
      when allocated_total > 0.01 then 'partial'
      when new.due_on < current_date then 'overdue'
      when new.due_on = current_date then 'due'
      else 'open'
    end,
    'statement', new.version, new.created_at, new.updated_at
  ) on conflict (id) do update set
    account_id = excluded.account_id, period_start = excluded.period_start,
    period_end = excluded.period_end, due_on = excluded.due_on,
    principal_due = excluded.principal_due, interest_due = excluded.interest_due,
    fee_due = excluded.fee_due, minimum_due = excluded.minimum_due,
    total_due = excluded.total_due, status = excluded.status,
    source = excluded.source, version = public.liability_obligations.version + 1,
    updated_at = now()
  where public.liability_obligations.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function private.sync_credit_card_statement_v2() from public, anon, authenticated;
create trigger credit_card_statements_sync_v2
before insert or update or delete on public.credit_card_statements
for each row execute function private.sync_credit_card_statement_v2();

-- Keep legacy statement allocations and the unified allocation model aligned
-- during the transition. Only ledger-backed, internally consistent legacy
-- allocations are migrated automatically; anomalies remain visible through
-- liabilities.migration_status = 'needs_review'.
insert into public.liability_payment_allocations (
  id, user_id, account_id, obligation_id, ledger_event_id, amount,
  allocated_on, created_at
)
select legacy.id, legacy.user_id, statement.account_id, legacy.statement_id,
  legacy.transfer_group_id, legacy.amount, legacy.allocated_on, legacy.created_at
from public.credit_card_payment_allocations legacy
join public.credit_card_statements statement
  on statement.user_id = legacy.user_id and statement.id = legacy.statement_id
where exists (
    select 1 from public.transactions posting
    where posting.user_id = legacy.user_id
      and posting.ledger_event_id = legacy.transfer_group_id
      and posting.account_id = statement.account_id
      and posting.kind = 'transfer_in'
  )
  and (
    select coalesce(sum(sibling.amount), 0)
    from public.credit_card_payment_allocations sibling
    where sibling.user_id = legacy.user_id
      and sibling.transfer_group_id = legacy.transfer_group_id
  ) <= (
    select coalesce(sum(posting.amount), 0) + 0.01
    from public.transactions posting
    where posting.user_id = legacy.user_id
      and posting.ledger_event_id = legacy.transfer_group_id
      and posting.kind = 'transfer_in'
  )
  and (
    select coalesce(sum(sibling.amount), 0)
    from public.credit_card_payment_allocations sibling
    where sibling.user_id = legacy.user_id
      and sibling.statement_id = legacy.statement_id
  ) <= statement.total_due + 0.01
on conflict (user_id, obligation_id, ledger_event_id) do nothing;

-- Normalize the legacy statement flag only after valid, ledger-backed
-- allocations have been migrated. A bank-reported `payments` subtotal is not
-- evidence that the Moneva obligation was settled.
with normalized as (
  select statement.user_id, statement.id, case
    when statement.total_due <= 0.01
      or coalesce((
        select sum(allocation.amount)
        from public.liability_payment_allocations allocation
        where allocation.user_id = statement.user_id
          and allocation.obligation_id = statement.id
      ), 0) >= statement.total_due - 0.01 then 'paid'
    when statement.reconciled_at is not null then 'reconciled'
    when statement.due_on < current_date then 'overdue'
    when statement.due_on = current_date then 'due'
    else 'open'
  end as status
  from public.credit_card_statements statement
)
update public.credit_card_statements statement
set status = normalized.status,
    version = statement.version + 1,
    updated_at = now()
from normalized
where normalized.user_id = statement.user_id
  and normalized.id = statement.id
  and statement.status is distinct from normalized.status;

update public.liabilities liability
set migration_status = 'needs_review', version = liability.version + 1,
    updated_at = now()
where liability.kind = 'credit_card'
  and exists (
    select 1
    from public.credit_card_payment_allocations legacy
    join public.credit_card_statements statement
      on statement.user_id = legacy.user_id and statement.id = legacy.statement_id
    where statement.user_id = liability.user_id
      and statement.account_id = liability.account_id
      and not exists (
        select 1 from public.liability_payment_allocations allocation
        where allocation.user_id = legacy.user_id
          and allocation.obligation_id = legacy.statement_id
          and allocation.ledger_event_id = legacy.transfer_group_id
      )
  );

create or replace function private.sync_credit_card_payment_allocation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare statement_account_id uuid;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from public.liability_payment_allocations allocation
    where allocation.user_id = old.user_id
      and allocation.obligation_id = old.statement_id
      and allocation.ledger_event_id = old.transfer_group_id;
    return old;
  end if;
  if tg_op = 'UPDATE' and (
    old.user_id, old.statement_id, old.transfer_group_id
  ) is distinct from (
    new.user_id, new.statement_id, new.transfer_group_id
  ) then
    delete from public.liability_payment_allocations allocation
    where allocation.user_id = old.user_id
      and allocation.obligation_id = old.statement_id
      and allocation.ledger_event_id = old.transfer_group_id;
  end if;
  select statement.account_id into statement_account_id
  from public.credit_card_statements statement
  where statement.user_id = new.user_id and statement.id = new.statement_id;
  if statement_account_id is null then raise exception 'credit card statement is not available'; end if;
  insert into public.liability_payment_allocations (
    id, user_id, account_id, obligation_id, ledger_event_id, amount, allocated_on
  ) values (
    new.id, new.user_id, statement_account_id, new.statement_id,
    new.transfer_group_id, new.amount, new.allocated_on
  ) on conflict (user_id, obligation_id, ledger_event_id) do update set
    account_id = excluded.account_id, amount = excluded.amount,
    allocated_on = excluded.allocated_on;
  return new;
end;
$$;

create or replace function private.sync_liability_payment_allocation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from public.credit_card_payment_allocations legacy
    where legacy.user_id = old.user_id and legacy.statement_id = old.obligation_id
      and legacy.transfer_group_id = old.ledger_event_id;
    return old;
  end if;
  if exists (
    select 1 from public.credit_card_statements statement
    where statement.user_id = new.user_id and statement.id = new.obligation_id
  ) then
    insert into public.credit_card_payment_allocations (
      id, user_id, statement_id, transfer_group_id, amount, allocated_on
    ) values (
      new.id, new.user_id, new.obligation_id, new.ledger_event_id,
      new.amount, new.allocated_on
    ) on conflict (user_id, statement_id, transfer_group_id) do update set
      amount = excluded.amount, allocated_on = excluded.allocated_on;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_credit_card_payment_allocation_v2()
  from public, anon, authenticated;
revoke all on function private.sync_liability_payment_allocation_v1()
  from public, anon, authenticated;
create trigger credit_card_payment_allocations_sync_v2
after insert or update or delete on public.credit_card_payment_allocations
for each row execute function private.sync_credit_card_payment_allocation_v2();
create trigger liability_payment_allocations_sync_v1
after insert or delete on public.liability_payment_allocations
for each row execute function private.sync_liability_payment_allocation_v1();

create or replace function private.refresh_one_credit_card_statement_payment_v2(
  p_user_id uuid,
  p_obligation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired_status text;
begin
  select case
    when statement.total_due <= 0.01
      or coalesce((
        select sum(allocation.amount)
        from public.liability_payment_allocations allocation
        where allocation.user_id = statement.user_id
          and allocation.obligation_id = statement.id
      ), 0) >= statement.total_due - 0.01 then 'paid'
    when statement.reconciled_at is not null then 'reconciled'
    when statement.due_on < current_date then 'overdue'
    when statement.due_on = current_date then 'due'
    else 'open'
  end into desired_status
  from public.credit_card_statements statement
  where statement.user_id = p_user_id and statement.id = p_obligation_id;

  if desired_status is null then return; end if;
  update public.credit_card_statements statement
  set status = desired_status,
      version = statement.version + 1,
      updated_at = now()
  where statement.user_id = p_user_id
    and statement.id = p_obligation_id
    and statement.status is distinct from desired_status;
end;
$$;

create or replace function private.refresh_credit_card_statement_payment_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.refresh_one_credit_card_statement_payment_v2(
      old.user_id, old.obligation_id
    );
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and (tg_op <> 'UPDATE' or (new.user_id, new.obligation_id)
       is distinct from (old.user_id, old.obligation_id)) then
    perform private.refresh_one_credit_card_statement_payment_v2(
      new.user_id, new.obligation_id
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.refresh_one_credit_card_statement_payment_v2(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.refresh_credit_card_statement_payment_v2()
  from public, anon, authenticated;
create trigger liability_payment_allocations_refresh_card_statement_v2
after insert or update or delete on public.liability_payment_allocations
for each row execute function private.refresh_credit_card_statement_payment_v2();

create or replace function private.sync_credit_card_installment_lifecycle_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Reopening a payment after a ledger-backed allocation is repaired also
    -- reopens the installments that this statement had marked as paid.
    if old.status = 'paid' and new.status <> 'paid' then
      update public.credit_card_installments installment
      set status = 'billed'
      where installment.user_id = new.user_id
        and installment.statement_id = new.id
        and installment.status = 'paid';
    end if;

    -- A corrected statement may move to another cycle. Detach only generated
    -- billing links; cancelled/manual rows remain untouched and auditable.
    update public.credit_card_installments installment
    set status = 'planned', statement_id = null
    from public.credit_card_purchase_plans plan
    where installment.user_id = old.user_id
      and installment.statement_id = old.id
      and installment.status = 'billed'
      and plan.user_id = installment.user_id
      and plan.id = installment.plan_id
      and (
        new.status not in ('reconciled', 'paid')
        or plan.account_id <> new.account_id
        or installment.due_on <= new.cutoff_on
        or installment.due_on > new.due_on
      );
  end if;

  if new.status in ('reconciled', 'paid') then
    update public.credit_card_installments installment
    set statement_id = new.id,
        status = case when new.status = 'paid' or new.total_due <= 0.01
          then 'paid' else 'billed' end
    from public.credit_card_purchase_plans plan
    where installment.user_id = new.user_id
      and plan.user_id = installment.user_id
      and plan.id = installment.plan_id
      and plan.account_id = new.account_id
      and plan.status <> 'cancelled'
      and installment.status in ('planned', 'billed')
      and (installment.statement_id is null or installment.statement_id = new.id)
      and installment.due_on > new.cutoff_on
      and installment.due_on <= new.due_on;
  end if;

  update public.credit_card_purchase_plans plan
  set status = case when not exists (
      select 1
      from public.credit_card_installments installment
      where installment.user_id = plan.user_id
        and installment.plan_id = plan.id
        and installment.status not in ('paid', 'cancelled')
    ) then 'completed' else 'active' end,
    updated_at = now()
  where plan.user_id = new.user_id
    and plan.account_id = new.account_id
    and plan.status <> 'cancelled'
    and plan.status is distinct from case when not exists (
      select 1
      from public.credit_card_installments installment
      where installment.user_id = plan.user_id
        and installment.plan_id = plan.id
        and installment.status not in ('paid', 'cancelled')
    ) then 'completed' else 'active' end;

  return new;
end;
$$;

revoke all on function private.sync_credit_card_installment_lifecycle_v2()
  from public, anon, authenticated;
create trigger credit_card_statements_sync_installment_lifecycle_v2
after insert or update of status, account_id, cutoff_on, due_on
on public.credit_card_statements
for each row execute function private.sync_credit_card_installment_lifecycle_v2();

-- Repair historical plan state with the same deterministic cycle rule.
with installment_matches as (
  select installment.user_id, installment.id as installment_id,
    statement.id as statement_id, statement.status as statement_status,
    row_number() over (
      partition by installment.user_id, installment.id
      order by statement.cutoff_on desc, statement.id
    ) as match_order
  from public.credit_card_installments installment
  join public.credit_card_purchase_plans plan
    on plan.user_id = installment.user_id and plan.id = installment.plan_id
  join public.credit_card_statements statement
    on statement.user_id = plan.user_id
   and statement.account_id = plan.account_id
   and statement.status in ('reconciled', 'paid')
   and installment.due_on > statement.cutoff_on
   and installment.due_on <= statement.due_on
  where installment.status in ('planned', 'billed')
    and plan.status <> 'cancelled'
)
update public.credit_card_installments installment
set statement_id = matched.statement_id,
    status = case when matched.statement_status = 'paid' then 'paid' else 'billed' end
from installment_matches matched
where matched.user_id = installment.user_id
  and matched.installment_id = installment.id
  and matched.match_order = 1;

update public.credit_card_purchase_plans plan
set status = case when not exists (
    select 1 from public.credit_card_installments installment
    where installment.user_id = plan.user_id
      and installment.plan_id = plan.id
      and installment.status not in ('paid', 'cancelled')
  ) then 'completed' else 'active' end,
  updated_at = now()
where plan.status <> 'cancelled';

insert into public.liability_event_metadata (user_id, ledger_event_id, account_id, role)
select plan.user_id, movement.ledger_event_id, plan.account_id,
  case when plan.installment_count = 1 then 'purchase' else 'purchase' end
from public.credit_card_purchase_plans plan
join public.transactions movement
  on movement.user_id = plan.user_id and movement.id = plan.transaction_id
on conflict (user_id, ledger_event_id, account_id) do nothing;

-- V1 purchase writes are tagged after their transaction and plan are durable.
create or replace function private.sync_credit_card_purchase_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_id uuid;
begin
  perform private.require_current_finance_user_v2();
  if not exists (
    select 1
    from public.liabilities liability
    join public.accounts account
      on account.user_id = liability.user_id and account.id = liability.account_id
    where liability.user_id = new.user_id
      and liability.account_id = new.account_id
      and liability.kind = 'credit_card'
      and liability.status = 'active'
      and not account.archived
  ) then
    raise exception 'credit card is not active';
  end if;
  select movement.ledger_event_id into event_id
  from public.transactions movement
  where movement.user_id = new.user_id and movement.id = new.transaction_id;
  if event_id is not null then
    insert into public.liability_event_metadata (user_id, ledger_event_id, account_id, role)
    values (new.user_id, event_id, new.account_id, 'purchase')
    on conflict (user_id, ledger_event_id, account_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_credit_card_purchase_v2() from public, anon, authenticated;
create trigger credit_card_purchase_plans_sync_v2
after insert on public.credit_card_purchase_plans
for each row execute function private.sync_credit_card_purchase_v2();

-- ---------------------------------------------------------------------------
-- Safe legacy debt-target migration
-- ---------------------------------------------------------------------------

alter table public.financial_target_debt_details
  add column migration_status text not null default 'pending'
    check (migration_status in ('pending', 'migrated', 'needs_review')),
  add column migrated_liability_account_id uuid,
  add constraint financial_target_debt_liability_owner_fkey
    foreign key (user_id, migrated_liability_account_id)
    references public.liabilities (user_id, account_id) on delete set null (migrated_liability_account_id);

create index financial_target_debt_migration_idx
  on public.financial_target_debt_details (user_id, migration_status, target_id);

-- A debt target already linked to a credit account can safely become a
-- liability façade. One target is selected deterministically when legacy data
-- linked several debt targets to the same account; the others need review.
with ranked as (
  select target.id, target.user_id, target.account_id,
    row_number() over (partition by target.user_id, target.account_id order by target.created_at, target.id) as position
  from public.financial_targets target
  join public.accounts account
    on account.user_id = target.user_id and account.id = target.account_id
  where target.kind = 'debt' and account.account_type = 'credit'
)
insert into public.liabilities (
  account_id, user_id, kind, status, creditor_name, original_principal,
  originated_on, maturity_on, legacy_target_id, migration_status
)
select target.account_id, target.user_id,
  case when card.account_id is not null then 'credit_card' else 'personal_debt' end,
  case target.status when 'archived' then 'archived' when 'completed' then 'settled'
    when 'paused' then 'paused' else 'active' end,
  detail.creditor, target.target_amount, target.starts_on, target.target_date,
  target.id, 'migrated'
from ranked migration
join public.financial_targets target
  on target.user_id = migration.user_id and target.id = migration.id
join public.financial_target_debt_details detail
  on detail.user_id = target.user_id and detail.target_id = target.id
left join public.credit_card_profiles card
  on card.user_id = target.user_id and card.account_id = target.account_id
where migration.position = 1
on conflict (account_id) do update set
  status = excluded.status,
  legacy_target_id = coalesce(public.liabilities.legacy_target_id, excluded.legacy_target_id),
  creditor_name = coalesce(public.liabilities.creditor_name, excluded.creditor_name),
  original_principal = coalesce(public.liabilities.original_principal, excluded.original_principal),
  migration_status = 'migrated';

update public.financial_target_debt_details detail
set migrated_liability_account_id = target.account_id,
    migration_status = 'migrated'
from public.financial_targets target
join public.liabilities liability
  on liability.user_id = target.user_id
 and liability.account_id = target.account_id
 and liability.legacy_target_id = target.id
where detail.user_id = target.user_id and detail.target_id = target.id;

update public.financial_target_debt_details detail
set migration_status = 'needs_review'
from public.financial_targets target
join public.accounts account
  on account.user_id = target.user_id and account.id = target.account_id
where detail.user_id = target.user_id and detail.target_id = target.id
  and target.kind = 'debt'
  and account.account_type <> 'credit';

-- Debt targets without an account receive a dedicated COP liability account.
-- Its opening balance is the remaining legacy debt, so no synthetic income or
-- expense is introduced and historical target progress is not double posted.
create temporary table obligations_v2_target_account_map
on commit drop
as
select target.id as target_id, target.user_id, gen_random_uuid() as account_id,
  greatest(target.target_amount - overview.progress_amount, 0)::numeric(18, 2) as remaining_debt
from public.financial_targets target
join public.financial_target_debt_details detail
  on detail.user_id = target.user_id and detail.target_id = target.id
join public.financial_target_overview overview
  on overview.user_id = target.user_id and overview.id = target.id
where target.kind = 'debt'
  and target.account_id is null
  and detail.migration_status = 'pending';

insert into public.accounts (
  id, user_id, name, account_type, initial_balance, color, icon,
  currency_code, opening_balance_date, opening_exchange_rate
)
select migration.account_id, migration.user_id, target.title, 'credit',
  -migration.remaining_debt, target.color, target.icon,
  'COP', target.starts_on, 1
from obligations_v2_target_account_map migration
join public.financial_targets target
  on target.user_id = migration.user_id and target.id = migration.target_id;

insert into public.liabilities (
  account_id, user_id, kind, status, creditor_name, original_principal,
  originated_on, maturity_on, legacy_target_id, migration_status
)
select migration.account_id, migration.user_id, 'personal_debt',
  case target.status when 'archived' then 'archived' when 'completed' then 'settled'
    when 'paused' then 'paused' else 'active' end,
  detail.creditor, target.target_amount, target.starts_on, target.target_date,
  target.id, 'migrated'
from obligations_v2_target_account_map migration
join public.financial_targets target
  on target.user_id = migration.user_id and target.id = migration.target_id
join public.financial_target_debt_details detail
  on detail.user_id = target.user_id and detail.target_id = target.id;

update public.financial_targets target
set account_id = migration.account_id
from obligations_v2_target_account_map migration
where target.user_id = migration.user_id and target.id = migration.target_id;

update public.financial_target_debt_details detail
set migrated_liability_account_id = migration.account_id,
    migration_status = 'migrated'
from obligations_v2_target_account_map migration
where detail.user_id = migration.user_id and detail.target_id = migration.target_id;

insert into public.liability_terms (
  user_id, account_id, starts_on, payment_frequency, calculation_method,
  due_day, contractual_minimum, source
)
select detail.user_id, detail.migrated_liability_account_id, target.starts_on,
  'monthly', 'manual', detail.due_day, detail.minimum_payment, 'migration'
from public.financial_target_debt_details detail
join public.financial_targets target
  on target.user_id = detail.user_id and target.id = detail.target_id
where detail.migration_status = 'migrated'
  and detail.migrated_liability_account_id is not null
  and not exists (
    select 1 from public.liability_terms term
    where term.user_id = detail.user_id
      and term.account_id = detail.migrated_liability_account_id
  )
on conflict (user_id, account_id, starts_on) do nothing;

insert into public.liability_rate_periods (
  user_id, account_id, rate_kind, rate_basis, reported_value,
  effective_annual_rate, starts_on, source
)
select detail.user_id, detail.migrated_liability_account_id, 'principal',
  'effective_annual', detail.annual_interest_rate, detail.annual_interest_rate,
  target.starts_on, 'migration'
from public.financial_target_debt_details detail
join public.financial_targets target
  on target.user_id = detail.user_id and target.id = detail.target_id
where detail.migration_status = 'migrated'
  and detail.migrated_liability_account_id is not null
  and detail.annual_interest_rate is not null
  and not exists (
    select 1 from public.liability_rate_periods rate
    where rate.user_id = detail.user_id
      and rate.account_id = detail.migrated_liability_account_id
      and rate.rate_kind = 'principal'
  )
on conflict (user_id, account_id, rate_kind, starts_on) do nothing;

update public.financial_target_debt_details
set migration_status = 'needs_review'
where migration_status = 'pending';

create or replace function private.validate_reconciled_credit_card_statement_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger_debt numeric;
  allocated_total numeric;
begin
  if new.status = 'paid' then
    select coalesce(sum(allocation.amount), 0) into allocated_total
    from public.liability_payment_allocations allocation
    where allocation.user_id = new.user_id
      and allocation.obligation_id = new.id;
    if new.total_due > 0.01 and allocated_total < new.total_due - 0.01 then
      raise exception 'a paid statement requires ledger-backed payment allocations';
    end if;
    return null;
  end if;
  if new.status <> 'reconciled' then return null; end if;
  ledger_debt := greatest(-coalesce(
    private.liability_native_balance_at_v2(new.user_id, new.account_id, new.cutoff_on), 0
  ), 0);
  if abs(ledger_debt - new.total_due) > 0.01 then
    raise exception 'reconciled statement total does not match the ledger at cutoff';
  end if;
  return null;
end;
$$;

revoke all on function private.validate_reconciled_credit_card_statement_v2()
  from public, anon, authenticated;
create constraint trigger credit_card_statements_validate_reconciliation_v2
after insert or update on public.credit_card_statements
deferrable initially deferred
for each row execute function private.validate_reconciled_credit_card_statement_v2();

create or replace function public.preview_liability_reconciliation_v2(
  p_account_id uuid,
  p_cutoff_on date,
  p_total_due numeric,
  p_obligation_id uuid default null,
  p_period_start date default null,
  p_interest numeric default 0,
  p_fees numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  native_balance numeric;
  reporting_balance numeric;
  currency_code text;
  ledger_debt_before_statement_charges numeric;
  ledger_debt numeric;
  posted_interest numeric := 0;
  posted_fees numeric := 0;
  interest_to_post numeric;
  fees_to_post numeric;
  difference numeric;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_cutoff_on is null or p_total_due is null or p_total_due < 0
     or coalesce(p_interest, 0) < 0 or coalesce(p_fees, 0) < 0 then
    raise exception 'cutoff and non-negative statement amounts are required';
  end if;
  if p_period_start is not null and p_period_start > p_cutoff_on then
    raise exception 'statement period cannot start after its cutoff';
  end if;
  select account.currency_code into currency_code
  from public.accounts account
  join public.liabilities liability
    on liability.user_id = account.user_id and liability.account_id = account.id
  where account.user_id = caller_id and account.id = p_account_id;
  if not found then raise exception 'liability is not available'; end if;
  if p_obligation_id is not null and exists (
    select 1
    from public.liability_obligations obligation
    where obligation.user_id = caller_id
      and obligation.id = p_obligation_id
      and obligation.account_id <> p_account_id
  ) then
    raise exception 'statement obligation belongs to a different liability';
  end if;

  if p_obligation_id is not null then
    select
      coalesce(sum(case
        when metadata.role = 'interest' and movement.kind in ('expense', 'adjustment_out') then movement.amount
        when metadata.role = 'interest' and movement.kind = 'adjustment_in' then -movement.amount
        else 0 end), 0),
      coalesce(sum(case
        when metadata.role = 'fee' and movement.kind in ('expense', 'adjustment_out') then movement.amount
        when metadata.role = 'fee' and movement.kind = 'adjustment_in' then -movement.amount
        else 0 end), 0)
    into posted_interest, posted_fees
    from public.liability_event_metadata metadata
    join public.transactions movement
      on movement.user_id = metadata.user_id
     and movement.ledger_event_id = metadata.ledger_event_id
     and movement.account_id = metadata.account_id
    where metadata.user_id = caller_id
      and metadata.account_id = p_account_id
      and metadata.related_obligation_id = p_obligation_id
      and metadata.role in ('interest', 'fee');
  end if;

  native_balance := private.liability_native_balance_at_v2(caller_id, p_account_id, p_cutoff_on);
  reporting_balance := private.liability_reporting_balance_at_v2(caller_id, p_account_id, p_cutoff_on);
  interest_to_post := round(coalesce(p_interest, 0) - posted_interest, 2);
  fees_to_post := round(coalesce(p_fees, 0) - posted_fees, 2);
  ledger_debt_before_statement_charges := greatest(
    -(coalesce(native_balance, 0) + posted_interest + posted_fees), 0
  );
  ledger_debt := greatest(
    -(coalesce(native_balance, 0) - interest_to_post - fees_to_post), 0
  );
  difference := round(p_total_due - ledger_debt, 2);
  return jsonb_build_object(
    'accountId', p_account_id,
    'cutoffOn', p_cutoff_on,
    'currencyCode', currency_code,
    'ledgerDebtBeforeStatementCharges', ledger_debt_before_statement_charges,
    'ledgerBalance', native_balance,
    'ledgerDebt', ledger_debt,
    'reportingBalance', reporting_balance,
    'statementTotal', p_total_due,
    'postedInterest', posted_interest,
    'postedFees', posted_fees,
    'interestToPost', interest_to_post,
    'feesToPost', fees_to_post,
    'difference', difference,
    'adjustmentKind', case when difference > 0.01 then 'adjustment_out'
      when difference < -0.01 then 'adjustment_in' else null end,
    'isBalanced', abs(difference) <= 0.01,
    'requiresExchangeRate', currency_code = 'USD' and (
      abs(interest_to_post) > 0.01 or abs(fees_to_post) > 0.01 or abs(difference) > 0.01
    )
  );
end;
$$;

create or replace function private.credit_card_statement_posting_id_v2(
  p_operation_id uuid,
  p_role text
)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (
    substr(value, 1, 8) || '-' || substr(value, 9, 4) || '-' ||
    substr(value, 13, 4) || '-' || substr(value, 17, 4) || '-' ||
    substr(value, 21, 12)
  )::uuid
  from (select md5(p_operation_id::text || ':credit-card-statement:' || p_role) as value) hashed;
$$;

revoke all on function private.credit_card_statement_posting_id_v2(uuid, text)
  from public, anon, authenticated;

create or replace function public.upsert_liability_obligation_v2(
  p_operation_id uuid,
  p_obligation jsonb,
  p_statement jsonb default null,
  p_adjustments jsonb default '[]'::jsonb,
  p_reconcile_difference boolean default false,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  obligation_id uuid := (p_obligation->>'id')::uuid;
  liability_account_id uuid := (p_obligation->>'account_id')::uuid;
  obligation_record public.liability_obligations%rowtype;
  prior_result jsonb;
  adjustment jsonb;
  statement_charge jsonb;
  saved_transaction public.transactions%rowtype;
  account_currency text;
  total_due numeric := (p_obligation->>'total_due')::numeric;
  cutoff_on date;
  ledger_debt numeric;
  difference numeric := 0;
  reconciliation_transaction_id uuid;
  reconciliation_exchange_rate numeric;
  adjustment_kind text;
  posted_interest numeric := 0;
  posted_fees numeric := 0;
  statement_charge_delta numeric;
  statement_charge_id uuid;
  statement_charge_kind text;
  requested_kind text := case
    when p_statement is not null then 'credit_card_statement'
    else coalesce(nullif(p_obligation->>'kind', ''), 'manual_due')
  end;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or obligation_id is null or liability_account_id is null then
    raise exception 'operation, obligation and liability are required';
  end if;
  select receipt.result into prior_result from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.obligation.upsert.v2';
  if found then return prior_result; end if;
  if jsonb_typeof(p_adjustments) <> 'array' or jsonb_array_length(p_adjustments) > 50 then
    raise exception 'adjustments must be an array of at most 50 rows';
  end if;
  select account.currency_code into account_currency
  from public.accounts account
  join public.liabilities liability
    on liability.user_id = account.user_id and liability.account_id = account.id
  where account.user_id = caller_id and account.id = liability_account_id;
  if not found then raise exception 'liability is not available'; end if;
  select * into obligation_record from public.liability_obligations obligation
  where obligation.user_id = caller_id and obligation.id = obligation_id for update;
  if found and (p_expected_version is null or obligation_record.version <> p_expected_version) then
    raise exception 'obligation was modified elsewhere';
  end if;
  if p_statement is not null
     and coalesce(nullif(p_obligation->>'kind', ''), 'credit_card_statement') <> 'credit_card_statement' then
    raise exception 'statement details require a credit card statement obligation';
  end if;
  if found and (
    obligation_record.account_id is distinct from liability_account_id
    or obligation_record.kind <> requested_kind
  ) then
    raise exception 'an obligation cannot move to another account or type';
  end if;

  for adjustment in select value from jsonb_array_elements(p_adjustments)
  loop
    if adjustment->>'kind' not in ('expense', 'adjustment_in', 'adjustment_out') then
      raise exception 'unsupported reconciliation posting kind';
    end if;
    if adjustment->>'role' not in ('interest', 'fee', 'refund', 'forgiveness', 'adjustment') then
      raise exception 'unsupported reconciliation posting role';
    end if;
    if account_currency = 'USD' and nullif(adjustment->>'exchange_rate', '')::numeric is null then
      raise exception 'an exact exchange rate is required for USD reconciliation postings';
    end if;
    insert into public.transactions (
      id, user_id, account_id, category_id, kind, amount, description, merchant,
      note, icon, occurred_on, native_currency_code, base_currency_code,
      base_amount, exchange_rate, exchange_rate_date, exchange_rate_source,
      reference_exchange_rate, reference_rate_source
    ) values (
      (adjustment->>'id')::uuid, caller_id, liability_account_id,
      nullif(adjustment->>'category_id', '')::uuid, adjustment->>'kind',
      (adjustment->>'amount')::numeric,
      coalesce(nullif(adjustment->>'description', ''), 'Conciliacion de obligacion'),
      nullif(adjustment->>'merchant', ''), nullif(adjustment->>'note', ''),
      nullif(adjustment->>'icon', ''),
      coalesce(nullif(adjustment->>'occurred_on', '')::date,
        nullif(p_obligation->>'period_end', '')::date, current_date),
      account_currency, 'COP', null,
      case when account_currency = 'COP' then 1 else (adjustment->>'exchange_rate')::numeric end,
      coalesce(nullif(adjustment->>'exchange_rate_date', '')::date,
        nullif(adjustment->>'occurred_on', '')::date, current_date),
      case when account_currency = 'COP' then 'same_currency'
        else coalesce(nullif(adjustment->>'exchange_rate_source', ''), 'manual') end,
      nullif(adjustment->>'reference_exchange_rate', '')::numeric,
      nullif(adjustment->>'reference_rate_source', '')
    ) on conflict (id) do nothing
    returning * into saved_transaction;
    if saved_transaction.id is null then
      select * into saved_transaction from public.transactions movement
      where movement.user_id = caller_id and movement.id = (adjustment->>'id')::uuid;
      if saved_transaction.account_id <> liability_account_id
         or saved_transaction.amount <> (adjustment->>'amount')::numeric
         or saved_transaction.kind <> adjustment->>'kind' then
        raise exception 'reconciliation posting id was reused with different data';
      end if;
    end if;
    insert into public.liability_event_metadata (
      user_id, ledger_event_id, account_id, role, related_obligation_id
    ) values (
      caller_id, saved_transaction.ledger_event_id, liability_account_id,
      adjustment->>'role', obligation_id
    ) on conflict (user_id, ledger_event_id, account_id) do nothing;
    saved_transaction := null;
  end loop;

  if p_statement is not null then
    cutoff_on := (p_statement->>'cutoff_on')::date;
    if cutoff_on is null then raise exception 'statement cutoff is required'; end if;

    if coalesce(p_statement->>'status', '') in ('reconciled', 'paid') then
      select
        coalesce(sum(case
          when metadata.role = 'interest' and movement.kind in ('expense', 'adjustment_out') then movement.amount
          when metadata.role = 'interest' and movement.kind = 'adjustment_in' then -movement.amount
          else 0 end), 0),
        coalesce(sum(case
          when metadata.role = 'fee' and movement.kind in ('expense', 'adjustment_out') then movement.amount
          when metadata.role = 'fee' and movement.kind = 'adjustment_in' then -movement.amount
          else 0 end), 0)
      into posted_interest, posted_fees
      from public.liability_event_metadata metadata
      join public.transactions movement
        on movement.user_id = metadata.user_id
       and movement.ledger_event_id = metadata.ledger_event_id
       and movement.account_id = metadata.account_id
      where metadata.user_id = caller_id
        and metadata.account_id = liability_account_id
        and metadata.related_obligation_id = obligation_id
        and metadata.role in ('interest', 'fee');

      reconciliation_exchange_rate := case when account_currency = 'COP' then 1
        else nullif(p_statement->>'reconciliation_exchange_rate', '')::numeric end;

      for statement_charge in
        select value from jsonb_array_elements(jsonb_build_array(
          jsonb_build_object(
            'role', 'interest',
            'desired', coalesce(nullif(p_statement->>'interest', '')::numeric, 0),
            'posted', posted_interest
          ),
          jsonb_build_object(
            'role', 'fee',
            'desired', coalesce(nullif(p_statement->>'fees', '')::numeric, 0),
            'posted', posted_fees
          )
        ))
      loop
        statement_charge_delta := round(
          (statement_charge->>'desired')::numeric - (statement_charge->>'posted')::numeric,
          2
        );
        if abs(statement_charge_delta) <= 0.01 then continue; end if;
        if reconciliation_exchange_rate is null or reconciliation_exchange_rate <= 0 then
          raise exception 'an exact exchange rate is required for USD statement charges';
        end if;

        statement_charge_id := private.credit_card_statement_posting_id_v2(
          p_operation_id, statement_charge->>'role'
        );
        statement_charge_kind := case when statement_charge_delta > 0
          then 'expense' else 'adjustment_in' end;
        saved_transaction := null;
        insert into public.transactions (
          id, user_id, account_id, kind, amount, description, occurred_on,
          native_currency_code, base_currency_code, base_amount, exchange_rate,
          exchange_rate_date, exchange_rate_source
        ) values (
          statement_charge_id, caller_id, liability_account_id,
          statement_charge_kind, abs(statement_charge_delta),
          case when statement_charge->>'role' = 'interest'
            then case when statement_charge_delta > 0
              then 'Intereses del extracto' else 'Correccion de intereses del extracto' end
            else case when statement_charge_delta > 0
              then 'Cargos del extracto' else 'Correccion de cargos del extracto' end
          end,
          cutoff_on, account_currency, 'COP', null, reconciliation_exchange_rate,
          cutoff_on,
          case when account_currency = 'COP' then 'same_currency'
            else coalesce(nullif(p_statement->>'reconciliation_exchange_rate_source', ''), 'manual') end
        ) on conflict (id) do nothing
        returning * into saved_transaction;
        if saved_transaction.id is null then
          select * into saved_transaction
          from public.transactions movement
          where movement.user_id = caller_id and movement.id = statement_charge_id;
          if saved_transaction.account_id <> liability_account_id
             or saved_transaction.amount <> abs(statement_charge_delta)
             or saved_transaction.kind <> statement_charge_kind then
            raise exception 'statement charge id was reused with different data';
          end if;
        end if;
        insert into public.liability_event_metadata (
          user_id, ledger_event_id, account_id, role, related_obligation_id
        ) values (
          caller_id, saved_transaction.ledger_event_id, liability_account_id,
          statement_charge->>'role', obligation_id
        ) on conflict (user_id, ledger_event_id, account_id) do nothing;
      end loop;
    end if;

    ledger_debt := greatest(-coalesce(
      private.liability_native_balance_at_v2(caller_id, liability_account_id, cutoff_on), 0
    ), 0);
    difference := round(total_due - ledger_debt, 2);
    if abs(difference) > 0.01 and p_reconcile_difference then
      reconciliation_transaction_id := coalesce(
        nullif(p_statement->>'reconciliation_transaction_id', '')::uuid,
        p_operation_id
      );
      reconciliation_exchange_rate := case when account_currency = 'COP' then 1
        else nullif(p_statement->>'reconciliation_exchange_rate', '')::numeric end;
      if reconciliation_exchange_rate is null or reconciliation_exchange_rate <= 0 then
        raise exception 'an exact exchange rate is required to reconcile a USD statement';
      end if;
      adjustment_kind := case when difference > 0 then 'adjustment_out' else 'adjustment_in' end;
      insert into public.transactions (
        id, user_id, account_id, kind, amount, description, occurred_on,
        native_currency_code, base_currency_code, base_amount, exchange_rate,
        exchange_rate_date, exchange_rate_source
      ) values (
        reconciliation_transaction_id, caller_id, liability_account_id,
        adjustment_kind, abs(difference), 'Ajuste de conciliacion de extracto', cutoff_on,
        account_currency, 'COP', null, reconciliation_exchange_rate, cutoff_on,
        case when account_currency = 'COP' then 'same_currency' else
          coalesce(nullif(p_statement->>'reconciliation_exchange_rate_source', ''), 'manual') end
      ) on conflict (id) do nothing
      returning * into saved_transaction;
      if saved_transaction.id is null then
        select * into saved_transaction from public.transactions movement
        where movement.user_id = caller_id and movement.id = reconciliation_transaction_id;
        if saved_transaction.account_id <> liability_account_id
           or saved_transaction.amount <> abs(difference)
           or saved_transaction.kind <> adjustment_kind then
          raise exception 'reconciliation adjustment id was reused with different data';
        end if;
      end if;
      insert into public.liability_event_metadata (
        user_id, ledger_event_id, account_id, role, related_obligation_id
      ) values (
        caller_id, saved_transaction.ledger_event_id, liability_account_id,
        'adjustment', obligation_id
      )
      on conflict (user_id, ledger_event_id, account_id) do nothing;
    elsif abs(difference) > 0.01 and coalesce(p_statement->>'status', '') = 'reconciled' then
      raise exception 'statement and ledger differ; confirm a reconciliation adjustment first';
    end if;

    insert into public.credit_card_statements (
      id, user_id, account_id, period_start, period_end, cutoff_on, due_on,
      total_due, minimum_due, purchases, advances, interest, fees, payments,
      refunds, status, reconciled_at
    ) values (
      obligation_id, caller_id, liability_account_id,
      (p_obligation->>'period_start')::date, (p_obligation->>'period_end')::date,
      cutoff_on, (p_obligation->>'due_on')::date, total_due,
      coalesce(nullif(p_obligation->>'minimum_due', '')::numeric, 0),
      coalesce(nullif(p_statement->>'purchases', '')::numeric, 0),
      coalesce(nullif(p_statement->>'advances', '')::numeric, 0),
      coalesce(nullif(p_statement->>'interest', '')::numeric, 0),
      coalesce(nullif(p_statement->>'fees', '')::numeric, 0),
      coalesce(nullif(p_statement->>'payments', '')::numeric, 0),
      coalesce(nullif(p_statement->>'refunds', '')::numeric, 0),
      coalesce(nullif(p_statement->>'status', ''), 'open'),
      nullif(p_statement->>'reconciled_at', '')::timestamptz
    ) on conflict (id) do update set
      period_start = excluded.period_start, period_end = excluded.period_end,
      cutoff_on = excluded.cutoff_on, due_on = excluded.due_on,
      total_due = excluded.total_due, minimum_due = excluded.minimum_due,
      purchases = excluded.purchases, advances = excluded.advances,
      interest = excluded.interest, fees = excluded.fees,
      payments = excluded.payments, refunds = excluded.refunds,
      status = excluded.status, reconciled_at = excluded.reconciled_at,
      version = public.credit_card_statements.version + 1
    where public.credit_card_statements.user_id = caller_id;
  else
    insert into public.liability_obligations (
      id, user_id, account_id, kind, sequence_number, period_start, period_end,
      due_on, principal_due, interest_due, fee_due, minimum_due, total_due,
      status, source
    ) values (
      obligation_id, caller_id, liability_account_id,
      requested_kind,
      nullif(p_obligation->>'sequence_number', '')::integer,
      nullif(p_obligation->>'period_start', '')::date,
      nullif(p_obligation->>'period_end', '')::date,
      (p_obligation->>'due_on')::date,
      coalesce(nullif(p_obligation->>'principal_due', '')::numeric, 0),
      coalesce(nullif(p_obligation->>'interest_due', '')::numeric, 0),
      coalesce(nullif(p_obligation->>'fee_due', '')::numeric, 0),
      coalesce(nullif(p_obligation->>'minimum_due', '')::numeric, 0),
      total_due, coalesce(nullif(p_obligation->>'status', ''), 'open'),
      coalesce(nullif(p_obligation->>'source', ''), 'manual')
    ) on conflict (id) do update set
      sequence_number = excluded.sequence_number, period_start = excluded.period_start,
      period_end = excluded.period_end, due_on = excluded.due_on,
      principal_due = excluded.principal_due, interest_due = excluded.interest_due,
      fee_due = excluded.fee_due, minimum_due = excluded.minimum_due,
      total_due = excluded.total_due, status = excluded.status, source = excluded.source,
      version = public.liability_obligations.version + 1
    where public.liability_obligations.user_id = caller_id
    returning * into obligation_record;
  end if;

  select * into obligation_record from public.liability_obligations obligation
  where obligation.user_id = caller_id and obligation.id = obligation_id;
  prior_result := jsonb_build_object(
    'obligationId', obligation_record.id,
    'obligationVersion', obligation_record.version,
    'reconciliationAdjustment', difference,
    'reconciliationTransactionId', reconciliation_transaction_id
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.obligation.upsert.v2', prior_result);
  return prior_result;
end;
$$;

create or replace function private.uuid_from_text_v2(p_value text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (
    substr(hash.value, 1, 8) || '-' || substr(hash.value, 9, 4) || '-' ||
    substr(hash.value, 13, 4) || '-' || substr(hash.value, 17, 4) || '-' ||
    substr(hash.value, 21, 12)
  )::uuid
  from (select md5(p_value) as value) hash;
$$;

revoke all on function private.uuid_from_text_v2(text)
  from public, anon, authenticated, service_role;

-- Background jobs do not have an authenticated JWT, so they cannot reuse the
-- caller-oriented access helper. Resolve authorization from the immutable user
-- id instead and keep the allowlist as the single source of access truth.
create or replace function private.is_finance_user_enabled_v2(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users account
    join private.access_allowlist allowed
      on allowed.email = lower(trim(account.email))
    where account.id = p_user_id
      and allowed.enabled
  );
$$;

revoke all on function private.is_finance_user_enabled_v2(uuid)
  from public, anon, authenticated, service_role;

-- Disabling an allowed email must also stop unattended financial mutations.
-- Rules remain stored for audit but are deliberately not re-enabled if access
-- is granted again; the user has to make that choice explicitly.
create or replace function private.stop_revoked_finance_automation_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected_user_id uuid;
begin
  if new.enabled or (old.enabled is not distinct from new.enabled) then
    return new;
  end if;
  select account.id into affected_user_id
  from auth.users account
  where lower(trim(account.email)) = new.email
  limit 1;
  if affected_user_id is null then return new; end if;

  update public.liability_payment_rules rule
  set active = false,
      version = rule.version + 1,
      updated_at = now()
  where rule.user_id = affected_user_id
    and rule.active;

  update public.liability_payment_intents intent
  set status = 'cancelled',
      failure_reason = 'access revoked before automatic payment',
      version = intent.version + 1,
      updated_at = now()
  where intent.user_id = affected_user_id
    and intent.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')
    and intent.ledger_event_id is null;
  return new;
end;
$$;

revoke all on function private.stop_revoked_finance_automation_v2()
  from public, anon, authenticated, service_role;

drop trigger if exists stop_revoked_finance_automation_v2 on private.access_allowlist;
create trigger stop_revoked_finance_automation_v2
after update of enabled on private.access_allowlist
for each row
execute function private.stop_revoked_finance_automation_v2();

create or replace function private.record_liability_payment_core_v2(
  p_user_id uuid,
  p_operation_id uuid,
  p_payment jsonb,
  p_allocations jsonb,
  p_write_receipt boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  liability_account_id uuid := (p_payment->>'liability_account_id')::uuid;
  funding_account_id uuid := (p_payment->>'funding_account_id')::uuid;
  payment_transfer_group_id uuid := coalesce(nullif(p_payment->>'transfer_group_id', '')::uuid, p_operation_id);
  funding_transaction_id uuid := coalesce(
    nullif(p_payment->>'funding_transaction_id', '')::uuid,
    private.uuid_from_text_v2(p_operation_id::text || ':funding')
  );
  liability_transaction_id uuid := coalesce(
    nullif(p_payment->>'liability_transaction_id', '')::uuid,
    private.uuid_from_text_v2(p_operation_id::text || ':liability')
  );
  liability_amount numeric := (p_payment->>'liability_amount')::numeric;
  funding_amount numeric := coalesce(nullif(p_payment->>'funding_amount', '')::numeric, liability_amount);
  payment_occurred_on date := coalesce(nullif(p_payment->>'occurred_on', '')::date, current_date);
  funding_currency text;
  funding_balance_after_lock numeric;
  liability_currency text;
  liability_kind text;
  funding_rate numeric;
  liability_rate numeric;
  liability_debt_before numeric;
  principal_after_payment numeric;
  interest_charge numeric := 0;
  fee_charge numeric := 0;
  liability_category_id uuid;
  linked_target_id uuid;
  interest_transaction_id uuid := coalesce(
    nullif(p_payment->>'interest_transaction_id', '')::uuid,
    private.uuid_from_text_v2(p_operation_id::text || ':interest')
  );
  fee_transaction_id uuid := coalesce(
    nullif(p_payment->>'fee_transaction_id', '')::uuid,
    private.uuid_from_text_v2(p_operation_id::text || ':fee')
  );
  charge_event_id uuid;
  allocation_total numeric;
  prior_result jsonb;
  saved_event uuid;
  future_schedule jsonb := p_payment->'future_schedule';
  future_principal numeric;
  current_terms public.liability_terms%rowtype;
  automatic_intent_id uuid := nullif(p_payment->>'intent_id', '')::uuid;
  automatic_intent_status text;
  automatic_rule_strategy text;
  automatic_rule_fixed_amount numeric;
  automatic_rule_maximum_amount numeric;
  automatic_obligation_id uuid;
  automatic_obligation_minimum numeric;
  automatic_obligation_total numeric;
  automatic_obligation_interest numeric;
  automatic_obligation_fee numeric;
  automatic_obligation_paid numeric;
  automatic_allowed_amount numeric;
begin
  if p_operation_id is null then raise exception 'operation is required'; end if;
  if p_write_receipt then
    select receipt.result into prior_result from public.mutation_receipts receipt
    where receipt.operation_id = p_operation_id and receipt.user_id = p_user_id
      and receipt.operation = 'liability.payment.record.v2';
    if found then return prior_result; end if;
  elsif exists (
    select 1 from public.liability_event_metadata metadata
    where metadata.user_id = p_user_id and metadata.ledger_event_id = payment_transfer_group_id
      and metadata.account_id = liability_account_id and metadata.role = 'payment'
  ) then
    return jsonb_build_object('ledgerEventId', payment_transfer_group_id, 'replayed', true);
  end if;
  if liability_account_id is null or funding_account_id is null then
    raise exception 'funding account and liability are required';
  end if;
  if liability_account_id = funding_account_id then raise exception 'payment accounts must differ'; end if;
  -- Serialize both accounts in deterministic order. This protects allocations
  -- and also prevents two automatic payments for different debts from spending
  -- the same funding balance concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || least(liability_account_id::text, funding_account_id::text), 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || greatest(liability_account_id::text, funding_account_id::text), 0)
  );
  -- A concurrent retry may have committed while this call waited for the lock.
  if p_write_receipt then
    select receipt.result into prior_result from public.mutation_receipts receipt
    where receipt.operation_id = p_operation_id and receipt.user_id = p_user_id
      and receipt.operation = 'liability.payment.record.v2';
    if found then return prior_result; end if;
  elsif exists (
    select 1 from public.liability_event_metadata metadata
    where metadata.user_id = p_user_id and metadata.ledger_event_id = payment_transfer_group_id
      and metadata.account_id = liability_account_id and metadata.role = 'payment'
  ) then
    return jsonb_build_object('ledgerEventId', payment_transfer_group_id, 'replayed', true);
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) > 200 then
    raise exception 'allocations must be an array of at most 200 rows';
  end if;
  if liability_amount is null or liability_amount <= 0 or funding_amount is null or funding_amount <= 0 then
    raise exception 'payment amounts must be positive';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as requested(obligation_id uuid, amount numeric)
    where requested.obligation_id is null or requested.amount is null or requested.amount <= 0
  ) then raise exception 'every allocation needs a positive amount and obligation'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as requested(obligation_id uuid, amount numeric)
    group by requested.obligation_id having count(*) > 1
  ) then raise exception 'an obligation can only be allocated once per payment'; end if;

  select account.currency_code, liability.kind, liability.legacy_target_id,
    (
      select target.category_id
      from public.financial_targets target
      where target.user_id = p_user_id and target.id = liability.legacy_target_id
    )
  into liability_currency, liability_kind, linked_target_id, liability_category_id
  from public.accounts account
  join public.liabilities liability
    on liability.user_id = account.user_id and liability.account_id = account.id
  where account.user_id = p_user_id and account.id = liability_account_id
    and not account.archived and liability.status <> 'archived';
  if not found then raise exception 'liability is not available'; end if;
  select account.currency_code into funding_currency
  from public.accounts account
  where account.user_id = p_user_id and account.id = funding_account_id and not account.archived;
  if not found then raise exception 'funding account is not available'; end if;

  -- Automatic intents are revalidated while holding the exact same account
  -- locks used by manual payments. This closes the race where a manual payment
  -- covers (or partly covers) a minimum while the worker is waiting.
  if automatic_intent_id is not null then
    select intent.status, intent.obligation_id, rule.strategy, rule.fixed_amount,
      rule.maximum_amount
    into automatic_intent_status, automatic_obligation_id,
      automatic_rule_strategy, automatic_rule_fixed_amount,
      automatic_rule_maximum_amount
    from public.liability_payment_intents intent
    join public.liability_payment_rules rule
      on rule.user_id = intent.user_id and rule.id = intent.rule_id
    where intent.user_id = p_user_id and intent.id = automatic_intent_id
      and intent.account_id = liability_account_id
      and rule.account_id = liability_account_id
      and intent.ledger_event_id is null
      and intent.status in ('planned', 'confirmed')
      and rule.active and not rule.suspended_by_target
      and rule.detached_at is null
      and rule.recording_mode = 'auto_post'
      and rule.funding_account_id = (p_payment->>'funding_account_id')::uuid
    for update of intent, rule;
    if not found then
      return jsonb_build_object(
        'skipped', true, 'retryable', true,
        'reason', 'automatic payment configuration changed before posting'
      );
    end if;

    liability_debt_before := greatest(-coalesce(private.liability_native_balance_at_v2(
      p_user_id, liability_account_id, payment_occurred_on
    ), 0), 0);
    if automatic_obligation_id is not null then
      select obligation.minimum_due, obligation.total_due,
        obligation.interest_due, obligation.fee_due,
        coalesce(sum(allocation.amount), 0)
      into automatic_obligation_minimum, automatic_obligation_total,
        automatic_obligation_interest, automatic_obligation_fee,
        automatic_obligation_paid
      from public.liability_obligations obligation
      left join public.liability_payment_allocations allocation
        on allocation.user_id = obligation.user_id
       and allocation.obligation_id = obligation.id
      where obligation.user_id = p_user_id
        and obligation.id = automatic_obligation_id
        and obligation.account_id = liability_account_id
        and obligation.status in ('projected', 'open', 'due', 'partial', 'overdue')
      group by obligation.id;
      if not found then
        return jsonb_build_object(
          'skipped', true, 'reason', 'automatic payment obligation is no longer payable'
        );
      end if;
      automatic_allowed_amount := case
        when automatic_rule_strategy in ('fixed', 'minimum_due', 'statement_total') then
          private.liability_rule_obligation_amount_v2(
            automatic_rule_strategy, automatic_rule_fixed_amount,
            automatic_obligation_minimum, automatic_obligation_total,
            automatic_obligation_paid
          )
        else greatest(automatic_obligation_total - automatic_obligation_paid, 0)
      end;
      automatic_allowed_amount := least(
        automatic_allowed_amount,
        coalesce(automatic_rule_maximum_amount, 999999999999999999::numeric),
        private.liability_payment_cap_v2(
          liability_kind, liability_debt_before, automatic_obligation_total,
          automatic_obligation_interest, automatic_obligation_fee,
          automatic_obligation_paid
        )
      );
    else
      automatic_allowed_amount := least(
        liability_debt_before,
        coalesce(automatic_rule_maximum_amount, 999999999999999999::numeric)
      );
    end if;

    if coalesce(automatic_allowed_amount, 0) <= 0.01 then
      return jsonb_build_object(
        'skipped', true, 'reason', 'already covered by recorded payments'
      );
    end if;
    if liability_amount > automatic_allowed_amount then
      liability_amount := automatic_allowed_amount;
      funding_amount := automatic_allowed_amount;
      if automatic_obligation_id is not null then
        p_allocations := jsonb_build_array(jsonb_build_object(
          'obligation_id', automatic_obligation_id,
          'amount', automatic_allowed_amount,
          'allocated_on', payment_occurred_on
        ));
      end if;
      update public.liability_payment_intents intent
      set planned_amount = automatic_allowed_amount,
          version = intent.version + 1,
          updated_at = now()
      where intent.user_id = p_user_id and intent.id = automatic_intent_id;
    end if;
  end if;

  if coalesce((p_payment->>'require_funding_balance')::boolean, false) then
    funding_balance_after_lock := private.liability_native_balance_at_v2(
      p_user_id, funding_account_id, payment_occurred_on
    );
    if coalesce(funding_balance_after_lock, 0) + 0.01 < funding_amount then
      raise exception 'funding account has insufficient balance';
    end if;
  end if;

  funding_rate := case when funding_currency = 'COP' then 1
    else nullif(p_payment->>'funding_exchange_rate', '')::numeric end;
  liability_rate := case when liability_currency = 'COP' then 1
    else nullif(p_payment->>'liability_exchange_rate', '')::numeric end;
  if funding_rate is null or funding_rate <= 0 or liability_rate is null or liability_rate <= 0 then
    raise exception 'exact exchange-rate snapshots are required for a cross-currency payment';
  end if;
  if abs(funding_amount * funding_rate - liability_amount * liability_rate) > 0.01 then
    raise exception 'both payment postings must represent the same reporting-currency amount';
  end if;
  select coalesce(sum((item->>'amount')::numeric), 0) into allocation_total
  from jsonb_array_elements(p_allocations) item;
  if allocation_total > liability_amount + 0.01 then
    raise exception 'allocations exceed the liability payment';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as requested(obligation_id uuid, amount numeric)
    left join public.liability_obligations obligation
      on obligation.user_id = p_user_id
      and obligation.account_id = liability_account_id
      and obligation.id = requested.obligation_id
    left join lateral (
      select coalesce(sum(existing.amount), 0) as amount
      from public.liability_payment_allocations existing
      where existing.user_id = p_user_id and existing.obligation_id = requested.obligation_id
    ) paid on true
    where obligation.id is null
      or obligation.status not in ('projected', 'open', 'due', 'partial', 'overdue')
      or requested.amount > greatest(obligation.total_due - paid.amount, 0) + 0.01
  ) then raise exception 'an allocation exceeds the remaining obligation'; end if;

  -- A loan installment can include interest and fees. Those amounts are real
  -- expenses and must increase the liability before the transfer pays it;
  -- otherwise the whole installment would be mistaken for principal. Card
  -- statement charges are already in the card ledger and are never duplicated.
  if liability_kind <> 'credit_card' and jsonb_array_length(p_allocations) > 0 then
    with requested as (
      select row.obligation_id, row.amount,
        obligation.interest_due, obligation.fee_due,
        coalesce((
          select sum(existing.amount)
          from public.liability_payment_allocations existing
          where existing.user_id = p_user_id
            and existing.obligation_id = obligation.id
        ), 0) as previously_allocated
      from jsonb_to_recordset(p_allocations) as row(
        obligation_id uuid, amount numeric
      )
      join public.liability_obligations obligation
        on obligation.user_id = p_user_id
        and obligation.account_id = liability_account_id
        and obligation.id = row.obligation_id
    ), fee_split as (
      select requested.*,
        least(requested.amount,
          greatest(requested.fee_due - requested.previously_allocated, 0)) as paid_fee,
        greatest(
          requested.interest_due
            - greatest(requested.previously_allocated - requested.fee_due, 0),
          0
        ) as remaining_interest
      from requested
    )
    select coalesce(sum(least(greatest(amount - paid_fee, 0), remaining_interest)), 0),
      coalesce(sum(paid_fee), 0)
    into interest_charge, fee_charge
    from fee_split;
  end if;

  liability_debt_before := greatest(-coalesce(private.liability_native_balance_at_v2(
    p_user_id, liability_account_id, payment_occurred_on
  ), 0), 0);
  if liability_amount > liability_debt_before + interest_charge + fee_charge + 0.01 then
    raise exception 'payment exceeds the current liability balance';
  end if;

  if interest_charge > 0 then
    insert into public.transactions (
      id, user_id, account_id, category_id, kind, amount, description,
      occurred_on, native_currency_code, base_currency_code, base_amount,
      exchange_rate, exchange_rate_date, exchange_rate_source
    ) values (
      interest_transaction_id, p_user_id, liability_account_id,
      liability_category_id, 'expense', interest_charge,
      'Intereses del pago de obligacion', payment_occurred_on,
      liability_currency, 'COP', null, liability_rate, payment_occurred_on,
      case when liability_currency = 'COP' then 'same_currency'
        else coalesce(nullif(p_payment->>'liability_exchange_rate_source', ''), 'manual') end
    ) on conflict (id) do nothing;
    select movement.ledger_event_id into charge_event_id
    from public.transactions movement
    where movement.user_id = p_user_id and movement.id = interest_transaction_id
      and movement.account_id = liability_account_id and movement.kind = 'expense'
      and movement.amount = interest_charge and movement.occurred_on = payment_occurred_on
      and movement.native_currency_code = liability_currency
      and movement.exchange_rate = liability_rate;
    if charge_event_id is null then
      raise exception 'interest posting id was reused with different data';
    end if;
    insert into public.liability_event_metadata (user_id, ledger_event_id, account_id, role)
    values (p_user_id, charge_event_id, liability_account_id, 'interest')
    on conflict (user_id, ledger_event_id, account_id) do nothing;
  end if;

  if fee_charge > 0 then
    charge_event_id := null;
    insert into public.transactions (
      id, user_id, account_id, category_id, kind, amount, description,
      occurred_on, native_currency_code, base_currency_code, base_amount,
      exchange_rate, exchange_rate_date, exchange_rate_source
    ) values (
      fee_transaction_id, p_user_id, liability_account_id,
      liability_category_id, 'expense', fee_charge,
      'Cargos del pago de obligacion', payment_occurred_on,
      liability_currency, 'COP', null, liability_rate, payment_occurred_on,
      case when liability_currency = 'COP' then 'same_currency'
        else coalesce(nullif(p_payment->>'liability_exchange_rate_source', ''), 'manual') end
    ) on conflict (id) do nothing;
    select movement.ledger_event_id into charge_event_id
    from public.transactions movement
    where movement.user_id = p_user_id and movement.id = fee_transaction_id
      and movement.account_id = liability_account_id and movement.kind = 'expense'
      and movement.amount = fee_charge and movement.occurred_on = payment_occurred_on
      and movement.native_currency_code = liability_currency
      and movement.exchange_rate = liability_rate;
    if charge_event_id is null then
      raise exception 'fee posting id was reused with different data';
    end if;
    insert into public.liability_event_metadata (user_id, ledger_event_id, account_id, role)
    values (p_user_id, charge_event_id, liability_account_id, 'fee')
    on conflict (user_id, ledger_event_id, account_id) do nothing;
  end if;

  insert into public.transactions (
    id, user_id, account_id, kind, amount, transfer_group_id, description,
    occurred_on, native_currency_code, base_currency_code, base_amount,
    exchange_rate, exchange_rate_date, exchange_rate_source
  ) values
  (
    funding_transaction_id, p_user_id, funding_account_id, 'transfer_out', funding_amount,
    payment_transfer_group_id, coalesce(nullif(p_payment->>'description', ''), 'Pago de obligacion'),
    payment_occurred_on, funding_currency, 'COP', null, funding_rate, payment_occurred_on,
    case when funding_currency = 'COP' then 'same_currency'
      else coalesce(nullif(p_payment->>'funding_exchange_rate_source', ''), 'manual') end
  ),
  (
    liability_transaction_id, p_user_id, liability_account_id, 'transfer_in', liability_amount,
    payment_transfer_group_id, coalesce(nullif(p_payment->>'description', ''), 'Pago de obligacion'),
    payment_occurred_on, liability_currency, 'COP', null, liability_rate, payment_occurred_on,
    case when liability_currency = 'COP' then 'same_currency'
      else coalesce(nullif(p_payment->>'liability_exchange_rate_source', ''), 'manual') end
  )
  on conflict (id) do nothing;
  set constraints public.transactions_transfer_group_v2_check immediate;
  set constraints public.transactions_transfer_group_v2_check deferred;

  if not exists (
    select 1 from public.transactions movement
    where movement.user_id = p_user_id and movement.id = liability_transaction_id
      and movement.account_id = liability_account_id and movement.kind = 'transfer_in'
      and movement.amount = liability_amount and movement.transfer_group_id = payment_transfer_group_id
      and movement.occurred_on = payment_occurred_on
      and movement.native_currency_code = liability_currency
      and movement.exchange_rate = liability_rate
      and abs(coalesce(movement.base_amount, movement.amount * movement.exchange_rate)
        - liability_amount * liability_rate) <= 0.01
  ) or not exists (
    select 1 from public.transactions movement
    where movement.user_id = p_user_id and movement.id = funding_transaction_id
      and movement.account_id = funding_account_id and movement.kind = 'transfer_out'
      and movement.amount = funding_amount and movement.transfer_group_id = payment_transfer_group_id
      and movement.occurred_on = payment_occurred_on
      and movement.native_currency_code = funding_currency
      and movement.exchange_rate = funding_rate
      and abs(coalesce(movement.base_amount, movement.amount * movement.exchange_rate)
        - funding_amount * funding_rate) <= 0.01
  ) then raise exception 'payment posting ids were reused with different data'; end if;

  insert into public.liability_event_metadata (user_id, ledger_event_id, account_id, role)
  values (p_user_id, payment_transfer_group_id, liability_account_id, 'payment')
  on conflict (user_id, ledger_event_id, account_id) do nothing;

  insert into public.liability_payment_allocations (
    id, user_id, account_id, obligation_id, ledger_event_id, amount, allocated_on
  )
  select coalesce(row.id, private.uuid_from_text_v2(payment_transfer_group_id::text || ':' || row.obligation_id::text)),
    p_user_id, liability_account_id, row.obligation_id, payment_transfer_group_id,
    row.amount, coalesce(row.allocated_on, payment_occurred_on)
  from jsonb_to_recordset(p_allocations) as row(
    id uuid, obligation_id uuid, amount numeric, allocated_on date
  )
  on conflict (user_id, obligation_id, ledger_event_id) do nothing;

  update public.liability_obligations obligation
  set status = case
      when paid.total_amount >= obligation.total_due - 0.01 then 'paid'
      when paid.total_amount > 0 then 'partial'
      else obligation.status
    end,
    version = obligation.version + 1,
    updated_at = now()
  from (
    select affected.obligation_id, sum(allocation.amount) as total_amount
    from (
      select distinct current_allocation.obligation_id
      from public.liability_payment_allocations current_allocation
      where current_allocation.user_id = p_user_id
        and current_allocation.ledger_event_id = payment_transfer_group_id
    ) affected
    join public.liability_payment_allocations allocation
      on allocation.user_id = p_user_id
      and allocation.obligation_id = affected.obligation_id
    group by affected.obligation_id
  ) paid
  where obligation.user_id = p_user_id and obligation.id = paid.obligation_id;

  -- An extra capital payment may replace only the unconfirmed future of a
  -- fixed-rate contract. The client calculates the projection with the shared
  -- deterministic engine; the database independently checks ownership,
  -- versions, arithmetic and the ledger-derived remaining principal before it
  -- accepts the new schedule.
  if future_schedule is not null and jsonb_typeof(future_schedule) <> 'null' then
    if jsonb_typeof(future_schedule) <> 'array' or jsonb_array_length(future_schedule) > 1200 then
      raise exception 'future schedule must be an array of at most 1200 rows';
    end if;
    if liability_kind = 'credit_card' then
      raise exception 'credit card statements cannot be recalculated as loan installments';
    end if;
    if liability_amount - allocation_total <= 0.01 then
      raise exception 'a future schedule requires an extra principal payment';
    end if;
    select terms.* into current_terms
    from public.liability_terms terms
    where terms.user_id = p_user_id and terms.account_id = liability_account_id
      and terms.starts_on <= payment_occurred_on
      and (terms.ends_on is null or terms.ends_on >= payment_occurred_on)
    order by terms.starts_on desc, terms.id desc
    limit 1;
    if current_terms.id is null
       or current_terms.variable_rate
       or current_terms.prepayment_strategy not in ('reduce_term', 'reduce_payment')
       or current_terms.calculation_method = 'manual'
       or current_terms.amortization_method = 'manual'
       or current_terms.payment_frequency = 'irregular' then
      raise exception 'this contract needs a confirmed creditor schedule after prepayment';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(future_schedule) as row(
        id uuid, account_id uuid, kind text, sequence_number integer,
        period_start date, period_end date, due_on date,
        principal_due numeric, interest_due numeric, fee_due numeric,
        minimum_due numeric, total_due numeric, status text, source text,
        expected_version bigint
      )
      where row.id is null or row.account_id <> liability_account_id
        or row.kind <> 'loan_installment' or row.source <> 'contract'
        or row.status not in ('projected', 'open') or row.due_on <= payment_occurred_on
        or row.sequence_number is null or row.sequence_number <= 0
        or row.principal_due < 0 or row.interest_due < 0 or row.fee_due < 0
        or row.minimum_due < 0 or row.total_due < 0
        or row.minimum_due > row.total_due
        or abs(row.total_due - row.principal_due - row.interest_due - row.fee_due) > 0.02
        or (row.period_end is not null and row.period_start is not null and row.period_end < row.period_start)
    ) then raise exception 'future schedule contains an invalid installment'; end if;
    if exists (
      select 1 from jsonb_to_recordset(future_schedule) as row(id uuid, sequence_number integer, due_on date)
      group by row.id having count(*) > 1
    ) or exists (
      select 1 from jsonb_to_recordset(future_schedule) as row(id uuid, sequence_number integer, due_on date)
      group by row.sequence_number having count(*) > 1
    ) then raise exception 'future schedule contains duplicate installments'; end if;
    if exists (
      select 1
      from jsonb_to_recordset(future_schedule) as row(id uuid, expected_version bigint)
      join public.liability_obligations existing
        on existing.user_id = p_user_id and existing.id = row.id
      where existing.account_id <> liability_account_id
        or existing.source <> 'contract'
        or existing.status not in ('projected', 'open')
        or existing.due_on <= payment_occurred_on
        or (row.expected_version is not null and existing.version <> row.expected_version)
        or exists (
          select 1 from public.liability_payment_allocations allocation
          where allocation.user_id = p_user_id and allocation.obligation_id = existing.id
        )
    ) then raise exception 'a future installment was modified or paid elsewhere'; end if;

    select coalesce(sum(row.principal_due), 0) into future_principal
    from jsonb_to_recordset(future_schedule) as row(principal_due numeric);
    principal_after_payment := greatest(
      liability_debt_before - (liability_amount - interest_charge - fee_charge), 0
    );
    if abs(future_principal - principal_after_payment) >
       (case when liability_currency = 'COP' then 1 else 0.01 end) then
      raise exception 'future principal does not match the ledger balance after payment';
    end if;

    update public.liability_obligations existing
    set status = 'cancelled', version = existing.version + 1, updated_at = now()
    where existing.user_id = p_user_id and existing.account_id = liability_account_id
      and existing.source = 'contract' and existing.status in ('projected', 'open')
      and existing.due_on > payment_occurred_on
      and not exists (
        select 1 from jsonb_to_recordset(future_schedule) as row(id uuid)
        where row.id = existing.id
      )
      and not exists (
        select 1 from public.liability_payment_allocations allocation
        where allocation.user_id = p_user_id and allocation.obligation_id = existing.id
      );

    update public.liability_obligations existing
    set sequence_number = row.sequence_number,
        period_start = row.period_start, period_end = row.period_end,
        due_on = row.due_on, principal_due = row.principal_due,
        interest_due = row.interest_due, fee_due = row.fee_due,
        minimum_due = row.minimum_due, total_due = row.total_due,
        status = row.status, version = existing.version + 1, updated_at = now()
    from jsonb_to_recordset(future_schedule) as row(
      id uuid, sequence_number integer, period_start date, period_end date,
      due_on date, principal_due numeric, interest_due numeric, fee_due numeric,
      minimum_due numeric, total_due numeric, status text
    )
    where existing.user_id = p_user_id and existing.id = row.id
      and existing.account_id = liability_account_id;

    insert into public.liability_obligations (
      id, user_id, account_id, kind, sequence_number, period_start, period_end,
      due_on, principal_due, interest_due, fee_due, minimum_due, total_due,
      status, source
    )
    select row.id, p_user_id, liability_account_id, 'loan_installment',
      row.sequence_number, row.period_start, row.period_end, row.due_on,
      row.principal_due, row.interest_due, row.fee_due, row.minimum_due,
      row.total_due, row.status, 'contract'
    from jsonb_to_recordset(future_schedule) as row(
      id uuid, sequence_number integer, period_start date, period_end date,
      due_on date, principal_due numeric, interest_due numeric, fee_due numeric,
      minimum_due numeric, total_due numeric, status text
    )
    where not exists (
      select 1 from public.liability_obligations existing
      where existing.user_id = p_user_id and existing.id = row.id
    );
  end if;

  principal_after_payment := greatest(
    liability_debt_before - (liability_amount - interest_charge - fee_charge), 0
  );
  if liability_kind <> 'credit_card'
     and principal_after_payment <=
       (case when liability_currency = 'COP' then 1 else 0.01 end) then
    update public.liability_obligations obligation
    set status = 'cancelled', version = obligation.version + 1, updated_at = now()
    where obligation.user_id = p_user_id and obligation.account_id = liability_account_id
      and obligation.status in ('projected', 'open', 'due', 'partial', 'overdue')
      and not exists (
        select 1 from public.liability_payment_allocations allocation
        where allocation.user_id = p_user_id and allocation.obligation_id = obligation.id
      );
    update public.liabilities liability
    set status = 'settled', version = liability.version + 1, updated_at = now()
    where liability.user_id = p_user_id and liability.account_id = liability_account_id
      and liability.status <> 'settled';
    update public.liability_payment_rules rule
    set active = false, version = rule.version + 1, updated_at = now()
    where rule.user_id = p_user_id and rule.account_id = liability_account_id
      and rule.active;
    update public.liability_payment_intents intent
    set status = 'cancelled', failure_reason = null,
        version = intent.version + 1, updated_at = now()
    where intent.user_id = p_user_id and intent.account_id = liability_account_id
      and intent.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')
      and intent.ledger_event_id is null;
    if linked_target_id is not null then
      update public.financial_targets target
      set status = 'completed', completed_at = coalesce(target.completed_at, now()),
          archived_at = null, updated_at = now()
      where target.user_id = p_user_id and target.id = linked_target_id
        and target.status <> 'archived';
      update public.recurring_rules rule
      set active = false, status = 'paused', suspended_by_target = true,
          updated_at = now()
      where rule.user_id = p_user_id and rule.financial_target_id = linked_target_id
        and rule.status = 'active';
      update public.recurring_occurrences occurrence
      set status = 'cancelled', suspended_by_target = true,
          failure_reason = null
      where occurrence.user_id = p_user_id
        and occurrence.financial_target_id = linked_target_id
        and occurrence.status in ('planned', 'failed');
    end if;
  end if;

  if automatic_intent_id is not null then
    update public.liability_payment_intents intent
    set status = 'posted', ledger_event_id = payment_transfer_group_id,
        failure_reason = null, version = intent.version + 1, updated_at = now()
    where intent.user_id = p_user_id
      and intent.id = automatic_intent_id
      and intent.account_id = liability_account_id;
    if not found then raise exception 'payment intent is not available'; end if;
  end if;

  saved_event := payment_transfer_group_id;
  prior_result := jsonb_build_object(
    'ledgerEventId', saved_event,
    'fundingTransactionId', funding_transaction_id,
    'liabilityTransactionId', liability_transaction_id,
    'interestTransactionId', case when interest_charge > 0 then interest_transaction_id else null end,
    'feeTransactionId', case when fee_charge > 0 then fee_transaction_id else null end,
    'interestAmount', interest_charge,
    'feeAmount', fee_charge,
    'liabilityAmount', liability_amount,
    'fundingAmount', funding_amount,
    'allocationCount', jsonb_array_length(p_allocations)
  );
  if p_write_receipt then
    insert into public.mutation_receipts (operation_id, user_id, operation, result)
    values (p_operation_id, p_user_id, 'liability.payment.record.v2', prior_result);
  end if;
  return prior_result;
end;
$$;

revoke all on function private.record_liability_payment_core_v2(uuid, uuid, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.record_liability_payment_v2(
  p_operation_id uuid,
  p_payment jsonb,
  p_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := private.require_current_finance_user_v2();
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  return private.record_liability_payment_core_v2(
    caller_id, p_operation_id, p_payment, p_allocations, true
  );
end;
$$;

create or replace function public.upsert_liability_payment_intent_v2(
  p_operation_id uuid,
  p_intent jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  requested_intent_id uuid := (p_intent->>'id')::uuid;
  intent_id uuid := (p_intent->>'id')::uuid;
  requested_rule_id uuid := nullif(p_intent->>'rule_id', '')::uuid;
  requested_obligation_id uuid := nullif(p_intent->>'obligation_id', '')::uuid;
  requested_scheduled_for date := (p_intent->>'scheduled_for')::date;
  intent_record public.liability_payment_intents%rowtype;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or requested_intent_id is null then raise exception 'operation and intent are required'; end if;
  select receipt.result into prior_result from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.payment-intent.upsert.v2';
  if found then return prior_result; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('moneva:liability-payment-intents-v2', 0)
  );

  -- Reuse the row identified by the business key. This keeps user-created
  -- intents and the automatic materializer from colliding on different UUIDs.
  select coalesce(
    (
      select existing.id
      from public.liability_payment_intents existing
      where existing.user_id = caller_id and existing.id = requested_intent_id
      limit 1
    ),
    (
      select existing.id
      from public.liability_payment_intents existing
      where existing.user_id = caller_id
        and existing.rule_id = requested_rule_id
        and (
          (requested_obligation_id is not null
            and existing.obligation_id = requested_obligation_id)
          or (
            requested_obligation_id is null
            and existing.obligation_id is null
            and (
              existing.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')
              or existing.scheduled_for = requested_scheduled_for
            )
          )
        )
      order by
        (existing.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')) desc,
        (existing.scheduled_for = requested_scheduled_for) desc,
        existing.updated_at desc,
        existing.id
      limit 1
    ),
    requested_intent_id
  ) into intent_id;
  select * into intent_record from public.liability_payment_intents intent
  where intent.user_id = caller_id and intent.id = intent_id for update;
  if found and (p_expected_version is null or intent_record.version <> p_expected_version) then
    raise exception 'payment intent was modified elsewhere';
  end if;
  if found and intent_record.status = 'posted' then
    raise exception 'a posted payment intent is immutable';
  end if;
  insert into public.liability_payment_intents (
    id, user_id, account_id, rule_id, obligation_id, scheduled_for,
    planned_amount, status, failure_reason
  ) values (
    intent_id, caller_id, (p_intent->>'account_id')::uuid,
    requested_rule_id,
    requested_obligation_id,
    requested_scheduled_for,
    (p_intent->>'planned_amount')::numeric,
    coalesce(nullif(p_intent->>'status', ''), 'planned'),
    nullif(p_intent->>'failure_reason', '')
  ) on conflict (id) do update set
    rule_id = excluded.rule_id, obligation_id = excluded.obligation_id,
    scheduled_for = excluded.scheduled_for, planned_amount = excluded.planned_amount,
    status = excluded.status, failure_reason = excluded.failure_reason,
    version = public.liability_payment_intents.version + 1
  where public.liability_payment_intents.user_id = caller_id
    and public.liability_payment_intents.status <> 'posted'
  returning * into intent_record;
  prior_result := jsonb_build_object('intentId', intent_record.id, 'intentVersion', intent_record.version);
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.payment-intent.upsert.v2', prior_result);
  return prior_result;
end;
$$;

create or replace function private.apply_financial_target_lifecycle_v2(
  p_user_id uuid,
  p_target_id uuid,
  p_account_id uuid,
  p_status text,
  p_local_today date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_balance numeric;
  account_version bigint;
  liability_version bigint;
  liability_status text;
begin
  if p_user_id is null or p_status not in ('active', 'paused', 'completed', 'archived') then
    raise exception 'valid owner and target status are required';
  end if;

  -- A debt may only be declared paid/closed when its complete ledger is zero.
  -- The future-row check is separate: two future postings that net to zero are
  -- still commitments and must be removed before the account can be closed.
  if p_account_id is not null and p_status in ('completed', 'archived') then
    if exists (
      select 1 from public.transactions movement
      where movement.user_id = p_user_id and movement.account_id = p_account_id
        and movement.occurred_on > p_local_today
    ) then
      raise exception 'remove future movements before closing this debt';
    end if;
    total_balance := private.liability_native_balance_at_v2(
      p_user_id, p_account_id, date '9999-12-31'
    );
    if abs(coalesce(total_balance, 0)) > 0.01 then
      raise exception 'pay the full debt before closing it';
    end if;
    if exists (
      select 1 from public.credit_card_purchase_plans plan
      where plan.user_id = p_user_id and plan.account_id = p_account_id
        and plan.status = 'active'
    ) then
      raise exception 'finish the active installment plans before closing this debt';
    end if;
  end if;

  if p_target_id is not null then
    -- Mark future target-linked occurrences before changing the rule. The
    -- existing materializer also cancels them, but this marker is what makes a
    -- later resume selective and safe.
    if p_status in ('paused', 'completed', 'archived') then
      update public.recurring_occurrences occurrence
      set status = 'cancelled', suspended_by_target = true,
          failure_reason = null
      where occurrence.user_id = p_user_id
        and (
          occurrence.financial_target_id = p_target_id
          or exists (
            select 1 from public.recurring_rules linked_rule
            where linked_rule.user_id = occurrence.user_id
              and linked_rule.id = occurrence.rule_id
              and linked_rule.financial_target_id = p_target_id
          )
        )
        and occurrence.status = 'planned';

      update public.recurring_rules rule
      set status = case when p_status = 'paused' then 'paused' else 'archived' end,
          active = false,
          suspended_by_target = true
      where rule.user_id = p_user_id
        and rule.financial_target_id = p_target_id
        and (
          (p_status = 'paused' and rule.status = 'active')
          or (p_status in ('completed', 'archived') and rule.status <> 'archived')
        );
    elsif p_status = 'active' then
      update public.recurring_rules rule
      set status = 'active', active = true, suspended_by_target = false
      where rule.user_id = p_user_id
        and rule.financial_target_id = p_target_id
        and rule.status = 'paused'
        and rule.suspended_by_target;

      update public.recurring_occurrences occurrence
      set status = 'planned', suspended_by_target = false,
          financial_target_id = rule.financial_target_id,
          financial_target_effect = rule.financial_target_effect,
          failure_reason = null
      from public.recurring_rules rule
      where occurrence.user_id = p_user_id
        and occurrence.rule_id = rule.id
        and rule.user_id = p_user_id
        and rule.financial_target_id = p_target_id
        and rule.status = 'active'
        and occurrence.status = 'cancelled'
        and occurrence.suspended_by_target;

      -- The legacy materializer does not copy target metadata on a status-only
      -- rule update. Repair every newly materialized planned row in the same
      -- transaction so progress attribution remains exact.
      update public.recurring_occurrences occurrence
      set financial_target_id = rule.financial_target_id,
          financial_target_effect = rule.financial_target_effect
      from public.recurring_rules rule
      where occurrence.user_id = p_user_id
        and occurrence.rule_id = rule.id
        and rule.user_id = p_user_id
        and rule.financial_target_id = p_target_id
        and occurrence.status = 'planned';
    end if;
  end if;

  if p_account_id is not null then
    if p_status in ('paused', 'completed', 'archived') then
      update public.liability_payment_intents intent
      set status = 'cancelled', suspended_by_target = true,
          failure_reason = null,
          version = intent.version + 1,
          updated_at = now()
      where intent.user_id = p_user_id and intent.account_id = p_account_id
        and intent.status in ('planned', 'needs_confirmation', 'confirmed');

      update public.liability_payment_rules rule
      set active = false, suspended_by_target = true,
          version = rule.version + 1,
          updated_at = now()
      where rule.user_id = p_user_id and rule.account_id = p_account_id
        and rule.detached_at is null and rule.active;
    elsif p_status = 'active' then
      update public.liability_payment_rules rule
      set active = true, suspended_by_target = false,
          version = rule.version + 1,
          updated_at = now()
      where rule.user_id = p_user_id and rule.account_id = p_account_id
        and rule.detached_at is null and rule.suspended_by_target;

      -- Compute the restore shape first. PostgreSQL deliberately does not make
      -- the UPDATE target visible inside FROM/JOIN clauses, so a CTE keeps the
      -- obligation lookup both legal and one-row-per-intent.
      with resumable_intents as (
        select intent.id,
          case
            when liability_account.currency_code <> 'COP'
              or funding_account.currency_code <> 'COP'
              or obligation.id is null
              or obligation.status = 'projected'
              then 'needs_confirmation'
            else 'planned'
          end as restored_status,
          case
            when liability_account.currency_code <> 'COP'
              or funding_account.currency_code <> 'COP'
              then 'payment needs exact COP reporting FX snapshots'
            when obligation.id is null
              then 'a confirmed obligation is required to schedule the payment'
            when obligation.status = 'projected'
              then 'a confirmed obligation is required'
            else null
          end as restored_failure_reason
        from public.liability_payment_intents intent
        join public.liability_payment_rules rule
          on rule.user_id = intent.user_id and rule.id = intent.rule_id
        join public.accounts liability_account
          on liability_account.user_id = rule.user_id
         and liability_account.id = rule.account_id
        join public.accounts funding_account
          on funding_account.user_id = rule.user_id
         and funding_account.id = rule.funding_account_id
        left join public.liability_obligations obligation
          on obligation.user_id = intent.user_id
         and obligation.id = intent.obligation_id
        where intent.user_id = p_user_id and intent.account_id = p_account_id
          and rule.active and rule.detached_at is null
          and intent.status = 'cancelled' and intent.suspended_by_target
          and (
            intent.obligation_id is null
            or obligation.status in ('projected', 'open', 'due', 'partial', 'overdue')
          )
      )
      update public.liability_payment_intents intent
      set status = case
            when resumable.restored_status = 'planned' then 'planned'
            else 'needs_confirmation'
          end,
          suspended_by_target = false,
          failure_reason = resumable.restored_failure_reason,
          version = intent.version + 1,
          updated_at = now()
      from resumable_intents resumable
      where intent.user_id = p_user_id and intent.id = resumable.id;
    end if;

    if p_status in ('completed', 'archived') then
      update public.liability_obligations obligation
      set status = 'cancelled', version = obligation.version + 1
      where obligation.user_id = p_user_id and obligation.account_id = p_account_id
        and obligation.status in ('projected', 'open', 'due', 'partial', 'overdue');
    end if;

    liability_status := case p_status
      when 'active' then 'active'
      when 'paused' then 'paused'
      when 'completed' then 'settled'
      else 'archived'
    end;
    update public.liabilities liability
    set status = liability_status, version = liability.version + 1
    where liability.user_id = p_user_id and liability.account_id = p_account_id
      and liability.status is distinct from liability_status
    returning liability.version into liability_version;
    if liability_version is null then
      select liability.version into liability_version
      from public.liabilities liability
      where liability.user_id = p_user_id and liability.account_id = p_account_id;
    end if;

    if p_status = 'archived' then
      update public.accounts account
      set archived = true, archived_at = coalesce(account.archived_at, now()),
          version = account.version + 1
      where account.user_id = p_user_id and account.id = p_account_id
        and not account.archived
      returning account.version into account_version;
    end if;
    if account_version is null then
      select account.version into account_version
      from public.accounts account
      where account.user_id = p_user_id and account.id = p_account_id;
    end if;
  end if;

  if p_target_id is not null then
    update public.financial_targets target
    set status = p_status,
        completed_at = case
          when p_status = 'completed' then coalesce(target.completed_at, now())
          when p_status in ('active', 'paused') then null
          else target.completed_at
        end,
        archived_at = case
          when p_status = 'archived' then coalesce(target.archived_at, now())
          else null
        end
    where target.user_id = p_user_id and target.id = p_target_id;
  end if;

  return jsonb_build_object(
    'targetId', p_target_id, 'targetStatus', p_status,
    'accountId', p_account_id, 'accountVersion', account_version,
    'liabilityVersion', liability_version,
    'liabilityStatus', liability_status,
    'accountArchived', p_status = 'archived'
  );
end;
$$;

revoke all on function private.apply_financial_target_lifecycle_v2(
  uuid, uuid, uuid, text, date
) from public, anon, authenticated, service_role;

create or replace function public.set_financial_target_status_v2(
  p_operation_id uuid,
  p_target_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  target_record public.financial_targets%rowtype;
  liability_account_id uuid;
  local_today date;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or p_target_id is null
     or p_status not in ('active', 'paused', 'completed', 'archived') then
    raise exception 'operation, target and valid status are required';
  end if;
  select receipt.result into prior_result
  from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'financial-target.status.v2';
  if found then return prior_result; end if;

  select * into target_record
  from public.financial_targets target
  where target.user_id = caller_id and target.id = p_target_id
  for update;
  if not found then raise exception 'financial target is not available'; end if;
  if target_record.status = 'archived' and p_status <> 'archived' then
    raise exception 'an archived target cannot be reopened';
  end if;
  if target_record.status = 'completed' and p_status not in ('completed', 'archived') then
    raise exception 'a completed target cannot be resumed';
  end if;
  if p_status = 'active' and target_record.status not in ('active', 'paused') then
    raise exception 'only a paused target can be resumed';
  end if;

  if target_record.kind = 'debt' then
    select liability.account_id into liability_account_id
    from public.liabilities liability
    where liability.user_id = caller_id
      and (
        liability.legacy_target_id = p_target_id
        or liability.account_id = target_record.account_id
      )
    order by (liability.legacy_target_id = p_target_id) desc
    limit 1
    for update;
  end if;
  select (now() at time zone profile.timezone)::date into local_today
  from public.profiles profile where profile.id = caller_id;

  prior_result := private.apply_financial_target_lifecycle_v2(
    caller_id, p_target_id, liability_account_id, p_status,
    coalesce(local_today, current_date)
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'financial-target.status.v2', prior_result);
  return prior_result;
end;
$$;

create or replace function public.archive_liability_v2(
  p_operation_id uuid,
  p_account_id uuid,
  p_expected_account_version bigint,
  p_expected_liability_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  account_record public.accounts%rowtype;
  liability_record public.liabilities%rowtype;
  target_id uuid;
  local_today date;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or p_account_id is null then
    raise exception 'operation and liability are required';
  end if;
  select receipt.result into prior_result from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'liability.archive.v2';
  if found then return prior_result; end if;
  select * into account_record from public.accounts account
  where account.user_id = caller_id and account.id = p_account_id for update;
  select * into liability_record from public.liabilities liability
  where liability.user_id = caller_id and liability.account_id = p_account_id for update;
  if account_record.id is null or liability_record.account_id is null then
    raise exception 'liability is not available';
  end if;
  if account_record.version <> p_expected_account_version
     or liability_record.version <> p_expected_liability_version then
    raise exception 'liability was modified elsewhere';
  end if;
  select target.id into target_id
  from public.financial_targets target
  where target.user_id = caller_id and target.kind = 'debt'
    and (target.id = liability_record.legacy_target_id or target.account_id = p_account_id)
  order by (target.id = liability_record.legacy_target_id) desc
  limit 1
  for update;
  select (now() at time zone profile.timezone)::date into local_today
  from public.profiles profile where profile.id = caller_id;

  prior_result := private.apply_financial_target_lifecycle_v2(
    caller_id, target_id, p_account_id, 'archived',
    coalesce(local_today, current_date)
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'liability.archive.v2', prior_result);
  return prior_result;
end;
$$;

-- A non-card installment may contain interest and fees that are only posted
-- when the payment is recorded. Include that still-unposted portion in the
-- safe payable cap so the final installment can actually close the debt.
create or replace function private.liability_payment_cap_v2(
  p_liability_kind text,
  p_ledger_debt numeric,
  p_obligation_total numeric default null,
  p_interest_due numeric default 0,
  p_fee_due numeric default 0,
  p_allocated numeric default 0
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select greatest(coalesce(p_ledger_debt, 0), 0) +
    case
      when p_obligation_total is not null and p_liability_kind <> 'credit_card' then
        least(
          greatest(
            coalesce(p_interest_due, 0) + coalesce(p_fee_due, 0)
              - least(
                  greatest(coalesce(p_allocated, 0), 0),
                  coalesce(p_interest_due, 0) + coalesce(p_fee_due, 0)
                ),
            0
          ),
          greatest(coalesce(p_obligation_total, 0) - coalesce(p_allocated, 0), 0)
        )
      else 0
    end;
$$;

revoke all on function private.liability_payment_cap_v2(text, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;

create or replace function private.liability_rule_obligation_amount_v2(
  p_strategy text,
  p_fixed_amount numeric,
  p_minimum_due numeric,
  p_total_due numeric,
  p_allocated numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_strategy
    when 'fixed' then case
      when p_total_due is null then greatest(coalesce(p_fixed_amount, 0), 0)
      else greatest(
        least(coalesce(p_fixed_amount, 0), greatest(p_total_due, 0))
          - greatest(coalesce(p_allocated, 0), 0),
        0
      )
    end
    when 'minimum_due' then greatest(
      coalesce(p_minimum_due, 0) - greatest(coalesce(p_allocated, 0), 0), 0
    )
    when 'statement_total' then greatest(
      coalesce(p_total_due, 0) - greatest(coalesce(p_allocated, 0), 0), 0
    )
    else null
  end;
$$;

revoke all on function private.liability_rule_obligation_amount_v2(text, numeric, numeric, numeric, numeric)
  from public, anon, authenticated, service_role;

create or replace function private.materialize_liability_payment_intents_v2(
  p_horizon date default (current_date + 90)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare saved_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('moneva:liability-payment-intents-v2', 0)
  );

  -- A planned amount is only a snapshot. If the user records a manual payment
  -- before the worker runs, retire any now-covered intent before selecting the
  -- next obligation. Otherwise an old minimum/fixed amount could still post.
  update public.liability_payment_intents intent
  set status = 'cancelled',
      planned_amount = 0,
      failure_reason = 'already covered by recorded payments',
      suspended_by_target = false,
      detached_by_rule = false,
      version = intent.version + 1,
      updated_at = now()
  from public.liability_payment_rules rule,
       public.liability_obligations obligation
  where intent.user_id = rule.user_id
    and intent.rule_id = rule.id
    and intent.user_id = obligation.user_id
    and intent.obligation_id = obligation.id
    and intent.ledger_event_id is null
    and intent.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')
    and rule.strategy in ('fixed', 'minimum_due', 'statement_total')
    and private.liability_rule_obligation_amount_v2(
      rule.strategy, rule.fixed_amount, obligation.minimum_due,
      obligation.total_due, coalesce((
        select sum(allocation.amount)
        from public.liability_payment_allocations allocation
        where allocation.user_id = obligation.user_id
          and allocation.obligation_id = obligation.id
      ), 0)
    ) <= 0.01;

  insert into public.liability_payment_intents (
    id, user_id, account_id, rule_id, obligation_id, scheduled_for,
    planned_amount, status, failure_reason
  )
  select coalesce(
      existing_intent.id,
      private.uuid_from_text_v2(
        rule.id::text || ':' || coalesce(
          obligation.id::text,
          scheduled.scheduled_for::text
        )
      )
    ),
    rule.user_id, rule.account_id, rule.id, obligation.id,
    scheduled.scheduled_for,
    calculated.amount,
    case
      when liability_account.currency_code <> 'COP' or funding_account.currency_code <> 'COP' then 'needs_confirmation'
      when obligation.id is null then 'needs_confirmation'
      when obligation.status = 'projected' and (
        current_terms.variable_rate is null or current_terms.variable_rate
        or current_terms.index_name is not null
        or current_terms.calculation_method = 'manual'
      ) then 'needs_confirmation'
      else 'planned'
    end,
    case
      when liability_account.currency_code <> 'COP' or funding_account.currency_code <> 'COP' then 'payment needs exact COP reporting FX snapshots'
      when obligation.id is null then 'a confirmed obligation is required to schedule the payment'
      when obligation.status = 'projected' and (
        current_terms.variable_rate is null or current_terms.variable_rate
        or current_terms.index_name is not null
        or current_terms.calculation_method = 'manual'
      ) then 'the projected amount needs a confirmed rate or creditor schedule'
      else null
    end
  from public.liability_payment_rules rule
  join public.liabilities liability
    on liability.user_id = rule.user_id and liability.account_id = rule.account_id
  join public.accounts liability_account
    on liability_account.user_id = rule.user_id and liability_account.id = rule.account_id
  join public.accounts funding_account
    on funding_account.user_id = rule.user_id and funding_account.id = rule.funding_account_id
  join public.profiles profile on profile.id = rule.user_id
  left join lateral (
    select terms.variable_rate, terms.index_name, terms.calculation_method
    from public.liability_terms terms
    where terms.user_id = rule.user_id and terms.account_id = rule.account_id
      and terms.starts_on <= (now() at time zone profile.timezone)::date
      and (terms.ends_on is null or terms.ends_on >= (now() at time zone profile.timezone)::date)
    order by terms.starts_on desc, terms.id desc
    limit 1
  ) current_terms on true
  cross join lateral (
    select (now() at time zone profile.timezone)::date as local_today
  ) local_clock
  left join lateral (
    select due.*
    from public.liability_obligations due
    where due.user_id = rule.user_id and due.account_id = rule.account_id
      and due.status in ('projected', 'open', 'due', 'partial', 'overdue')
      and due.due_on <= p_horizon
      -- One automatic attempt per rule and obligation. A minimum/fixed payment
      -- may intentionally be partial; once posted, move to the next cycle
      -- instead of retrying the same obligation every cron run forever.
      and not exists (
        select 1
        from public.liability_payment_intents prior_intent
        where prior_intent.user_id = rule.user_id
          and prior_intent.rule_id = rule.id
          and prior_intent.obligation_id = due.id
          and prior_intent.status = 'posted'
      )
      and (
        rule.strategy not in ('fixed', 'minimum_due', 'statement_total')
        or private.liability_rule_obligation_amount_v2(
          rule.strategy, rule.fixed_amount, due.minimum_due, due.total_due,
          coalesce((
            select sum(candidate_allocation.amount)
            from public.liability_payment_allocations candidate_allocation
            where candidate_allocation.user_id = due.user_id
              and candidate_allocation.obligation_id = due.id
          ), 0)
        ) > 0.01
      )
      and greatest(
        due.total_due - coalesce((
          select sum(existing_allocation.amount)
          from public.liability_payment_allocations existing_allocation
          where existing_allocation.user_id = due.user_id
            and existing_allocation.obligation_id = due.id
        ), 0),
        0
      ) > 0.01
    order by due.due_on, due.id limit 1
  ) obligation on true
  left join lateral (
    select sum(allocation.amount) as amount
    from public.liability_payment_allocations allocation
    where allocation.user_id = rule.user_id and allocation.obligation_id = obligation.id
  ) paid on true
  cross join lateral (
    select coalesce(obligation.due_on - rule.days_before_due, local_clock.local_today) as scheduled_for
  ) scheduled
  left join lateral (
    select candidate.id
    from public.liability_payment_intents candidate
    where candidate.user_id = rule.user_id
      and candidate.rule_id = rule.id
      and (
        (obligation.id is not null and candidate.obligation_id = obligation.id)
        or (
          obligation.id is null
          and candidate.obligation_id is null
          and (
            candidate.scheduled_for = scheduled.scheduled_for
            or candidate.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')
          )
        )
      )
    order by
      (candidate.status in ('planned', 'needs_confirmation', 'confirmed', 'failed')) desc,
      (candidate.scheduled_for = scheduled.scheduled_for) desc,
      candidate.updated_at desc,
      candidate.id
    limit 1
  ) existing_intent on true
  cross join lateral (
    select greatest(least(
      case rule.strategy
        when 'fixed' then private.liability_rule_obligation_amount_v2(
          rule.strategy, rule.fixed_amount, obligation.minimum_due,
          obligation.total_due, coalesce(paid.amount, 0)
        )
        when 'minimum_due' then private.liability_rule_obligation_amount_v2(
          rule.strategy, rule.fixed_amount, obligation.minimum_due,
          obligation.total_due, coalesce(paid.amount, 0)
        )
        when 'statement_total' then private.liability_rule_obligation_amount_v2(
          rule.strategy, rule.fixed_amount, obligation.minimum_due,
          obligation.total_due, coalesce(paid.amount, 0)
        )
        else least(
          private.liability_payment_cap_v2(
            liability.kind,
            greatest(-coalesce(private.liability_native_balance_at_v2(
              rule.user_id, rule.account_id, local_clock.local_today
            ), 0), 0),
            obligation.total_due, obligation.interest_due, obligation.fee_due,
            coalesce(paid.amount, 0)
          ),
          coalesce(greatest(obligation.total_due - coalesce(paid.amount, 0), 0),
            greatest(-coalesce(private.liability_native_balance_at_v2(
              rule.user_id, rule.account_id, local_clock.local_today
            ), 0), 0))
        )
      end,
      coalesce(rule.maximum_amount, 999999999999999999::numeric),
      private.liability_payment_cap_v2(
        liability.kind,
        greatest(-coalesce(private.liability_native_balance_at_v2(
          rule.user_id, rule.account_id, local_clock.local_today
        ), 0), 0),
        obligation.total_due, obligation.interest_due, obligation.fee_due,
        coalesce(paid.amount, 0)
      )
    ), 0) as amount
  ) calculated
  where rule.active and not rule.suspended_by_target and rule.detached_at is null
    and private.is_finance_user_enabled_v2(rule.user_id)
    and liability.status = 'active'
    and not liability_account.archived and not funding_account.archived
    and scheduled.scheduled_for <= p_horizon
    and calculated.amount > 0.01
  on conflict (id) do update set
    scheduled_for = excluded.scheduled_for,
    planned_amount = excluded.planned_amount,
    status = excluded.status,
    suspended_by_target = false,
    detached_by_rule = false,
    failure_reason = excluded.failure_reason,
    version = public.liability_payment_intents.version + 1,
    updated_at = now()
  where (
      public.liability_payment_intents.status in ('planned', 'needs_confirmation', 'failed')
      and public.liability_payment_intents.ledger_event_id is null
    ) or (
      public.liability_payment_intents.status = 'cancelled'
      and public.liability_payment_intents.ledger_event_id is null
      and (
        public.liability_payment_intents.detached_by_rule
        or public.liability_payment_intents.failure_reason = 'already covered by recorded payments'
      )
    );
  get diagnostics saved_count = row_count;
  return saved_count;
end;
$$;

create or replace function private.process_due_liability_payments_v2(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_record record;
  processed integer := 0;
  funding_currency text;
  liability_currency text;
  funding_balance numeric;
  liability_debt numeric;
  obligation_remaining numeric;
  obligation_payable_cap numeric;
  obligation_allocated numeric;
  obligation_minimum numeric;
  obligation_total numeric;
  current_rule_amount numeric;
  payment_amount numeric;
  allocation_payload jsonb;
  payment_result jsonb;
begin
  perform private.materialize_liability_payment_intents_v2(current_date + 90);
  for due_record in
    select intent.*, rule.funding_account_id, rule.recording_mode,
      rule.strategy, rule.fixed_amount,
      liability.kind as liability_kind,
      (now() at time zone profile.timezone)::date as local_today
    from public.liability_payment_intents intent
    join public.liability_payment_rules rule
      on rule.user_id = intent.user_id and rule.id = intent.rule_id
    join public.liabilities liability
      on liability.user_id = intent.user_id and liability.account_id = intent.account_id
    join public.profiles profile on profile.id = intent.user_id
    where intent.status in ('planned', 'confirmed')
      and intent.scheduled_for <= (now() at time zone profile.timezone)::date
      and rule.active and not rule.suspended_by_target
      and rule.detached_at is null
      and liability.status = 'active'
      and not intent.suspended_by_target
      and rule.recording_mode = 'auto_post'
      and private.is_finance_user_enabled_v2(intent.user_id)
    order by intent.scheduled_for, intent.id
    for update of intent skip locked
    limit greatest(1, least(p_limit, 1000))
  loop
    begin
      select currency_code into funding_currency from public.accounts
      where user_id = due_record.user_id and id = due_record.funding_account_id and not archived;
      select currency_code into liability_currency from public.accounts
      where user_id = due_record.user_id and id = due_record.account_id and not archived;
      if funding_currency is null or liability_currency is null
         or funding_currency <> 'COP' or liability_currency <> 'COP'
         or due_record.planned_amount <= 0 then
        update public.liability_payment_intents
        set status = 'needs_confirmation',
            failure_reason = 'payment needs a valid same-currency amount and active accounts'
        where user_id = due_record.user_id and id = due_record.id;
        continue;
      end if;
      liability_debt := greatest(-coalesce(private.liability_native_balance_at_v2(
        due_record.user_id, due_record.account_id, due_record.local_today
      ), 0), 0);
      if due_record.obligation_id is not null then
        select greatest(obligation.total_due - coalesce(sum(allocation.amount), 0), 0),
          private.liability_payment_cap_v2(
            due_record.liability_kind, liability_debt, obligation.total_due,
            obligation.interest_due, obligation.fee_due,
            coalesce(sum(allocation.amount), 0)
          ),
          coalesce(sum(allocation.amount), 0),
          obligation.minimum_due,
          obligation.total_due
        into obligation_remaining, obligation_payable_cap,
          obligation_allocated, obligation_minimum, obligation_total
        from public.liability_obligations obligation
        left join public.liability_payment_allocations allocation
          on allocation.user_id = obligation.user_id
         and allocation.obligation_id = obligation.id
        where obligation.user_id = due_record.user_id
          and obligation.id = due_record.obligation_id
          and obligation.account_id = due_record.account_id
        group by obligation.id, obligation.total_due;
        if obligation_remaining is null then
          update public.liability_payment_intents
          set status = 'needs_confirmation', failure_reason = 'payment obligation is no longer available'
          where user_id = due_record.user_id and id = due_record.id;
          continue;
        end if;
        current_rule_amount := case
          when due_record.strategy in ('fixed', 'minimum_due', 'statement_total') then
            private.liability_rule_obligation_amount_v2(
              due_record.strategy, due_record.fixed_amount,
              obligation_minimum, obligation_total, obligation_allocated
            )
          else due_record.planned_amount
        end;
        payment_amount := least(
          due_record.planned_amount,
          current_rule_amount,
          obligation_remaining,
          obligation_payable_cap
        );
      else
        payment_amount := least(due_record.planned_amount, liability_debt);
      end if;
      if payment_amount <= 0.01 then
        update public.liability_payment_intents
        set status = 'skipped', failure_reason = null
        where user_id = due_record.user_id and id = due_record.id;
        continue;
      end if;
      funding_balance := private.liability_native_balance_at_v2(
        due_record.user_id, due_record.funding_account_id, due_record.local_today
      );
      if coalesce(funding_balance, 0) + 0.01 < payment_amount then
        update public.liability_payment_intents
        set status = 'needs_confirmation', failure_reason = 'funding account has insufficient balance'
        where user_id = due_record.user_id and id = due_record.id;
        continue;
      end if;
      if payment_amount is distinct from due_record.planned_amount then
        update public.liability_payment_intents
        set planned_amount = payment_amount
        where user_id = due_record.user_id and id = due_record.id;
      end if;
      allocation_payload := case when due_record.obligation_id is null then '[]'::jsonb else
        jsonb_build_array(jsonb_build_object(
          'obligation_id', due_record.obligation_id,
          'amount', payment_amount,
          'allocated_on', due_record.local_today
        )) end;
      payment_result := private.record_liability_payment_core_v2(
        due_record.user_id,
        private.uuid_from_text_v2('liability-intent:' || due_record.id::text),
        jsonb_build_object(
          'liability_account_id', due_record.account_id,
          'funding_account_id', due_record.funding_account_id,
          'liability_amount', payment_amount,
          'funding_amount', payment_amount,
          'occurred_on', due_record.local_today,
          'description', 'Pago automatico de obligacion',
          'intent_id', due_record.id,
          'require_funding_balance', true,
          'funding_exchange_rate', case when funding_currency = 'COP' then 1 else null end,
          'liability_exchange_rate', case when liability_currency = 'COP' then 1 else null end
        ),
        allocation_payload,
        false
      );
      if coalesce((payment_result->>'skipped')::boolean, false) then
        update public.liability_payment_intents
        set status = case
              when payment_result->>'reason' = 'already covered by recorded payments'
                then 'cancelled'
              when coalesce((payment_result->>'retryable')::boolean, false)
                then 'failed'
              else 'skipped'
            end,
            planned_amount = case
              when payment_result->>'reason' = 'already covered by recorded payments'
                then 0
              else planned_amount
            end,
            failure_reason = payment_result->>'reason',
            version = version + 1,
            updated_at = now()
        where user_id = due_record.user_id and id = due_record.id
          and ledger_event_id is null;
        continue;
      end if;
      processed := processed + 1;
    exception when others then
      update public.liability_payment_intents
      set status = 'failed', failure_reason = left(sqlerrm, 500)
      where user_id = due_record.user_id and id = due_record.id;
    end;
  end loop;
  return processed;
end;
$$;

revoke all on function private.materialize_liability_payment_intents_v2(date)
  from public, anon, authenticated;
revoke all on function private.process_due_liability_payments_v2(integer)
  from public, anon, authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'moneva-liability-payments-hourly' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'moneva-liability-payments-hourly', '17 * * * *',
    'select private.process_due_liability_payments_v2(100);'
  );
end;
$$;

create or replace function public.get_liability_overview_v2(
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  result jsonb;
  local_today date;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  select (now() at time zone profile.timezone)::date into local_today
  from public.profiles profile where profile.id = caller_id;
  local_today := coalesce(local_today, current_date);
  with base as (
    select liability.*, account.name, account.account_type, account.color, account.icon,
      account.currency_code, account.entity_id, account.archived,
      account.version as account_version,
      private.liability_native_balance_at_v2(caller_id, account.id, local_today) as native_balance,
      private.liability_reporting_balance_at_v2(caller_id, account.id, local_today) as reporting_balance
    from public.liabilities liability
    join public.accounts account
      on account.user_id = liability.user_id and account.id = liability.account_id
    where liability.user_id = caller_id
      and (p_include_archived or (liability.status <> 'archived' and not account.archived))
  ), items as (
    select base.*,
      term.payload as current_term,
      rates.payload as current_rates,
      obligation.payload as next_obligation,
      payment_rule.payload as payment_rule,
      card.payload as card
    from base
    left join lateral (
      select to_jsonb(current_term) - array['user_id', 'created_at', 'updated_at'] as payload
      from public.liability_terms current_term
      where current_term.user_id = base.user_id and current_term.account_id = base.account_id
        and current_term.starts_on <= local_today
        and (current_term.ends_on is null or current_term.ends_on >= local_today)
      order by current_term.starts_on desc, current_term.id desc limit 1
    ) term on true
    left join lateral (
      select coalesce(jsonb_agg(
        to_jsonb(current_rate) - array['user_id', 'created_at']
        order by current_rate.rate_kind
      ), '[]'::jsonb) as payload
      from public.liability_rate_periods current_rate
      where current_rate.user_id = base.user_id and current_rate.account_id = base.account_id
        and current_rate.starts_on <= local_today
        and (current_rate.ends_on is null or current_rate.ends_on >= local_today)
    ) rates on true
    left join lateral (
      select jsonb_build_object(
        'id', due.id, 'kind', due.kind, 'sequenceNumber', due.sequence_number,
        'dueOn', due.due_on, 'minimumDue', due.minimum_due,
        'principalDue', due.principal_due, 'interestDue', due.interest_due,
        'feeDue', due.fee_due,
        'totalDue', due.total_due, 'allocated', coalesce(paid.amount, 0),
        'remaining', greatest(due.total_due - coalesce(paid.amount, 0), 0),
        'status', case
          when due.due_on < local_today then 'overdue'
          when due.due_on = local_today then 'due'
          else due.status
        end, 'version', due.version
      ) as payload
      from public.liability_obligations due
      left join lateral (
        select sum(allocation.amount) as amount
        from public.liability_payment_allocations allocation
        where allocation.user_id = due.user_id and allocation.obligation_id = due.id
      ) paid on true
      where due.user_id = base.user_id and due.account_id = base.account_id
        and due.status in ('projected', 'open', 'due', 'partial', 'overdue')
        and greatest(due.total_due - coalesce(paid.amount, 0), 0) > 0.01
      order by due.due_on, due.id limit 1
    ) obligation on true
    left join lateral (
      select jsonb_build_object(
        'id', rule.id, 'fundingAccountId', rule.funding_account_id,
        'strategy', rule.strategy, 'fixedAmount', rule.fixed_amount,
        'maximumAmount', rule.maximum_amount, 'daysBeforeDue', rule.days_before_due,
        'recordingMode', rule.recording_mode, 'active', rule.active,
        'suspendedByTarget', rule.suspended_by_target,
        'version', rule.version
      ) as payload
      from public.liability_payment_rules rule
      where rule.user_id = base.user_id and rule.account_id = base.account_id
        and rule.detached_at is null
      order by rule.active desc, rule.updated_at desc limit 1
    ) payment_rule on true
    left join lateral (
      select jsonb_build_object(
        'network', profile.network, 'lastFour', profile.last_four,
        'creditLimit', profile.credit_limit, 'cutoffDay', profile.cutoff_day,
        'dueDay', profile.due_day, 'annualFee', profile.annual_fee,
        'purchaseRateEa', profile.purchase_rate_ea,
        'cashAdvanceRateEa', profile.cash_advance_rate_ea,
        'availableCredit', greatest(profile.credit_limit - greatest(-base.native_balance, 0), 0),
        'version', profile.version
      ) as payload
      from public.credit_card_profiles profile
      where profile.user_id = base.user_id and profile.account_id = base.account_id
    ) card on true
  )
  select jsonb_build_object(
    'reportingCurrency', 'COP',
    'asOf', local_today,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'accountId', item.account_id,
      'accountVersion', item.account_version,
      'liabilityVersion', item.version,
      'name', item.name,
      'kind', item.kind,
      'status', item.status,
      'creditorName', item.creditor_name,
      'currencyCode', item.currency_code,
      'color', item.color,
      'icon', item.icon,
      'entityId', item.entity_id,
      'originalPrincipal', item.original_principal,
      'originatedOn', item.originated_on,
      'maturityOn', item.maturity_on,
      'legacyTargetId', item.legacy_target_id,
      'migrationStatus', item.migration_status,
      'nativeBalance', item.native_balance,
      'nativeDebt', greatest(-item.native_balance, 0),
      'reportingBalance', item.reporting_balance,
      'reportingDebt', greatest(-item.reporting_balance, 0),
      'currentTerm', item.current_term,
      'currentRates', item.current_rates,
      'nextObligation', item.next_obligation,
      'paymentRule', item.payment_rule,
      'card', item.card
    ) order by
      case item.status when 'active' then 0 when 'paused' then 1 when 'settled' then 2 else 3 end,
      item.name, item.account_id), '[]'::jsonb)
  ) into result
  from items item;
  return result;
end;
$$;

create or replace function public.get_liability_calendar_v2(
  p_start_date date,
  p_end_date date,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  result jsonb;
  local_today date;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'valid calendar dates are required';
  end if;
  if p_end_date - p_start_date > 1095 then raise exception 'calendar range cannot exceed three years'; end if;
  select (now() at time zone profile.timezone)::date into local_today
  from public.profiles profile where profile.id = caller_id;
  local_today := coalesce(local_today, current_date);
  with calendar_items as (
    select obligation.due_on as item_date, 'obligation'::text as item_type,
      obligation.id, obligation.account_id, account.name as account_name,
      account.currency_code, liability.kind as liability_kind,
      case
        when obligation.due_on < local_today and obligation.status in ('projected', 'open', 'due', 'partial') then 'overdue'
        when obligation.due_on = local_today and obligation.status in ('projected', 'open') then 'due'
        else obligation.status
      end as status, obligation.total_due as amount,
      greatest(obligation.total_due - coalesce(paid.amount, 0), 0) as remaining,
      obligation.minimum_due, obligation.sequence_number,
      null::uuid as ledger_event_id, obligation.version
    from public.liability_obligations obligation
    join public.liabilities liability
      on liability.user_id = obligation.user_id and liability.account_id = obligation.account_id
    join public.accounts account
      on account.user_id = obligation.user_id and account.id = obligation.account_id
    left join lateral (
      select sum(allocation.amount) as amount
      from public.liability_payment_allocations allocation
      where allocation.user_id = obligation.user_id and allocation.obligation_id = obligation.id
    ) paid on true
    where obligation.user_id = caller_id
      and obligation.due_on between p_start_date and p_end_date
    union all
    select intent.scheduled_for, 'payment_intent', intent.id, intent.account_id,
      account.name, account.currency_code, liability.kind, intent.status,
      intent.planned_amount, intent.planned_amount, 0, null::integer,
      intent.ledger_event_id, intent.version
    from public.liability_payment_intents intent
    join public.liabilities liability
      on liability.user_id = intent.user_id and liability.account_id = intent.account_id
    join public.accounts account
      on account.user_id = intent.user_id and account.id = intent.account_id
    where intent.user_id = caller_id
      and intent.scheduled_for between p_start_date and p_end_date
  ), page as (
    select * from calendar_items
    order by item_date, item_type, id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  )
  select jsonb_build_object(
    'startDate', p_start_date, 'endDate', p_end_date,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'date', item_date, 'type', item_type, 'id', id,
      'accountId', account_id, 'accountName', account_name,
      'currencyCode', currency_code, 'liabilityKind', liability_kind,
      'status', status, 'amount', amount, 'remaining', remaining,
      'minimumDue', minimum_due, 'sequenceNumber', sequence_number,
      'ledgerEventId', ledger_event_id, 'version', version
    ) order by item_date, item_type, id), '[]'::jsonb)
  ) into result from page;
  return result;
end;
$$;

-- Preserve the existing WAL contract while allowing `p_debt` to carry the V2
-- liability, terms, rate and schedule payload. Target + account + liability are
-- committed or rolled back together under the original receipt.
create or replace function public.upsert_financial_target_v2(
  p_operation_id uuid,
  p_target jsonb,
  p_debt jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := private.require_current_finance_user_v2();
  saved_target_id uuid := (p_target->>'id')::uuid;
  prior_id uuid;
  existing_target_record public.financial_targets%rowtype;
  target_exists boolean := false;
  existing_liability_account_id uuid;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or saved_target_id is null then raise exception 'operation and target are required'; end if;
  select (receipt.result->>'id')::uuid into prior_id
  from public.mutation_receipts receipt
  where receipt.operation_id = p_operation_id and receipt.user_id = caller_id
    and receipt.operation = 'financial_target.upsert';
  if found then return prior_id; end if;
  select * into existing_target_record
  from public.financial_targets target
  where target.user_id = caller_id and target.id = saved_target_id
  for update;
  target_exists := found;
  if not target_exists and coalesce(p_target->>'status', 'active') <> 'active' then
    raise exception 'a new target must start active';
  end if;

  if target_exists and existing_target_record.kind = 'debt' then
    select coalesce(
      (
        select account.id
        from public.financial_target_debt_details detail
        join public.accounts account
          on account.user_id = detail.user_id
         and account.id = detail.migrated_liability_account_id
         and account.account_type = 'credit'
        where detail.user_id = caller_id and detail.target_id = saved_target_id
      ),
      (
        select liability.account_id
        from public.liabilities liability
        join public.accounts account
          on account.user_id = liability.user_id and account.id = liability.account_id
        where liability.user_id = caller_id
          and liability.legacy_target_id = saved_target_id
          and account.account_type = 'credit'
        order by liability.account_id
        limit 1
      ),
      (
        select account.id from public.accounts account
        where account.user_id = caller_id
          and account.id = existing_target_record.account_id
          and account.account_type = 'credit'
      )
    ) into existing_liability_account_id;

    if existing_liability_account_id is not null then
      if p_target->>'kind' <> 'debt' then
        raise exception 'an existing debt target cannot change kind';
      end if;
      if abs((p_target->>'target_amount')::numeric - existing_target_record.target_amount) > 0.01 then
        raise exception 'an existing debt principal cannot be edited; record a payment or reconciliation';
      end if;
      if abs(
        coalesce((p_target->>'initial_progress')::numeric, 0)
        - existing_target_record.initial_progress
      ) > 0.01 then
        raise exception 'an existing debt opening progress cannot be edited; record a payment or reconciliation';
      end if;
    end if;
  end if;

  insert into public.financial_targets (
    id, user_id, mode, kind, status, title, description, target_amount,
    initial_progress, starts_on, target_date, priority, color, icon,
    account_id, category_id, tracking_mode, completed_at, archived_at
  ) values (
    saved_target_id, caller_id, p_target->>'mode', p_target->>'kind',
    p_target->>'status', p_target->>'title', nullif(p_target->>'description', ''),
    (p_target->>'target_amount')::numeric,
    coalesce((p_target->>'initial_progress')::numeric, 0),
    (p_target->>'starts_on')::date, nullif(p_target->>'target_date', '')::date,
    coalesce((p_target->>'priority')::smallint, 3), p_target->>'color',
    p_target->>'icon', nullif(p_target->>'account_id', '')::uuid,
    nullif(p_target->>'category_id', '')::uuid, p_target->>'tracking_mode',
    nullif(p_target->>'completed_at', '')::timestamptz,
    nullif(p_target->>'archived_at', '')::timestamptz
  ) on conflict (id) do update set
    mode = excluded.mode, kind = excluded.kind,
    title = excluded.title, description = excluded.description,
    target_amount = excluded.target_amount, initial_progress = excluded.initial_progress,
    starts_on = excluded.starts_on, target_date = excluded.target_date,
    priority = excluded.priority, color = excluded.color, icon = excluded.icon,
    account_id = excluded.account_id, category_id = excluded.category_id,
    tracking_mode = excluded.tracking_mode
  where public.financial_targets.user_id = caller_id;

  if p_target->>'kind' = 'debt' and p_debt is not null then
    insert into public.financial_target_debt_details (
      target_id, user_id, creditor, annual_interest_rate, minimum_payment, due_day
    ) values (
      saved_target_id, caller_id, nullif(p_debt->>'creditor', ''),
      coalesce(nullif(p_debt->>'annual_interest_rate', '')::numeric,
        nullif(p_debt->>'effective_annual_rate', '')::numeric),
      nullif(p_debt->>'minimum_payment', '')::numeric,
      nullif(p_debt->>'due_day', '')::smallint
    ) on conflict (target_id) do update set
      creditor = excluded.creditor,
      annual_interest_rate = excluded.annual_interest_rate,
      minimum_payment = excluded.minimum_payment,
      due_day = excluded.due_day
    where public.financial_target_debt_details.user_id = caller_id;
    perform private.sync_financial_target_liability_v2(caller_id, saved_target_id, p_debt);
  else
    update public.liabilities set legacy_target_id = null, migration_status = 'needs_review'
    where user_id = caller_id and legacy_target_id = saved_target_id;
    delete from public.financial_target_debt_details detail
    where detail.target_id = saved_target_id and detail.user_id = caller_id;
  end if;

  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'financial_target.upsert', jsonb_build_object('id', saved_target_id));
  return saved_target_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit, RLS and least-privilege grants
-- ---------------------------------------------------------------------------

create or replace function private.capture_finance_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  owner_id uuid := coalesce((new_data->>'user_id')::uuid, (old_data->>'user_id')::uuid);
  row_id uuid := coalesce(
    (new_data->>'id')::uuid, (old_data->>'id')::uuid,
    (new_data->>'target_id')::uuid, (old_data->>'target_id')::uuid,
    (new_data->>'account_id')::uuid, (old_data->>'account_id')::uuid,
    (new_data->>'obligation_id')::uuid, (old_data->>'obligation_id')::uuid,
    (new_data->>'rule_id')::uuid, (old_data->>'rule_id')::uuid,
    (new_data->>'ledger_event_id')::uuid, (old_data->>'ledger_event_id')::uuid
  );
begin
  if owner_id is null then return coalesce(new, old); end if;
  insert into public.audit_events (
    user_id, entity_type, entity_id, action, previous_data, next_data
  ) values (
    owner_id, tg_table_name, row_id, lower(tg_op), old_data, new_data
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_finance_audit_event()
  from public, anon, authenticated, service_role;

create trigger liabilities_capture_audit
after insert or update or delete on public.liabilities
for each row execute function private.capture_finance_audit_event();
create trigger liability_terms_capture_audit
after insert or update or delete on public.liability_terms
for each row execute function private.capture_finance_audit_event();
create trigger liability_rate_periods_capture_audit
after insert or update or delete on public.liability_rate_periods
for each row execute function private.capture_finance_audit_event();
create trigger liability_obligations_capture_audit
after insert or update or delete on public.liability_obligations
for each row execute function private.capture_finance_audit_event();
create trigger liability_event_metadata_capture_audit
after insert or update or delete on public.liability_event_metadata
for each row execute function private.capture_finance_audit_event();
create trigger liability_payment_rules_capture_audit
after insert or update or delete on public.liability_payment_rules
for each row execute function private.capture_finance_audit_event();
create trigger liability_payment_intents_capture_audit
after insert or update or delete on public.liability_payment_intents
for each row execute function private.capture_finance_audit_event();
create trigger liability_payment_allocations_capture_audit
after insert or update or delete on public.liability_payment_allocations
for each row execute function private.capture_finance_audit_event();
create trigger credit_card_installments_capture_audit_v2
after insert or update or delete on public.credit_card_installments
for each row execute function private.capture_finance_audit_event();

alter table public.liabilities enable row level security;
alter table public.liability_terms enable row level security;
alter table public.liability_rate_periods enable row level security;
alter table public.liability_obligations enable row level security;
alter table public.liability_event_metadata enable row level security;
alter table public.liability_payment_rules enable row level security;
alter table public.liability_payment_intents enable row level security;
alter table public.liability_payment_allocations enable row level security;

-- Trigger-only helpers from the foundations migration predate the private
-- execution contract. They never need to be callable through the Data API.
revoke all on function private.assign_category_main_category()
  from public, anon, authenticated, service_role;
revoke all on function private.validate_transfer_group_v2()
  from public, anon, authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'liabilities', 'liability_terms', 'liability_rate_periods',
    'liability_obligations', 'liability_event_metadata',
    'liability_payment_rules', 'liability_payment_intents',
    'liability_payment_allocations'
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

revoke all on table public.liabilities, public.liability_terms,
  public.liability_rate_periods, public.liability_obligations,
  public.liability_event_metadata, public.liability_payment_rules,
  public.liability_payment_intents, public.liability_payment_allocations
from public, anon, authenticated;
grant select on table public.liabilities,
  public.liability_terms, public.liability_rate_periods,
  public.liability_obligations, public.liability_event_metadata,
  public.liability_payment_rules, public.liability_payment_intents,
  public.liability_payment_allocations to authenticated;

revoke all on function public.upsert_liability_v2(uuid, jsonb, jsonb, bigint, bigint) from public, anon;
revoke all on function public.upsert_liability_terms_v2(uuid, jsonb, jsonb, bigint) from public, anon;
revoke all on function public.upsert_liability_obligation_v2(uuid, jsonb, jsonb, jsonb, boolean, bigint) from public, anon;
revoke all on function public.upsert_liability_payment_rule_v2(uuid, jsonb, bigint) from public, anon;
revoke all on function public.upsert_liability_payment_intent_v2(uuid, jsonb, bigint) from public, anon;
revoke all on function public.record_liability_payment_v2(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.archive_liability_v2(uuid, uuid, bigint, bigint) from public, anon;
revoke all on function public.set_financial_target_status_v2(uuid, uuid, text) from public, anon;
revoke all on function public.preview_liability_reconciliation_v2(
  uuid, date, numeric, uuid, date, numeric, numeric
) from public, anon;
revoke all on function public.get_liability_overview_v2(boolean) from public, anon;
revoke all on function public.get_liability_calendar_v2(date, date, integer) from public, anon;
revoke all on function public.upsert_financial_target_v2(uuid, jsonb, jsonb) from public, anon;

grant execute on function public.upsert_liability_v2(uuid, jsonb, jsonb, bigint, bigint) to authenticated;
grant execute on function public.upsert_liability_terms_v2(uuid, jsonb, jsonb, bigint) to authenticated;
grant execute on function public.upsert_liability_obligation_v2(uuid, jsonb, jsonb, jsonb, boolean, bigint) to authenticated;
grant execute on function public.upsert_liability_payment_rule_v2(uuid, jsonb, bigint) to authenticated;
grant execute on function public.upsert_liability_payment_intent_v2(uuid, jsonb, bigint) to authenticated;
grant execute on function public.record_liability_payment_v2(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.archive_liability_v2(uuid, uuid, bigint, bigint) to authenticated;
grant execute on function public.set_financial_target_status_v2(uuid, uuid, text) to authenticated;
grant execute on function public.preview_liability_reconciliation_v2(
  uuid, date, numeric, uuid, date, numeric, numeric
) to authenticated;
grant execute on function public.get_liability_overview_v2(boolean) to authenticated;
grant execute on function public.get_liability_calendar_v2(date, date, integer) to authenticated;
grant execute on function public.upsert_financial_target_v2(uuid, jsonb, jsonb) to authenticated;

-- The installed clients still call these stable card endpoints. They now act
-- as audited write gateways because the compatibility/read-model tables below
-- are intentionally read-only to authenticated clients.
alter function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint)
  rename to upsert_credit_card_legacy_impl_v1;
alter function public.upsert_credit_card_legacy_impl_v1(uuid, jsonb, jsonb, bigint, bigint)
  set schema private;
alter function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb)
  rename to create_credit_card_purchase_legacy_impl_v1;
alter function public.create_credit_card_purchase_legacy_impl_v1(uuid, jsonb, jsonb, jsonb)
  set schema private;

revoke all on function private.upsert_credit_card_legacy_impl_v1(uuid, jsonb, jsonb, bigint, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.create_credit_card_purchase_legacy_impl_v1(uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.upsert_credit_card_v1(
  p_operation_id uuid,
  p_account jsonb,
  p_card jsonb,
  p_expected_account_version bigint default null,
  p_expected_card_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_current_finance_user_v2();
  return private.upsert_credit_card_legacy_impl_v1(
    p_operation_id, p_account, p_card,
    p_expected_account_version, p_expected_card_version
  );
end;
$$;

create function public.create_credit_card_purchase_v1(
  p_operation_id uuid,
  p_transaction jsonb,
  p_plan jsonb,
  p_installments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_current_finance_user_v2();
  return private.create_credit_card_purchase_legacy_impl_v1(
    p_operation_id, p_transaction, p_plan, p_installments
  );
end;
$$;

revoke all on function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint)
  from public, anon;
revoke all on function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint)
  to authenticated;
grant execute on function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.upsert_credit_card_v1(uuid, jsonb, jsonb, bigint, bigint) is
  'Allowlist-gated compatibility gateway for atomic card/account writes.';
comment on function public.create_credit_card_purchase_v1(uuid, jsonb, jsonb, jsonb) is
  'Allowlist-gated compatibility gateway for atomic card purchase and installment writes.';

-- Target mutations are compound writes. Keep the tables readable for the
-- normal Data API, but route every insert/update through the audited RPCs.
revoke insert, update, delete on table public.financial_targets from authenticated;
grant select on table public.financial_targets to authenticated;
revoke insert, update, delete on table public.financial_target_debt_details from authenticated;
grant select on table public.financial_target_debt_details to authenticated;

-- Credit-card tables are compatibility/read models behind the unified
-- obligations engine. Mutating them directly can bypass statement, ledger and
-- installment reconciliation, so clients only read them and use audited RPCs.
revoke insert, update, delete on table public.credit_card_profiles,
  public.credit_card_rate_periods, public.credit_card_statements,
  public.credit_card_purchase_plans, public.credit_card_installments,
  public.credit_card_payment_allocations from authenticated;
grant select on table public.credit_card_profiles,
  public.credit_card_rate_periods, public.credit_card_statements,
  public.credit_card_purchase_plans, public.credit_card_installments,
  public.credit_card_payment_allocations to authenticated;

-- Recurring schedules still use the Data API. Restrictive write policies keep
-- a client retry or stale offline edit from re-enabling automation while the
-- linked target is paused/closed. SECURITY DEFINER lifecycle helpers run as the
-- owner and therefore remain able to perform the atomic transition itself.
create policy recurring_rules_target_lifecycle_insert_v2
on public.recurring_rules as restrictive for insert to authenticated
with check (
  status <> 'active'
  or financial_target_id is null
  or exists (
    select 1 from public.financial_targets target
    where target.user_id = recurring_rules.user_id
      and target.id = recurring_rules.financial_target_id
      and target.status = 'active'
  )
);

create policy recurring_rules_target_lifecycle_update_v2
on public.recurring_rules as restrictive for update to authenticated
using (true)
with check (
  status <> 'active'
  or financial_target_id is null
  or exists (
    select 1 from public.financial_targets target
    where target.user_id = recurring_rules.user_id
      and target.id = recurring_rules.financial_target_id
      and target.status = 'active'
  )
);

create policy recurring_occurrences_target_lifecycle_update_v2
on public.recurring_occurrences as restrictive for update to authenticated
using (true)
with check (
  status <> 'planned'
  or (
    (
      financial_target_id is null
      or exists (
        select 1 from public.financial_targets target
        where target.user_id = recurring_occurrences.user_id
          and target.id = recurring_occurrences.financial_target_id
          and target.status = 'active'
      )
    )
    and not exists (
      select 1
      from public.recurring_rules linked_rule
      join public.financial_targets target
        on target.user_id = linked_rule.user_id
       and target.id = linked_rule.financial_target_id
      where linked_rule.user_id = recurring_occurrences.user_id
        and linked_rule.id = recurring_occurrences.rule_id
        and target.status <> 'active'
    )
  )
);

comment on table public.liabilities is
  'Metadata for a liability-backed credit account. Current debt is always derived from the account ledger, never stored here.';
comment on table public.liability_obligations is
  'Dated contractual or statement amounts. They are commitments and never duplicate ledger expenses.';
comment on table public.liability_payment_allocations is
  'Allocation metadata linking a real transfer-in ledger event to one obligation.';
