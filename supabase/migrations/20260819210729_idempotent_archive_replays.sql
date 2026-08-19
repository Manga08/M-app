-- Offline WAL entries may be replayed after the database committed but the
-- response was lost. Archiving an already archived owned row is therefore a
-- successful idempotent replay, not a poison item that blocks later changes.
create or replace function public.archive_finance_category(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;

  update public.categories
  set archived = true
  where id = p_id
    and user_id = caller_id
    and transaction_kind = 'expense'
    and archived = false;

  if not found and not exists (
    select 1 from public.categories
    where id = p_id
      and user_id = caller_id
      and transaction_kind = 'expense'
      and archived = true
  ) then
    raise exception 'category not found';
  end if;
end;
$$;

create or replace function public.archive_income_type(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;

  update public.categories
  set archived = true
  where id = p_id
    and user_id = caller_id
    and transaction_kind = 'income'
    and archived = false;

  if not found and not exists (
    select 1 from public.categories
    where id = p_id
      and user_id = caller_id
      and transaction_kind = 'income'
      and archived = true
  ) then
    raise exception 'income type not found';
  end if;
end;
$$;

revoke all on function public.archive_finance_category(uuid) from public, anon, authenticated;
revoke all on function public.archive_income_type(uuid) from public, anon, authenticated;
grant execute on function public.archive_finance_category(uuid) to authenticated;
grant execute on function public.archive_income_type(uuid) to authenticated;
