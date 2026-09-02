-- Keep the schedule date and the publication date as two different concepts.
-- A monthly rule for day 24 can be published on day 1 while the generated
-- movement still belongs to day 24 in the ledger and reports.

update public.recurring_rules
set posting_policy = 'scheduled_date'
where cadence <> 'monthly' and posting_policy = 'month_start';

alter table public.recurring_rules
  drop constraint if exists recurring_rules_month_start_monthly_check,
  add constraint recurring_rules_month_start_monthly_check check (
    posting_policy <> 'month_start' or cadence = 'monthly'
  );

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
          due_record.merchant, due_record.note, due_record.icon, due_record.scheduled_on, due_record.id,
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
          due_record.merchant, due_record.note, due_record.icon, due_record.scheduled_on,
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
          due_record.icon, due_record.scheduled_on, due_record.id,
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

revoke all on function private.process_due_recurring_occurrences(integer)
  from public, anon, authenticated;

-- Repair only movements that can be traced unambiguously to a month-start
-- occurrence. Transfer counterparts share the same transfer_group_id.
with corrected_transfers as (
  select linked.user_id, linked.transfer_group_id, occurrence.scheduled_on
  from public.transactions linked
  join public.recurring_occurrences occurrence
    on occurrence.user_id = linked.user_id and occurrence.id = linked.recurring_occurrence_id
  join public.recurring_rules rule_record
    on rule_record.user_id = occurrence.user_id and rule_record.id = occurrence.rule_id
  where rule_record.posting_policy = 'month_start'
    and linked.transfer_group_id is not null
)
update public.transactions movement
set occurred_on = corrected.scheduled_on
from corrected_transfers corrected
where movement.user_id = corrected.user_id
  and movement.transfer_group_id = corrected.transfer_group_id
  and movement.occurred_on is distinct from corrected.scheduled_on;

update public.transactions movement
set occurred_on = occurrence.scheduled_on
from public.recurring_occurrences occurrence
join public.recurring_rules rule_record
  on rule_record.user_id = occurrence.user_id and rule_record.id = occurrence.rule_id
where movement.user_id = occurrence.user_id
  and movement.recurring_occurrence_id = occurrence.id
  and rule_record.posting_policy = 'month_start'
  and movement.occurred_on is distinct from occurrence.scheduled_on;

comment on column public.recurring_occurrences.scheduled_on is
  'Date assigned to the financial movement and retained in the ledger.';
comment on column public.recurring_occurrences.effective_on is
  'Date when Moneva may publish the occurrence; it can precede scheduled_on for month-start visibility.';
