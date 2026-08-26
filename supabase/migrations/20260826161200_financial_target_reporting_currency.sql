-- Financial targets are defined in the profile reporting currency. A movement
-- can be stored in COP or USD, so progress must use the immutable base amount
-- captured when the movement was posted.
create or replace view public.financial_target_overview
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
  select sum(case when movement.financial_target_effect = 'advance' then movement.base_amount else -movement.base_amount end) as amount
  from public.transactions movement
  where movement.user_id = target.user_id and movement.financial_target_id = target.id
) transaction_totals on true;

revoke all on public.financial_target_overview from public, anon, authenticated;
grant select on public.financial_target_overview to authenticated;

comment on view public.financial_target_overview is
  'Owner-scoped target progress. Manual entries use reporting currency; linked movements use immutable base_amount snapshots.';
