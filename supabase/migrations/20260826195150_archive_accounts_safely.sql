-- Close accounts without deleting their ledger or historical labels.
-- The invariant is intentionally strict: a closed account must be settled and
-- cannot remain attached to future automation or an active financial target.

set lock_timeout = '10s';
set statement_timeout = '120s';

create or replace function public.archive_account_v1(
  p_operation_id uuid,
  p_account_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_account public.accounts%rowtype;
  current_balance numeric := 0;
  linked_rules integer := 0;
  linked_targets integer := 0;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or p_account_id is null then raise exception 'operation and account are required'; end if;

  select result into prior_result
  from public.mutation_receipts
  where operation_id = p_operation_id
    and user_id = caller_id
    and operation = 'account.archive';
  if found then return prior_result; end if;

  select * into saved_account
  from public.accounts
  where id = p_account_id
    and user_id = caller_id
    and not archived
  for update;
  if not found then raise exception 'account is not available'; end if;
  if saved_account.version <> p_expected_version then raise exception 'account was modified elsewhere'; end if;

  select saved_account.initial_balance + coalesce(sum(case
    when movement.kind in ('income', 'transfer_in', 'adjustment_in') then movement.amount
    else -movement.amount
  end), 0)
  into current_balance
  from public.transactions movement
  where movement.user_id = caller_id
    and movement.account_id = saved_account.id;

  if abs(current_balance) >= 0.005 then
    raise exception 'account balance must be zero before archival';
  end if;

  select count(*) into linked_rules
  from public.recurring_rules rule
  where rule.user_id = caller_id
    and rule.status <> 'archived'
    and (rule.account_id = saved_account.id or rule.destination_account_id = saved_account.id);
  if linked_rules > 0 then
    raise exception 'account still has linked recurring rules';
  end if;

  select count(*) into linked_targets
  from public.financial_targets target
  where target.user_id = caller_id
    and target.status in ('active', 'paused')
    and target.account_id = saved_account.id;
  if linked_targets > 0 then
    raise exception 'account still has linked active financial targets';
  end if;

  update public.accounts
  set archived = true,
      archived_at = now(),
      version = version + 1
  where id = saved_account.id
    and user_id = caller_id
  returning * into saved_account;

  prior_result := jsonb_build_object(
    'id', saved_account.id,
    'version', saved_account.version,
    'archivedAt', saved_account.archived_at
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account.archive', prior_result);
  return prior_result;
end;
$$;

revoke all on function public.archive_account_v1(uuid, uuid, bigint) from public, anon;
grant execute on function public.archive_account_v1(uuid, uuid, bigint) to authenticated;

comment on function public.archive_account_v1(uuid, uuid, bigint) is
  'Archives one settled account atomically while preserving its ledger, report labels and ownership history.';
