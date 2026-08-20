-- Scheduled movements are modeled as a rule, immutable dated occurrences, and
-- a real transaction only after the occurrence is posted. All client-visible
-- rows remain tenant-scoped and protected by RLS.

alter table public.recurring_rules
  add column if not exists destination_account_id uuid,
  add column if not exists note text,
  add column if not exists icon text,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists anchor_day smallint,
  add column if not exists weekday smallint,
  add column if not exists posting_policy text not null default 'scheduled_date',
  add column if not exists timezone text not null default 'America/Bogota',
  add column if not exists auto_post boolean not null default true,
  add column if not exists include_in_budget boolean not null default false,
  add column if not exists include_in_income_target boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz;

update public.recurring_rules
set starts_on = coalesce(starts_on, next_run_on),
    anchor_day = coalesce(anchor_day, extract(day from coalesce(starts_on, next_run_on))::smallint),
    weekday = coalesce(weekday, extract(dow from coalesce(starts_on, next_run_on))::smallint),
    status = case when active then 'active' else 'paused' end
where starts_on is null or anchor_day is null or weekday is null;

alter table public.recurring_rules
  alter column starts_on set not null,
  drop constraint if exists recurring_rules_kind_check,
  drop constraint if exists recurring_rules_dates_check,
  drop constraint if exists recurring_rules_anchor_day_check,
  drop constraint if exists recurring_rules_weekday_check,
  drop constraint if exists recurring_rules_posting_policy_check,
  drop constraint if exists recurring_rules_status_check,
  drop constraint if exists recurring_rules_destination_shape,
  drop constraint if exists recurring_rules_note_length,
  drop constraint if exists recurring_rules_merchant_length,
  drop constraint if exists recurring_rules_icon_format;

alter table public.recurring_rules
  add constraint recurring_rules_kind_check check (kind in ('income', 'expense', 'transfer')),
  add constraint recurring_rules_dates_check check (ends_on is null or ends_on >= starts_on),
  add constraint recurring_rules_anchor_day_check check (anchor_day is null or anchor_day between 1 and 31),
  add constraint recurring_rules_weekday_check check (weekday is null or weekday between 0 and 6),
  add constraint recurring_rules_posting_policy_check check (posting_policy in ('scheduled_date', 'month_start')),
  add constraint recurring_rules_status_check check (status in ('active', 'paused', 'archived')),
  add constraint recurring_rules_destination_shape check (
    (kind = 'transfer' and destination_account_id is not null and destination_account_id <> account_id and category_id is null)
    or (kind in ('income', 'expense') and destination_account_id is null and category_id is not null)
  ),
  add constraint recurring_rules_note_length check (note is null or char_length(note) <= 1000),
  add constraint recurring_rules_merchant_length check (merchant is null or char_length(merchant) <= 120),
  add constraint recurring_rules_icon_format check (
    icon is null or (char_length(icon) between 1 and 80 and icon ~ '^(brand:|bank:)?[a-z0-9-]+$')
  );

alter table public.recurring_rules
  add constraint recurring_rules_user_id_id_key unique (user_id, id),
  add constraint recurring_rules_destination_account_owner_fkey
    foreign key (user_id, destination_account_id)
    references public.accounts (user_id, id) on delete restrict;

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null,
  kind text not null check (kind in ('income', 'expense', 'transfer')),
  scheduled_on date not null,
  effective_on date not null,
  amount numeric(18, 2) not null check (amount > 0),
  account_id uuid not null,
  destination_account_id uuid,
  category_id uuid,
  description text not null check (char_length(description) between 1 and 200),
  merchant text check (merchant is null or char_length(merchant) <= 120),
  note text check (note is null or char_length(note) <= 1000),
  icon text check (icon is null or (char_length(icon) between 1 and 80 and icon ~ '^(brand:|bank:)?[a-z0-9-]+$')),
  status text not null default 'planned' check (status in ('planned', 'posted', 'skipped', 'failed', 'cancelled')),
  transaction_id uuid,
  transfer_group_id uuid,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_occurrences_rule_owner_fkey foreign key (user_id, rule_id)
    references public.recurring_rules (user_id, id) on delete cascade,
  constraint recurring_occurrences_account_owner_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete restrict,
  constraint recurring_occurrences_destination_owner_fkey foreign key (user_id, destination_account_id)
    references public.accounts (user_id, id) on delete restrict,
  constraint recurring_occurrences_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict,
  constraint recurring_occurrences_shape check (
    (kind = 'transfer' and destination_account_id is not null and destination_account_id <> account_id and category_id is null)
    or (kind in ('income', 'expense') and destination_account_id is null and category_id is not null)
  ),
  unique (user_id, rule_id, scheduled_on),
  unique (user_id, id)
);

create trigger recurring_occurrences_set_updated_at
before update on public.recurring_occurrences
for each row execute function public.set_updated_at();

alter table public.transactions
  add column if not exists recurring_occurrence_id uuid;

alter table public.transactions
  add constraint transactions_user_id_id_key unique (user_id, id);

alter table public.transactions
  add constraint transactions_recurring_occurrence_owner_fkey
    foreign key (user_id, recurring_occurrence_id)
    references public.recurring_occurrences (user_id, id) on delete set null;

alter table public.recurring_occurrences
  add constraint recurring_occurrences_transaction_owner_fkey
    foreign key (user_id, transaction_id)
    references public.transactions (user_id, id) on delete set null;

create unique index transactions_recurring_occurrence_unique_idx
  on public.transactions (user_id, recurring_occurrence_id)
  where recurring_occurrence_id is not null;
create index recurring_occurrences_user_calendar_idx
  on public.recurring_occurrences (user_id, effective_on, id);
create index recurring_occurrences_rule_calendar_idx
  on public.recurring_occurrences (user_id, rule_id, scheduled_on);
create index recurring_occurrences_due_idx
  on public.recurring_occurrences (effective_on, id)
  where status = 'planned';
create index recurring_rules_destination_account_idx
  on public.recurring_rules (user_id, destination_account_id)
  where destination_account_id is not null;

alter table public.recurring_occurrences enable row level security;

create policy recurring_occurrences_select_owner on public.recurring_occurrences
for select to authenticated
using ((select auth.uid()) = user_id);

create policy recurring_occurrences_update_owner on public.recurring_occurrences
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy recurring_occurrences_private_access on public.recurring_occurrences
as restrictive for all to authenticated
using ((select public.is_current_user_allowed()))
with check ((select public.is_current_user_allowed()));

revoke all on public.recurring_occurrences from public, anon, authenticated;
grant select, update on public.recurring_occurrences to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;

create or replace function private.recurring_month_date(
  p_year integer,
  p_month integer,
  p_day integer
)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    p_year,
    p_month,
    least(
      greatest(p_day, 1),
      extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer
    )
  )
$$;

create or replace function private.materialize_recurring_rule(
  p_rule_id uuid,
  p_horizon date default (current_date + 400)
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_record public.recurring_rules%rowtype;
  cursor_date date;
  effective_date date;
  absolute_month integer;
  target_year integer;
  target_month integer;
  local_today date;
  generated integer := 0;
begin
  select * into rule_record
  from public.recurring_rules
  where id = p_rule_id;
  if not found then return; end if;

  local_today := (current_timestamp at time zone rule_record.timezone)::date;
  if rule_record.status <> 'active' then
    update public.recurring_occurrences
    set status = 'cancelled'
    where rule_id = rule_record.id and status = 'planned' and scheduled_on >= local_today;
    return;
  end if;

  delete from public.recurring_occurrences
  where rule_id = rule_record.id and status = 'planned' and scheduled_on >= local_today;

  cursor_date := rule_record.starts_on;
  while cursor_date < local_today loop
    if rule_record.cadence = 'weekly' then
      cursor_date := cursor_date + (rule_record.interval_count * 7);
    elsif rule_record.cadence = 'monthly' then
      absolute_month := extract(year from cursor_date)::integer * 12
        + extract(month from cursor_date)::integer - 1 + rule_record.interval_count;
      target_year := floor(absolute_month / 12.0)::integer;
      target_month := mod(absolute_month, 12) + 1;
      cursor_date := private.recurring_month_date(target_year, target_month, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
    else
      target_year := extract(year from cursor_date)::integer + rule_record.interval_count;
      cursor_date := private.recurring_month_date(target_year, extract(month from rule_record.starts_on)::integer, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
    end if;
    generated := generated + 1;
    if generated > 2000 then raise exception 'recurring rule exceeds safe generation limit'; end if;
  end loop;

  generated := 0;
  while cursor_date <= p_horizon and (rule_record.ends_on is null or cursor_date <= rule_record.ends_on) loop
    effective_date := case
      when rule_record.posting_policy = 'month_start' then date_trunc('month', cursor_date)::date
      else cursor_date
    end;

    insert into public.recurring_occurrences (
      user_id, rule_id, kind, scheduled_on, effective_on, amount, account_id,
      destination_account_id, category_id, description, merchant, note, icon
    ) values (
      rule_record.user_id, rule_record.id, rule_record.kind, cursor_date, effective_date,
      rule_record.amount, rule_record.account_id, rule_record.destination_account_id,
      rule_record.category_id, rule_record.description, rule_record.merchant,
      rule_record.note, rule_record.icon
    ) on conflict (user_id, rule_id, scheduled_on) do nothing;

    if rule_record.cadence = 'weekly' then
      cursor_date := cursor_date + (rule_record.interval_count * 7);
    elsif rule_record.cadence = 'monthly' then
      absolute_month := extract(year from cursor_date)::integer * 12
        + extract(month from cursor_date)::integer - 1 + rule_record.interval_count;
      target_year := floor(absolute_month / 12.0)::integer;
      target_month := mod(absolute_month, 12) + 1;
      cursor_date := private.recurring_month_date(target_year, target_month, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
    else
      target_year := extract(year from cursor_date)::integer + rule_record.interval_count;
      cursor_date := private.recurring_month_date(target_year, extract(month from rule_record.starts_on)::integer, coalesce(rule_record.anchor_day, extract(day from rule_record.starts_on)::integer));
    end if;
    generated := generated + 1;
    if generated > 2000 then raise exception 'recurring rule exceeds safe generation limit'; end if;
  end loop;

  update public.recurring_rules
  set next_run_on = coalesce((
    select min(occurrence.effective_on)
    from public.recurring_occurrences occurrence
    where occurrence.rule_id = rule_record.id and occurrence.status = 'planned'
  ), rule_record.ends_on, p_horizon)
  where id = rule_record.id;
end;
$$;

revoke all on function private.recurring_month_date(integer, integer, integer) from public, anon, authenticated;
revoke all on function private.materialize_recurring_rule(uuid, date) from public, anon, authenticated;

create or replace function private.refresh_recurring_rule_occurrences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.materialize_recurring_rule(new.id, (current_date + 400));
  return new;
end;
$$;

revoke all on function private.refresh_recurring_rule_occurrences() from public, anon, authenticated;

create trigger recurring_rules_refresh_occurrences
after insert or update of account_id, destination_account_id, category_id, kind, amount,
  description, merchant, note, icon, cadence, interval_count, starts_on, ends_on,
  anchor_day, posting_policy, timezone, auto_post, include_in_budget,
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

      if due_record.kind = 'transfer' then
        created_transfer_group_id := gen_random_uuid();
        insert into public.transactions (
          id, user_id, account_id, kind, amount, transfer_group_id, description,
          merchant, note, icon, occurred_on, recurring_occurrence_id
        ) values (
          created_transaction_id, due_record.user_id, due_record.account_id, 'transfer_out',
          due_record.amount, created_transfer_group_id, due_record.description,
          due_record.merchant, due_record.note, due_record.icon, due_record.effective_on, due_record.id
        );
        insert into public.transactions (
          user_id, account_id, kind, amount, transfer_group_id, description,
          merchant, note, icon, occurred_on
        ) values (
          due_record.user_id, due_record.destination_account_id, 'transfer_in',
          due_record.amount, created_transfer_group_id, due_record.description,
          due_record.merchant, due_record.note, due_record.icon, due_record.effective_on
        );
      else
        insert into public.transactions (
          id, user_id, account_id, category_id, kind, amount, description,
          merchant, note, icon, occurred_on, recurring_occurrence_id
        ) values (
          created_transaction_id, due_record.user_id, due_record.account_id,
          due_record.category_id, due_record.kind, due_record.amount,
          due_record.description, due_record.merchant, due_record.note,
          due_record.icon, due_record.effective_on, due_record.id
        ) on conflict (user_id, recurring_occurrence_id) where recurring_occurrence_id is not null do nothing;
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
      where id = due_record.id;
      posted_count := posted_count + 1;
    exception when others then
      update public.recurring_occurrences
      set status = 'failed', failure_reason = left(sqlerrm, 500)
      where id = due_record.id;
    end;
  end loop;

  update public.recurring_rules rule_record
  set next_run_on = coalesce((
    select min(occurrence.effective_on)
    from public.recurring_occurrences occurrence
    where occurrence.rule_id = rule_record.id and occurrence.status = 'planned'
  ), rule_record.ends_on, current_date + 400)
  where rule_record.status = 'active';

  return posted_count;
end;
$$;

revoke all on function private.process_due_recurring_occurrences(integer) from public, anon, authenticated;

do $$
declare
  existing_rule record;
begin
  for existing_rule in select id from public.recurring_rules loop
    perform private.materialize_recurring_rule(existing_rule.id, current_date + 400);
  end loop;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'moneva-recurring-hourly' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'moneva-recurring-hourly',
    '5 * * * *',
    'select private.process_due_recurring_occurrences(250);'
  );
end;
$$;

comment on table public.recurring_occurrences is
  'Materialized immutable snapshots of dated recurring-rule instances. A planned row does not affect balances until posted.';
comment on column public.transactions.recurring_occurrence_id is
  'Links a generated real movement to exactly one scheduled occurrence for idempotency and traceability.';
