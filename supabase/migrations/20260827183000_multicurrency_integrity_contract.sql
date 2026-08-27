-- One durable COP ledger with COP/USD native accounts. This migration closes
-- states that the early profile UI could create but the accounting model could
-- not interpret safely, and makes every transaction snapshot authoritative.

set lock_timeout = '10s';
set statement_timeout = '120s';

update public.profiles set currency_code = 'COP' where currency_code <> 'COP';

alter table public.profiles
  drop constraint if exists profiles_currency_code_check,
  drop constraint if exists profiles_reporting_currency_check,
  add constraint profiles_reporting_currency_check check (currency_code = 'COP');

create or replace function private.prepare_profile_reporting_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Preserve harmless settings from a queued legacy profile update while
  -- refusing to reinterpret an existing financial ledger in another currency.
  new.currency_code := 'COP';
  return new;
end;
$$;

revoke all on function private.prepare_profile_reporting_currency() from public, anon, authenticated;

drop trigger if exists profiles_00_enforce_reporting_currency on public.profiles;
create trigger profiles_00_enforce_reporting_currency
before insert or update of currency_code on public.profiles
for each row execute function private.prepare_profile_reporting_currency();

create or replace function private.prepare_transaction_ledger()
returns trigger
language plpgsql
security definer
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
  if account_currency not in ('COP', 'USD') then raise exception 'unsupported account currency'; end if;
  if reporting_currency <> 'COP' then raise exception 'unsupported reporting currency'; end if;

  if new.native_currency_code is not null and new.native_currency_code <> account_currency then
    raise exception 'movement currency must match its account';
  end if;
  if new.base_currency_code is not null and new.base_currency_code <> reporting_currency then
    raise exception 'movement reporting currency must match the profile';
  end if;

  new.native_currency_code := account_currency;
  new.base_currency_code := reporting_currency;
  if account_currency = reporting_currency then
    new.exchange_rate := 1;
    new.exchange_rate_source := 'same_currency';
  elsif new.exchange_rate is null or new.exchange_rate <= 0 then
    raise exception 'a positive exchange rate is required for different currencies';
  elsif new.exchange_rate_source is null or new.exchange_rate_source = 'same_currency' then
    new.exchange_rate_source := 'manual';
  end if;
  new.base_amount := round(new.amount * new.exchange_rate, 8);
  new.exchange_rate_date := coalesce(new.exchange_rate_date, new.occurred_on);

  if new.reference_exchange_rate is null then
    new.reference_rate_source := null;
  elsif new.reference_rate_source is null then
    new.reference_rate_source := 'manual';
  end if;

  new.ledger_event_id := coalesce(new.transfer_group_id, new.id);
  expected_event_type := case
    when new.kind = 'income' then 'income'
    when new.kind = 'expense' then 'expense'
    when new.kind in ('adjustment_in', 'adjustment_out') then 'adjustment'
    else 'transfer'
  end;

  insert into public.ledger_events (
    id, user_id, event_type, occurred_on, description, merchant, note, source, idempotency_key
  ) values (
    new.ledger_event_id, new.user_id, expected_event_type, new.occurred_on,
    new.description, new.merchant, new.note,
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

  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on function private.prepare_transaction_ledger() from public, anon, authenticated;

alter table public.transactions
  drop constraint if exists transactions_currency_codes_check,
  drop constraint if exists transactions_money_snapshot_consistency,
  add constraint transactions_currency_codes_check check (
    native_currency_code in ('COP', 'USD') and base_currency_code = 'COP'
  ),
  add constraint transactions_money_snapshot_consistency check (
    (native_currency_code = base_currency_code and exchange_rate = 1 and exchange_rate_source = 'same_currency')
    or
    (native_currency_code <> base_currency_code and exchange_rate > 0 and exchange_rate_source <> 'same_currency')
  );

-- Repair only the deterministic side of legacy schedules. A USD quote cannot
-- be guessed; those rules retain the explicit snapshot supplied by the user.
update public.recurring_rules rule_record
set exchange_rate = 1,
    exchange_rate_source = 'same_currency',
    exchange_rate_date = coalesce(rule_record.exchange_rate_date, rule_record.starts_on)
from public.accounts account
where account.user_id = rule_record.user_id
  and account.id = rule_record.account_id
  and account.currency_code = 'COP'
  and (rule_record.exchange_rate <> 1 or rule_record.exchange_rate_source <> 'same_currency');

comment on column public.profiles.currency_code is
  'Immutable reporting currency. Moneva currently keeps the durable ledger, budgets and reports in COP; accounts preserve COP or USD natively.';
comment on column public.recurring_rules.exchange_rate is
  'Fixed COP-per-USD quote captured when a foreign-currency schedule is saved. COP-source non-transfer rules use exactly 1.';
