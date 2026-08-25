-- Goals and debts share one progress model. Progress is derived from the
-- immutable ledger (manual entries + linked transactions), never persisted as
-- a percentage. All public objects remain tenant scoped through RLS.

create table public.financial_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('accumulate', 'pay_down')),
  kind text not null check (kind in ('savings', 'emergency', 'investment', 'purchase', 'debt', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  title text not null check (char_length(title) between 1 and 100),
  description text check (description is null or char_length(description) <= 600),
  target_amount numeric(18, 2) not null check (target_amount > 0),
  initial_progress numeric(18, 2) not null default 0 check (initial_progress >= 0),
  starts_on date not null default current_date,
  target_date date,
  priority smallint not null default 3 check (priority between 1 and 5),
  color text not null default '#7c8cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'target' check (char_length(icon) between 1 and 80 and icon ~ '^(brand:|bank:)?[a-z0-9-]+$'),
  cover_path text,
  account_id uuid,
  category_id uuid,
  tracking_mode text not null default 'movements' check (tracking_mode in ('manual', 'movements')),
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_targets_kind_mode_check check (
    (kind = 'debt' and mode = 'pay_down') or (kind <> 'debt' and mode = 'accumulate')
  ),
  constraint financial_targets_dates_check check (target_date is null or target_date >= starts_on),
  constraint financial_targets_status_dates_check check (
    (status = 'completed' and completed_at is not null and archived_at is null)
    or (status = 'archived' and archived_at is not null)
    or (status in ('active', 'paused') and completed_at is null and archived_at is null)
  ),
  constraint financial_targets_cover_owner_check check (
    cover_path is null or cover_path like user_id::text || '/%'
  ),
  constraint financial_targets_account_owner_fkey foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete restrict,
  constraint financial_targets_category_owner_fkey foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete restrict,
  unique (user_id, id)
);

create table public.financial_target_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  kind text not null check (kind in ('contribution', 'withdrawal', 'payment', 'interest', 'fee', 'adjustment')),
  effect text not null check (effect in ('advance', 'reverse')),
  amount numeric(18, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text check (note is null or char_length(note) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_target_entries_target_owner_fkey foreign key (user_id, target_id)
    references public.financial_targets (user_id, id) on delete cascade,
  unique (user_id, id)
);

create table public.financial_target_debt_details (
  target_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  creditor text check (creditor is null or char_length(creditor) <= 120),
  annual_interest_rate numeric(8, 4) check (annual_interest_rate is null or annual_interest_rate between 0 and 1000),
  minimum_payment numeric(18, 2) check (minimum_payment is null or minimum_payment >= 0),
  due_day smallint check (due_day is null or due_day between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_target_debt_details_target_owner_fkey foreign key (user_id, target_id)
    references public.financial_targets (user_id, id) on delete cascade,
  unique (user_id, target_id)
);

create trigger financial_targets_set_updated_at
before update on public.financial_targets
for each row execute function public.set_updated_at();
create trigger financial_target_entries_set_updated_at
before update on public.financial_target_entries
for each row execute function public.set_updated_at();
create trigger financial_target_debt_details_set_updated_at
before update on public.financial_target_debt_details
for each row execute function public.set_updated_at();

alter table public.transactions
  add column financial_target_id uuid,
  add column financial_target_effect text;
alter table public.recurring_rules
  add column financial_target_id uuid,
  add column financial_target_effect text;
alter table public.recurring_occurrences
  add column financial_target_id uuid,
  add column financial_target_effect text;

alter table public.transactions
  add constraint transactions_financial_target_owner_fkey foreign key (user_id, financial_target_id)
    references public.financial_targets (user_id, id) on delete restrict,
  add constraint transactions_financial_target_shape check (
    (financial_target_id is null and financial_target_effect is null)
    or (financial_target_id is not null and financial_target_effect in ('advance', 'reverse'))
  );
alter table public.recurring_rules
  add constraint recurring_rules_financial_target_owner_fkey foreign key (user_id, financial_target_id)
    references public.financial_targets (user_id, id) on delete restrict,
  add constraint recurring_rules_financial_target_shape check (
    (financial_target_id is null and financial_target_effect is null)
    or (financial_target_id is not null and financial_target_effect in ('advance', 'reverse'))
  );
alter table public.recurring_occurrences
  add constraint recurring_occurrences_financial_target_owner_fkey foreign key (user_id, financial_target_id)
    references public.financial_targets (user_id, id) on delete restrict,
  add constraint recurring_occurrences_financial_target_shape check (
    (financial_target_id is null and financial_target_effect is null)
    or (financial_target_id is not null and financial_target_effect in ('advance', 'reverse'))
  );

create index financial_targets_user_status_idx
  on public.financial_targets (user_id, status, priority, updated_at desc, id)
  where status <> 'archived';
create index financial_targets_account_idx
  on public.financial_targets (user_id, account_id) where account_id is not null;
create index financial_targets_category_idx
  on public.financial_targets (user_id, category_id) where category_id is not null;
create index financial_target_entries_timeline_idx
  on public.financial_target_entries (user_id, target_id, occurred_on desc, created_at desc, id);
create index transactions_financial_target_idx
  on public.transactions (user_id, financial_target_id, occurred_on desc, created_at desc, id)
  where financial_target_id is not null;
create index recurring_rules_financial_target_idx
  on public.recurring_rules (user_id, financial_target_id)
  where financial_target_id is not null and status = 'active';
create index recurring_occurrences_financial_target_idx
  on public.recurring_occurrences (user_id, financial_target_id, effective_on)
  where financial_target_id is not null and status = 'planned';

alter table public.financial_targets enable row level security;
alter table public.financial_target_entries enable row level security;
alter table public.financial_target_debt_details enable row level security;

create policy financial_targets_select_owner on public.financial_targets
for select to authenticated using ((select auth.uid()) = user_id);
create policy financial_targets_insert_owner on public.financial_targets
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy financial_targets_update_owner on public.financial_targets
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy financial_targets_private_access on public.financial_targets
as restrictive for all to authenticated
using ((select public.is_current_user_allowed()))
with check ((select public.is_current_user_allowed()));

create policy financial_target_entries_select_owner on public.financial_target_entries
for select to authenticated using ((select auth.uid()) = user_id);
create policy financial_target_entries_insert_owner on public.financial_target_entries
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy financial_target_entries_update_owner on public.financial_target_entries
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy financial_target_entries_delete_owner on public.financial_target_entries
for delete to authenticated using ((select auth.uid()) = user_id);
create policy financial_target_entries_private_access on public.financial_target_entries
as restrictive for all to authenticated
using ((select public.is_current_user_allowed()))
with check ((select public.is_current_user_allowed()));

create policy financial_target_debt_details_select_owner on public.financial_target_debt_details
for select to authenticated using ((select auth.uid()) = user_id);
create policy financial_target_debt_details_insert_owner on public.financial_target_debt_details
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy financial_target_debt_details_update_owner on public.financial_target_debt_details
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy financial_target_debt_details_delete_owner on public.financial_target_debt_details
for delete to authenticated using ((select auth.uid()) = user_id);
create policy financial_target_debt_details_private_access on public.financial_target_debt_details
as restrictive for all to authenticated
using ((select public.is_current_user_allowed()))
with check ((select public.is_current_user_allowed()));

revoke all on public.financial_targets from public, anon, authenticated;
revoke all on public.financial_target_entries from public, anon, authenticated;
revoke all on public.financial_target_debt_details from public, anon, authenticated;
grant select, insert, update on public.financial_targets to authenticated;
grant select, insert, update, delete on public.financial_target_entries to authenticated;
grant select, insert, update, delete on public.financial_target_debt_details to authenticated;

-- Security-invoker keeps the view behind the same RLS policies as its source
-- tables. Lateral aggregates use the indexed owner/target prefixes.
create view public.financial_target_overview
with (security_invoker = true)
as
select
  target.*,
  target.initial_progress
    + coalesce(entry_totals.amount, 0)
    + coalesce(transaction_totals.amount, 0) as progress_amount
from public.financial_targets target
left join lateral (
  select sum(case when entry.effect = 'advance' then entry.amount else -entry.amount end) as amount
  from public.financial_target_entries entry
  where entry.user_id = target.user_id and entry.target_id = target.id
) entry_totals on true
left join lateral (
  select sum(case when movement.financial_target_effect = 'advance' then movement.amount else -movement.amount end) as amount
  from public.transactions movement
  where movement.user_id = target.user_id and movement.financial_target_id = target.id
) transaction_totals on true;

revoke all on public.financial_target_overview from public, anon, authenticated;
grant select on public.financial_target_overview to authenticated;

-- Existing recurrence materialization stays authoritative for dates. This
-- second, alphabetically-last trigger copies only the optional target link.
create or replace function private.sync_recurring_rule_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recurring_occurrences
  set financial_target_id = new.financial_target_id,
      financial_target_effect = new.financial_target_effect
  where user_id = new.user_id and rule_id = new.id and status = 'planned';
  return new;
end;
$$;
revoke all on function private.sync_recurring_rule_target() from public, anon, authenticated;

create trigger zz_recurring_rules_sync_target
after insert or update of financial_target_id, financial_target_effect on public.recurring_rules
for each row execute function private.sync_recurring_rule_target();

-- Auto-posting first creates the normal ledger rows. The occurrence update
-- then attaches the target to the financially relevant row exactly once.
create or replace function private.attach_posted_occurrence_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'posted' and new.financial_target_id is not null
     and (old.status is distinct from new.status or old.financial_target_id is distinct from new.financial_target_id) then
    if new.kind = 'transfer' then
      update public.transactions
      set financial_target_id = new.financial_target_id,
          financial_target_effect = new.financial_target_effect
      where user_id = new.user_id and transfer_group_id = new.transfer_group_id and kind = 'transfer_in';
    else
      update public.transactions
      set financial_target_id = new.financial_target_id,
          financial_target_effect = new.financial_target_effect
      where user_id = new.user_id and id = new.transaction_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.attach_posted_occurrence_target() from public, anon, authenticated;

create trigger recurring_occurrences_attach_target
after update of status, transaction_id, transfer_group_id, financial_target_id on public.recurring_occurrences
for each row execute function private.attach_posted_occurrence_target();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-target-covers', 'financial-target-covers', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy financial_target_covers_select_owner on storage.objects
for select to authenticated
using (
  bucket_id = 'financial-target-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_current_user_allowed())
);
create policy financial_target_covers_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'financial-target-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_current_user_allowed())
);
create policy financial_target_covers_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'financial-target-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_current_user_allowed())
)
with check (
  bucket_id = 'financial-target-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_current_user_allowed())
);
create policy financial_target_covers_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'financial-target-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_current_user_allowed())
);

comment on table public.financial_targets is
  'Private user goals and debts; progress is derived from ledger entries and linked transactions.';
comment on view public.financial_target_overview is
  'RLS-aware target rows with an authoritative derived progress amount.';

-- Keep the existing scalable cursor API while exposing target links to the
-- editor and movement history. The filters and cursor are unchanged.
create or replace function public.get_transactions_page(
  p_limit integer default 20,
  p_cursor_occurred_on date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_kind text default 'all',
  p_query text default '',
  p_start_date date default null,
  p_end_date date default null,
  p_account_id uuid default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_query text := lower(trim(coalesce(p_query, '')));
  result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if p_kind not in ('all', 'expense', 'income', 'transfer') then raise exception 'invalid movement kind'; end if;
  if char_length(clean_query) > 100 then raise exception 'search is too long'; end if;
  if num_nonnulls(p_cursor_occurred_on, p_cursor_created_at, p_cursor_id) not in (0, 3) then
    raise exception 'cursor fields must be provided together';
  end if;
  if num_nonnulls(p_start_date, p_end_date) not in (0, 2) or (p_start_date is not null and p_start_date >= p_end_date) then
    raise exception 'date bounds must be provided together in ascending order';
  end if;

  with candidate_rows as (
    select movement.*,
      (
        select jsonb_build_object(
          'id', pair.id, 'kind', pair.kind, 'amount', pair.amount,
          'account_id', pair.account_id, 'category_id', pair.category_id,
          'transfer_group_id', pair.transfer_group_id,
          'recurring_occurrence_id', pair.recurring_occurrence_id,
          'financial_target_id', pair.financial_target_id,
          'financial_target_effect', pair.financial_target_effect,
          'description', pair.description, 'merchant', pair.merchant,
          'note', pair.note, 'icon', pair.icon,
          'occurred_on', pair.occurred_on, 'created_at', pair.created_at
        )
        from public.transactions pair
        where pair.user_id = caller_id
          and pair.transfer_group_id = movement.transfer_group_id
          and pair.kind = 'transfer_in'
        limit 1
      ) as transfer_pair
    from public.transactions movement
    where movement.user_id = caller_id
      and movement.kind <> 'transfer_in'
      and (p_start_date is null or movement.occurred_on >= p_start_date)
      and (p_end_date is null or movement.occurred_on < p_end_date)
      and (p_category_id is null or movement.category_id = p_category_id)
      and (
        p_account_id is null or movement.account_id = p_account_id
        or (movement.kind = 'transfer_out' and exists (
          select 1 from public.transactions destination
          where destination.user_id = caller_id
            and destination.transfer_group_id = movement.transfer_group_id
            and destination.kind = 'transfer_in'
            and destination.account_id = p_account_id
        ))
      )
      and (p_kind = 'all' or movement.kind = p_kind or (p_kind = 'transfer' and movement.kind = 'transfer_out'))
      and (
        clean_query = ''
        or position(clean_query in lower(movement.description)) > 0
        or position(clean_query in lower(coalesce(movement.merchant, ''))) > 0
        or position(clean_query in lower(coalesce(movement.note, ''))) > 0
        or exists (
          select 1 from public.categories category
          where category.user_id = caller_id and category.id = movement.category_id
            and position(clean_query in lower(category.name)) > 0
        )
      )
      and (
        p_cursor_occurred_on is null
        or (movement.occurred_on, movement.created_at, movement.id)
          < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
      )
    order by movement.occurred_on desc, movement.created_at desc, movement.id desc
    limit p_limit + 1
  ), page_rows as (
    select * from candidate_rows
    order by occurred_on desc, created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id, 'kind', page.kind, 'amount', page.amount,
        'account_id', page.account_id, 'category_id', page.category_id,
        'transfer_group_id', page.transfer_group_id,
        'recurring_occurrence_id', page.recurring_occurrence_id,
        'financial_target_id', page.financial_target_id,
        'financial_target_effect', page.financial_target_effect,
        'description', page.description, 'merchant', page.merchant,
        'note', page.note, 'icon', page.icon,
        'occurred_on', page.occurred_on, 'created_at', page.created_at,
        'transfer_pair', page.transfer_pair
      ) order by page.occurred_on desc, page.created_at desc, page.id desc)
      from page_rows page
    ), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from candidate_rows),
    'nextCursor', (
      select jsonb_build_object('occurredOn', last_row.occurred_on, 'createdAt', last_row.created_at, 'id', last_row.id)
      from page_rows last_row
      order by last_row.occurred_on, last_row.created_at, last_row.id
      limit 1
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text, date, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text, date, date, uuid, uuid)
  to authenticated;
