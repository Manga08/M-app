-- Optional account groupings. An entity is organizational metadata only: it owns
-- neither balances nor ledger postings, which remain attached to accounts.
create table public.account_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  color text not null default '#34d399' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'landmark' check (char_length(icon) between 1 and 160),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived boolean not null default false,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check ((archived and archived_at is not null) or (not archived and archived_at is null))
);

create unique index account_entities_user_active_name_idx
  on public.account_entities (user_id, lower(trim(name))) where archived = false;
create index account_entities_user_active_order_idx
  on public.account_entities (user_id, sort_order, name) where archived = false;

alter table public.accounts add column entity_id uuid;
alter table public.accounts
  add constraint accounts_user_entity_fkey
  foreign key (user_id, entity_id)
  references public.account_entities (user_id, id)
  on delete restrict;

create index accounts_user_entity_active_idx
  on public.accounts (user_id, entity_id, created_at) where archived = false and entity_id is not null;

create trigger account_entities_set_updated_at
before update on public.account_entities
for each row execute function public.set_updated_at();

create trigger account_entities_capture_audit
after insert or update or delete on public.account_entities
for each row execute function private.capture_finance_audit_event();

alter table public.account_entities enable row level security;

create policy account_entities_select_self on public.account_entities
  for select to authenticated using (user_id = (select auth.uid()));
create policy account_entities_insert_self on public.account_entities
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy account_entities_update_self on public.account_entities
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy account_entities_private_access on public.account_entities
  as restrictive for all to authenticated
  using ((select public.is_current_user_allowed()))
  with check ((select public.is_current_user_allowed()));

revoke all on table public.account_entities from public, anon, authenticated;
grant select, insert, update on table public.account_entities to authenticated;

create or replace function public.upsert_account_entity(
  p_operation_id uuid,
  p_entity jsonb,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entity_id uuid := (p_entity->>'id')::uuid;
  saved_entity public.account_entities%rowtype;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or entity_id is null then raise exception 'operation and entity are required'; end if;

  select result into prior_result
  from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'account-entity.upsert';
  if found then return prior_result; end if;

  if trim(coalesce(p_entity->>'name', '')) = '' then raise exception 'entity name is required'; end if;
  if coalesce(p_entity->>'color', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid entity color'; end if;
  if trim(coalesce(p_entity->>'icon', '')) = '' then raise exception 'entity icon is required'; end if;

  if p_expected_version is null then
    insert into public.account_entities (id, user_id, name, color, icon, sort_order)
    values (
      entity_id, caller_id, trim(p_entity->>'name'), p_entity->>'color', trim(p_entity->>'icon'),
      greatest(coalesce((p_entity->>'sort_order')::integer, 0), 0)
    )
    returning * into saved_entity;
  else
    select * into saved_entity
    from public.account_entities
    where id = entity_id and user_id = caller_id and not archived
    for update;
    if not found then raise exception 'account entity is not available'; end if;
    if saved_entity.version <> p_expected_version then raise exception 'account entity was modified elsewhere'; end if;

    update public.account_entities set
      name = trim(p_entity->>'name'),
      color = p_entity->>'color',
      icon = trim(p_entity->>'icon'),
      sort_order = greatest(coalesce((p_entity->>'sort_order')::integer, sort_order), 0),
      version = version + 1
    where id = entity_id and user_id = caller_id
    returning * into saved_entity;
  end if;

  prior_result := jsonb_build_object('id', saved_entity.id, 'version', saved_entity.version);
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account-entity.upsert', prior_result);
  return prior_result;
end;
$$;

create or replace function public.archive_account_entity(
  p_operation_id uuid,
  p_entity_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_entity public.account_entities%rowtype;
  released_accounts integer := 0;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  if p_operation_id is null or p_entity_id is null then raise exception 'operation and entity are required'; end if;

  select result into prior_result
  from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'account-entity.archive';
  if found then return prior_result; end if;

  select * into saved_entity
  from public.account_entities
  where id = p_entity_id and user_id = caller_id and not archived
  for update;
  if not found then raise exception 'account entity is not available'; end if;
  if saved_entity.version <> p_expected_version then raise exception 'account entity was modified elsewhere'; end if;

  update public.accounts
  set entity_id = null
  where user_id = caller_id and entity_id = p_entity_id;
  get diagnostics released_accounts = row_count;

  update public.account_entities set
    archived = true,
    archived_at = now(),
    version = version + 1
  where id = p_entity_id and user_id = caller_id
  returning * into saved_entity;

  prior_result := jsonb_build_object(
    'id', saved_entity.id,
    'version', saved_entity.version,
    'releasedAccounts', released_accounts
  );
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account-entity.archive', prior_result);
  return prior_result;
end;
$$;

-- Extend the existing optimistic account update without changing its public
-- signature. The composite FK below is the database-level tenant boundary.
create or replace function public.update_account_v3(
  p_operation_id uuid,
  p_account jsonb,
  p_expected_version bigint,
  p_target_balance numeric default null,
  p_adjustment_date date default current_date,
  p_exchange_rate numeric default null,
  p_reference_exchange_rate numeric default null,
  p_reference_rate_source text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_account public.accounts%rowtype;
  previous_currency text;
  requested_currency text;
  requested_entity_id uuid := nullif(p_account->>'entity_id', '')::uuid;
  current_balance numeric;
  balance_delta numeric;
  movement_kind text;
  movement_id uuid;
  rate numeric;
  prior_result jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  select result into prior_result from public.mutation_receipts
  where operation_id = p_operation_id and user_id = caller_id and operation = 'account.update.v3';
  if found then return prior_result; end if;

  select * into saved_account from public.accounts
  where id = (p_account->>'id')::uuid and user_id = caller_id for update;
  if not found then raise exception 'account is not available'; end if;
  if saved_account.version <> p_expected_version then raise exception 'account was modified elsewhere'; end if;

  previous_currency := saved_account.currency_code;
  requested_currency := p_account->>'currency_code';
  if requested_currency not in ('COP', 'USD') then raise exception 'unsupported account currency'; end if;
  if trim(coalesce(p_account->>'name', '')) = '' then raise exception 'account name is required'; end if;
  if requested_entity_id is not null and not exists (
    select 1 from public.account_entities entity
    where entity.id = requested_entity_id and entity.user_id = caller_id and not entity.archived
  ) then raise exception 'account entity is not available'; end if;
  if requested_currency is distinct from previous_currency
     and exists (select 1 from public.transactions where user_id = caller_id and account_id = saved_account.id) then
    raise exception 'account currency cannot change after it has movements';
  end if;
  if requested_currency = 'USD' and requested_currency is distinct from previous_currency
     and (p_exchange_rate is null or p_exchange_rate <= 0) then
    raise exception 'exchange rate is required to change an account to USD';
  end if;

  update public.accounts set
    name = trim(p_account->>'name'), account_type = p_account->>'account_type',
    color = p_account->>'color', icon = nullif(p_account->>'icon', ''),
    entity_id = requested_entity_id,
    currency_code = requested_currency,
    expected_annual_return = nullif(p_account->>'expected_annual_return', '')::numeric,
    opening_exchange_rate = case
      when requested_currency = 'COP' then 1
      when requested_currency is distinct from previous_currency then p_exchange_rate
      else opening_exchange_rate
    end,
    opening_balance_date = case
      when requested_currency is distinct from previous_currency then coalesce(p_adjustment_date, opening_balance_date)
      else opening_balance_date
    end,
    version = version + 1
  where id = saved_account.id and user_id = caller_id
  returning * into saved_account;

  select saved_account.initial_balance + coalesce(sum(case
    when movement.kind in ('income', 'transfer_in', 'adjustment_in') then movement.amount
    else -movement.amount end), 0)
  into current_balance from public.transactions movement
  where movement.user_id = caller_id and movement.account_id = saved_account.id;

  if p_target_balance is not null and abs(p_target_balance - current_balance) >= 0.005 then
    balance_delta := p_target_balance - current_balance;
    movement_kind := case when balance_delta > 0 then 'adjustment_in' else 'adjustment_out' end;
    rate := case when saved_account.currency_code = 'COP' then 1 else p_exchange_rate end;
    if rate is null or rate <= 0 then raise exception 'exchange rate is required for a USD balance adjustment'; end if;
    movement_id := gen_random_uuid();
    insert into public.transactions (
      id, user_id, account_id, kind, amount, description, note, occurred_on,
      native_currency_code, base_currency_code, exchange_rate, exchange_rate_date,
      exchange_rate_source, reference_exchange_rate, reference_rate_source
    ) values (
      movement_id, caller_id, saved_account.id, movement_kind, abs(balance_delta),
      'Ajuste de saldo', 'Conciliación manual desde Cuentas', p_adjustment_date,
      saved_account.currency_code, 'COP', rate, p_adjustment_date,
      case when saved_account.currency_code = 'COP' then 'same_currency' else 'manual' end,
      p_reference_exchange_rate, p_reference_rate_source
    );
  end if;

  prior_result := jsonb_build_object('id', saved_account.id, 'version', saved_account.version, 'adjustmentId', movement_id);
  insert into public.mutation_receipts (operation_id, user_id, operation, result)
  values (p_operation_id, caller_id, 'account.update.v3', prior_result);
  return prior_result;
end;
$$;

revoke all on function public.upsert_account_entity(uuid, jsonb, bigint) from public, anon;
revoke all on function public.archive_account_entity(uuid, uuid, bigint) from public, anon;
grant execute on function public.upsert_account_entity(uuid, jsonb, bigint) to authenticated;
grant execute on function public.archive_account_entity(uuid, uuid, bigint) to authenticated;

comment on table public.account_entities is
  'Optional visual grouping for accounts. Entities never own balances, movements, budgets or exchange-rate snapshots.';
comment on column public.accounts.entity_id is
  'Optional grouping only. Money remains on the account row and its ledger postings.';
