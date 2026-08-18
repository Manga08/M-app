-- Idempotent transfer writes: client-generated IDs make offline retries safe.
create or replace function public.upsert_transfer(
  p_transfer_group_id uuid,
  p_source_transaction_id uuid,
  p_destination_transaction_id uuid,
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text,
  p_occurred_on date,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_source_account_id = p_destination_account_id then raise exception 'source and destination must differ'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_source_transaction_id = p_destination_transaction_id then raise exception 'transaction ids must differ'; end if;

  delete from public.transactions
  where user_id = caller_id
    and transfer_group_id = p_transfer_group_id
    and id not in (p_source_transaction_id, p_destination_transaction_id);

  insert into public.transactions (id, user_id, account_id, kind, amount, transfer_group_id, description, note, occurred_on)
  values
    (p_source_transaction_id, caller_id, p_source_account_id, 'transfer_out', p_amount, p_transfer_group_id, p_description, p_note, p_occurred_on),
    (p_destination_transaction_id, caller_id, p_destination_account_id, 'transfer_in', p_amount, p_transfer_group_id, p_description, p_note, p_occurred_on)
  on conflict (id) do update
    set account_id = excluded.account_id,
        kind = excluded.kind,
        amount = excluded.amount,
        transfer_group_id = excluded.transfer_group_id,
        description = excluded.description,
        note = excluded.note,
        occurred_on = excluded.occurred_on;

  return p_transfer_group_id;
end;
$$;

create or replace function public.set_group_allocations(p_allocations jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  allocation_count integer;
  allocation_sum numeric;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'allocations must be an array'; end if;

  select count(*), sum(value::numeric)
  into allocation_count, allocation_sum
  from (
    select item ->> 'group' as group_key, item ->> 'percent' as value
    from jsonb_array_elements(p_allocations) item
  ) input
  where group_key in ('needs', 'wants', 'savings', 'investments', 'debts')
    and value::numeric between 0 and 100;

  if allocation_count <> 5 or allocation_sum <> 100 then
    raise exception 'five unique allocations totaling 100 are required';
  end if;

  if (select count(distinct item ->> 'group') from jsonb_array_elements(p_allocations) item) <> 5 then
    raise exception 'allocation groups must be unique';
  end if;

  insert into public.group_allocations (user_id, group_key, target_percent)
  select caller_id, item ->> 'group', (item ->> 'percent')::numeric
  from jsonb_array_elements(p_allocations) item
  on conflict (user_id, group_key) do update set target_percent = excluded.target_percent;
end;
$$;

-- Least-privilege Data API grants. Email and avatar remain auth-managed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, currency_code, timezone, week_starts_on, month_starts_on, theme_mode, color_theme) on public.profiles to authenticated;
grant select, insert, update, delete on public.accounts, public.categories, public.transactions, public.budgets, public.recurring_rules to authenticated;
grant select, insert, update on public.group_allocations to authenticated;
grant execute on function public.create_transfer(uuid, uuid, numeric, text, date, text) to authenticated;
grant execute on function public.upsert_transfer(uuid, uuid, uuid, uuid, uuid, numeric, text, date, text) to authenticated;
grant execute on function public.set_group_allocations(jsonb) to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;
