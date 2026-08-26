-- Financial targets are intentionally metadata-only. Personal images are not
-- accepted or retained so goals and debts do not consume user Storage quota.

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'financial-target-covers'
  ) then
    raise exception 'financial-target-covers must be empty before removal';
  end if;
end;
$$;

drop policy if exists financial_target_covers_select_owner on storage.objects;
drop policy if exists financial_target_covers_insert_owner on storage.objects;
drop policy if exists financial_target_covers_update_owner on storage.objects;
drop policy if exists financial_target_covers_delete_owner on storage.objects;

drop view if exists public.financial_target_overview;

alter table public.financial_targets
  drop constraint if exists financial_targets_cover_owner_check,
  drop column if exists cover_path;

create view public.financial_target_overview
with (security_invoker = true)
as
select
  target.id,
  target.user_id,
  target.mode,
  target.kind,
  target.status,
  target.title,
  target.description,
  target.target_amount,
  target.initial_progress,
  target.starts_on,
  target.target_date,
  target.priority,
  target.color,
  target.icon,
  target.account_id,
  target.category_id,
  target.tracking_mode,
  target.completed_at,
  target.archived_at,
  target.created_at,
  target.updated_at,
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
  select sum(case when movement.financial_target_effect = 'advance' then movement.base_amount else -movement.base_amount end) as amount
  from public.transactions movement
  where movement.user_id = target.user_id and movement.financial_target_id = target.id
) transaction_totals on true;

revoke all on public.financial_target_overview from public, anon, authenticated;
grant select on public.financial_target_overview to authenticated;

comment on view public.financial_target_overview is
  'Owner-scoped target progress without media storage. Manual entries use reporting currency; linked movements use immutable base_amount snapshots.';

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
    initial_progress, starts_on, target_date, priority, color, icon,
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

revoke all on function public.upsert_financial_target_v2(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.upsert_financial_target_v2(uuid, jsonb, jsonb)
  to authenticated;
