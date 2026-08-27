-- Scheduled movements keep the same immutable money snapshot as manual
-- movements. The applied rate is fixed until the user edits the rule; this
-- keeps an automatic posting deterministic and auditable.
alter table public.recurring_rules
  add column destination_amount numeric(18,2),
  add column exchange_rate numeric not null default 1,
  add column exchange_rate_date date not null default current_date,
  add column exchange_rate_source text not null default 'same_currency',
  add column reference_exchange_rate numeric(18,8),
  add column reference_rate_source text;

alter table public.recurring_rules
  add constraint recurring_rules_destination_amount_check
    check (destination_amount is null or destination_amount > 0),
  add constraint recurring_rules_exchange_rate_check
    check (exchange_rate > 0),
  add constraint recurring_rules_exchange_rate_source_check
    check (exchange_rate_source in ('same_currency', 'manual', 'provider', 'imported')),
  add constraint recurring_rules_reference_exchange_rate_check
    check (reference_exchange_rate is null or reference_exchange_rate > 0),
  add constraint recurring_rules_reference_rate_source_check
    check (reference_rate_source is null or reference_rate_source in ('sfc_trm', 'manual', 'imported'));

alter table public.recurring_occurrences
  add column destination_amount numeric(18,2),
  add column exchange_rate numeric not null default 1,
  add column exchange_rate_date date not null default current_date,
  add column exchange_rate_source text not null default 'same_currency',
  add column reference_exchange_rate numeric(18,8),
  add column reference_rate_source text;

alter table public.recurring_occurrences
  add constraint recurring_occurrences_destination_amount_check
    check (destination_amount is null or destination_amount > 0),
  add constraint recurring_occurrences_exchange_rate_check
    check (exchange_rate > 0),
  add constraint recurring_occurrences_exchange_rate_source_check
    check (exchange_rate_source in ('same_currency', 'manual', 'provider', 'imported')),
  add constraint recurring_occurrences_reference_exchange_rate_check
    check (reference_exchange_rate is null or reference_exchange_rate > 0),
  add constraint recurring_occurrences_reference_rate_source_check
    check (reference_rate_source is null or reference_rate_source in ('sfc_trm', 'manual', 'imported'));

update public.recurring_rules
set exchange_rate_date = starts_on
where exchange_rate_source = 'same_currency';

create or replace function private.prepare_recurring_rule_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_currency text;
  destination_currency text;
  reporting_currency text;
begin
  select source_account.currency_code, profile.currency_code
  into source_currency, reporting_currency
  from public.accounts source_account
  join public.profiles profile on profile.id = source_account.user_id
  where source_account.user_id = new.user_id and source_account.id = new.account_id;

  if source_currency is null then raise exception 'scheduled source account is not available'; end if;
  new.exchange_rate_date := coalesce(new.exchange_rate_date, new.starts_on);

  if new.reference_exchange_rate is null then
    new.reference_rate_source := null;
  elsif new.reference_rate_source is null then
    new.reference_rate_source := 'sfc_trm';
  end if;

  if new.kind = 'transfer' then
    select account.currency_code into destination_currency
    from public.accounts account
    where account.user_id = new.user_id and account.id = new.destination_account_id;

    if destination_currency is null then raise exception 'scheduled destination account is not available'; end if;
    if source_currency = destination_currency then
      new.destination_amount := new.amount;
      if source_currency = reporting_currency then
        new.exchange_rate := 1;
        new.exchange_rate_source := 'same_currency';
      elsif new.exchange_rate is null or new.exchange_rate <= 0 then
        raise exception 'a positive exchange rate is required for a scheduled foreign-currency transfer';
      end if;
    else
      if new.destination_amount is null or new.destination_amount <= 0 then
        raise exception 'a destination amount is required for a scheduled currency conversion';
      end if;
      if new.exchange_rate is null or new.exchange_rate <= 0 then
        raise exception 'a positive exchange rate is required for a scheduled currency conversion';
      end if;
      if new.exchange_rate_source = 'same_currency' then new.exchange_rate_source := 'manual'; end if;
    end if;
  else
    new.destination_amount := null;
    if source_currency = reporting_currency then
      new.exchange_rate := 1;
      new.exchange_rate_source := 'same_currency';
    elsif new.exchange_rate is null or new.exchange_rate <= 0 then
      raise exception 'a positive exchange rate is required for a scheduled foreign-currency movement';
    elsif new.exchange_rate_source = 'same_currency' then
      new.exchange_rate_source := 'manual';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_recurring_rule_money() from public, anon, authenticated;

drop trigger if exists recurring_rules_prepare_money on public.recurring_rules;
create trigger recurring_rules_prepare_money
before insert or update of account_id, destination_account_id, kind, amount,
  destination_amount, exchange_rate, exchange_rate_date, exchange_rate_source,
  reference_exchange_rate, reference_rate_source
on public.recurring_rules
for each row execute function private.prepare_recurring_rule_money();

create or replace function private.prepare_recurring_occurrence_money()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_record public.recurring_rules%rowtype;
begin
  select * into rule_record
  from public.recurring_rules
  where user_id = new.user_id and id = new.rule_id;
  if not found then raise exception 'scheduled rule is not available'; end if;

  new.destination_amount := rule_record.destination_amount;
  new.exchange_rate := rule_record.exchange_rate;
  new.exchange_rate_date := rule_record.exchange_rate_date;
  new.exchange_rate_source := rule_record.exchange_rate_source;
  new.reference_exchange_rate := rule_record.reference_exchange_rate;
  new.reference_rate_source := rule_record.reference_rate_source;
  return new;
end;
$$;

revoke all on function private.prepare_recurring_occurrence_money() from public, anon, authenticated;

drop trigger if exists recurring_occurrences_prepare_money on public.recurring_occurrences;
create trigger recurring_occurrences_prepare_money
before insert or update of rule_id
on public.recurring_occurrences
for each row execute function private.prepare_recurring_occurrence_money();

update public.recurring_occurrences occurrence
set destination_amount = rule_record.destination_amount,
    exchange_rate = rule_record.exchange_rate,
    exchange_rate_date = rule_record.exchange_rate_date,
    exchange_rate_source = rule_record.exchange_rate_source,
    reference_exchange_rate = rule_record.reference_exchange_rate,
    reference_rate_source = rule_record.reference_rate_source
from public.recurring_rules rule_record
where rule_record.user_id = occurrence.user_id and rule_record.id = occurrence.rule_id;

drop trigger if exists recurring_rules_refresh_occurrences on public.recurring_rules;
create trigger recurring_rules_refresh_occurrences
after insert or update of account_id, destination_account_id, category_id, kind, amount,
  destination_amount, exchange_rate, exchange_rate_date, exchange_rate_source,
  reference_exchange_rate, reference_rate_source,
  description, merchant, note, icon, cadence, interval_count, starts_on, ends_on,
  anchor_day, second_anchor_day, posting_policy, timezone, auto_post, include_in_budget,
  include_in_income_target, status
on public.recurring_rules
for each row execute function private.refresh_recurring_rule_occurrences();

create or replace function private.process_due_recurring_occurrences(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_record record;
  posted_count integer := 0;
  created_transaction_id uuid;
  created_transfer_group_id uuid;
  source_currency text;
  destination_currency text;
  reporting_currency text;
  source_rate numeric;
  destination_rate numeric;
  destination_amount numeric;
  reporting_amount numeric;
begin
  if p_limit not between 1 and 1000 then raise exception 'invalid processing limit'; end if;

  for due_record in
    select occurrence.*, rule_record.timezone, rule_record.auto_post, rule_record.status as rule_status
    from public.recurring_occurrences occurrence
    join public.recurring_rules rule_record
      on rule_record.user_id = occurrence.user_id and rule_record.id = occurrence.rule_id
    where occurrence.status = 'planned'
      and rule_record.status = 'active'
      and rule_record.auto_post
      and occurrence.effective_on <= (current_timestamp at time zone rule_record.timezone)::date
    order by occurrence.effective_on, occurrence.id
    for update of occurrence skip locked
    limit p_limit
  loop
    begin
      created_transaction_id := gen_random_uuid();
      created_transfer_group_id := null;
      destination_currency := null;

      select source_account.currency_code, profile.currency_code
      into source_currency, reporting_currency
      from public.accounts source_account
      join public.profiles profile on profile.id = source_account.user_id
      where source_account.user_id = due_record.user_id and source_account.id = due_record.account_id;
      if source_currency is null then raise exception 'scheduled source account is not available'; end if;

      source_rate := case
        when source_currency = reporting_currency then 1
        when source_currency = 'USD' and reporting_currency = 'COP' then due_record.exchange_rate
        when source_currency = 'COP' and reporting_currency = 'USD' then 1 / due_record.exchange_rate
        else due_record.exchange_rate
      end;

      if due_record.kind = 'transfer' then
        select account.currency_code into destination_currency
        from public.accounts account
        where account.user_id = due_record.user_id and account.id = due_record.destination_account_id;
        if destination_currency is null then raise exception 'scheduled destination account is not available'; end if;

        destination_amount := case when source_currency = destination_currency
          then due_record.amount else due_record.destination_amount end;
        if destination_amount is null or destination_amount <= 0 then
          raise exception 'scheduled currency conversion requires a destination amount';
        end if;

        reporting_amount := case
          when source_currency = reporting_currency then due_record.amount
          when destination_currency = reporting_currency then destination_amount
          else round(due_record.amount * source_rate, 8)
        end;
        source_rate := reporting_amount / due_record.amount;
        destination_rate := reporting_amount / destination_amount;
        created_transfer_group_id := gen_random_uuid();

        insert into public.transactions (
          id, user_id, account_id, kind, amount, transfer_group_id, description,
          merchant, note, icon, occurred_on, recurring_occurrence_id,
          exchange_rate, exchange_rate_date, exchange_rate_source,
          reference_exchange_rate, reference_rate_source
        ) values (
          created_transaction_id, due_record.user_id, due_record.account_id, 'transfer_out',
          due_record.amount, created_transfer_group_id, due_record.description,
          due_record.merchant, due_record.note, due_record.icon, due_record.effective_on, due_record.id,
          source_rate, due_record.exchange_rate_date,
          case when source_currency = reporting_currency then 'same_currency' else due_record.exchange_rate_source end,
          due_record.reference_exchange_rate, due_record.reference_rate_source
        );
        insert into public.transactions (
          user_id, account_id, kind, amount, transfer_group_id, description,
          merchant, note, icon, occurred_on,
          exchange_rate, exchange_rate_date, exchange_rate_source,
          reference_exchange_rate, reference_rate_source
        ) values (
          due_record.user_id, due_record.destination_account_id, 'transfer_in',
          destination_amount, created_transfer_group_id, due_record.description,
          due_record.merchant, due_record.note, due_record.icon, due_record.effective_on,
          destination_rate, due_record.exchange_rate_date,
          case when destination_currency = reporting_currency then 'same_currency' else due_record.exchange_rate_source end,
          due_record.reference_exchange_rate, due_record.reference_rate_source
        );
      else
        insert into public.transactions (
          id, user_id, account_id, category_id, kind, amount, description,
          merchant, note, icon, occurred_on, recurring_occurrence_id,
          exchange_rate, exchange_rate_date, exchange_rate_source,
          reference_exchange_rate, reference_rate_source
        ) values (
          created_transaction_id, due_record.user_id, due_record.account_id,
          due_record.category_id, due_record.kind, due_record.amount,
          due_record.description, due_record.merchant, due_record.note,
          due_record.icon, due_record.effective_on, due_record.id,
          source_rate, due_record.exchange_rate_date,
          case when source_currency = reporting_currency then 'same_currency' else due_record.exchange_rate_source end,
          due_record.reference_exchange_rate, due_record.reference_rate_source
        ) on conflict (user_id, recurring_occurrence_id)
          where recurring_occurrence_id is not null do nothing;
      end if;

      select movement.id, movement.transfer_group_id
      into created_transaction_id, created_transfer_group_id
      from public.transactions movement
      where movement.user_id = due_record.user_id
        and movement.recurring_occurrence_id = due_record.id
      limit 1;

      update public.recurring_occurrences
      set status = 'posted', transaction_id = created_transaction_id,
          transfer_group_id = created_transfer_group_id, posted_at = now(), failure_reason = null
      where user_id = due_record.user_id and id = due_record.id;
      posted_count := posted_count + 1;
    exception when others then
      update public.recurring_occurrences
      set status = 'failed', failure_reason = left(sqlerrm, 500)
      where user_id = due_record.user_id and id = due_record.id;
    end;
  end loop;

  update public.recurring_rules rule_record
  set next_run_on = coalesce((
    select min(occurrence.effective_on)
    from public.recurring_occurrences occurrence
    where occurrence.user_id = rule_record.user_id
      and occurrence.rule_id = rule_record.id and occurrence.status = 'planned'
  ), rule_record.ends_on, current_date + 400)
  where rule_record.status = 'active';

  return posted_count;
end;
$$;

revoke all on function private.process_due_recurring_occurrences(integer) from public, anon, authenticated;

comment on column public.recurring_rules.exchange_rate is
  'Fixed COP-per-USD quote captured when the schedule is saved. Edited explicitly; never refreshed silently.';
comment on column public.recurring_rules.destination_amount is
  'Exact native amount credited by each cross-currency transfer occurrence.';
