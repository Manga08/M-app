-- Transactional launch contract for exposed tables, functions and tenant RLS.
-- It reads real tenant rows but leaves the database untouched.
begin;

do $$
declare
  failures text;
begin
  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into failures
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not relation.relrowsecurity;
  if failures is not null then raise exception 'public tables without RLS: %', failures; end if;

  select string_agg(format('public.%I', relation.relname), ', ' order by relation.relname)
  into failures
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not exists (select 1 from pg_policy policy where policy.polrelid = relation.oid);
  if failures is not null then raise exception 'public tables without policies: %', failures; end if;

  select string_agg(format('%I.%I:%s', grant_row.table_schema, grant_row.table_name, grant_row.privilege_type), ', ')
  into failures
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public' and grant_row.grantee = 'anon';
  if failures is not null then raise exception 'anon has public table privileges: %', failures; end if;

  select string_agg(function.oid::regprocedure::text, ', ' order by function.oid::regprocedure::text)
  into failures
  from pg_proc function
  join pg_namespace namespace on namespace.oid = function.pronamespace
  where namespace.nspname = 'public'
    and (
      has_function_privilege('anon', function.oid, 'execute')
      or has_function_privilege('public', function.oid, 'execute')
    );
  if failures is not null then raise exception 'anon/public can execute public functions: %', failures; end if;

  select string_agg(function.oid::regprocedure::text, ', ' order by function.oid::regprocedure::text)
  into failures
  from pg_proc function
  join pg_namespace namespace on namespace.oid = function.pronamespace
  where namespace.nspname = 'private'
    and (
      has_function_privilege('anon', function.oid, 'execute')
      or has_function_privilege('authenticated', function.oid, 'execute')
      or has_function_privilege('public', function.oid, 'execute')
    );
  if failures is not null then raise exception 'client roles can execute private functions: %', failures; end if;

  select string_agg(format('%I:%s', grant_row.table_name, grant_row.privilege_type), ', ')
  into failures
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'authenticated'
    and grant_row.table_name in (
      'liabilities', 'liability_terms', 'liability_rate_periods',
      'liability_obligations', 'liability_event_metadata',
      'liability_payment_rules', 'liability_payment_intents',
      'liability_payment_allocations', 'financial_targets',
      'financial_target_debt_details', 'credit_card_profiles',
      'credit_card_rate_periods', 'credit_card_statements',
      'credit_card_purchase_plans', 'credit_card_installments',
      'credit_card_payment_allocations'
    )
    and grant_row.privilege_type <> 'SELECT';
  if failures is not null then raise exception 'authenticated has direct liability writes: %', failures; end if;

  select string_agg(function.oid::regprocedure::text, ', ' order by function.oid::regprocedure::text)
  into failures
  from pg_proc function
  join pg_namespace namespace on namespace.oid = function.pronamespace
  where namespace.nspname in ('public', 'private')
    and (
      function.proconfig is null
      or not (function.proconfig @> array['search_path=""']::text[])
    );
  if failures is not null then raise exception 'functions without an empty search_path: %', failures; end if;

  select string_agg(function.oid::regprocedure::text, ', ' order by function.oid::regprocedure::text)
  into failures
  from pg_proc function
  join pg_namespace namespace on namespace.oid = function.pronamespace
  where namespace.nspname = 'public'
    and function.prosecdef
    and function.proname not in (
      'is_current_user_admin',
      'is_current_user_allowed',
      'list_authorized_users',
      'upsert_authorized_user',
      'archive_liability_v2',
      'get_liability_calendar_v2',
      'get_liability_overview_v2',
      'preview_liability_reconciliation_v2',
      'record_liability_payment_v2',
      'set_financial_target_status_v2',
      'create_credit_card_purchase_v1',
      'upsert_credit_card_v1',
      'upsert_financial_target_v2',
      'upsert_liability_obligation_v2',
      'upsert_liability_payment_intent_v2',
      'upsert_liability_payment_rule_v2',
      'upsert_liability_terms_v2',
      'upsert_liability_v2'
    );
  if failures is not null then raise exception 'unexpected public SECURITY DEFINER functions: %', failures; end if;
end;
$$;

create temporary table test_tenants (first_user uuid not null, second_user uuid not null) on commit drop;
grant select on test_tenants to authenticated;
insert into test_tenants (first_user, second_user)
select users[1], users[2]
from (
  select array_agg(auth_user.id order by auth_user.created_at) as users
  from auth.users auth_user
  join private.access_allowlist allowlist
    on allowlist.email = lower(trim(auth_user.email)) and allowlist.enabled
  where exists (
    select 1 from auth.identities identity
    where identity.user_id = auth_user.id and identity.provider = 'google'
  )
) selected
where array_length(users, 1) >= 2;

do $$
begin
  if not exists (select 1 from test_tenants) then
    raise exception 'tenant isolation needs two enabled Google users';
  end if;
end;
$$;

set local role authenticated;

do $$
declare
  first_user uuid := (select test_tenants.first_user from test_tenants);
  second_user uuid := (select test_tenants.second_user from test_tenants);
  unauthorized_user uuid := gen_random_uuid();
  visible_rows integer;
  changed_rows integer;
  second_account_id uuid;
  second_account_version bigint;
begin
  perform set_config('request.jwt.claim.sub', unauthorized_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', unauthorized_user, 'role', 'authenticated')::text, true);
  begin
    perform public.upsert_credit_card_v1(
      gen_random_uuid(),
      jsonb_build_object(
        'id', gen_random_uuid(), 'name', '__unauthorized_card__',
        'currency_code', 'COP', 'color', '#000000', 'opening_debt', 0,
        'opening_balance_date', current_date, 'opening_exchange_rate', 1
      ),
      jsonb_build_object(
        'network', 'other', 'credit_limit', 100, 'cutoff_day', 1,
        'due_day', 15, 'annual_fee', 0
      )
    );
    raise exception 'a non-allowlisted identity used the card write gateway';
  exception when others then
    if sqlerrm = 'a non-allowlisted identity used the card write gateway' then raise; end if;
    if position('private access is not enabled' in sqlerrm) = 0 then
      raise exception 'unexpected unauthorized card gateway error: %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', first_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_user, 'role', 'authenticated')::text, true);

  select count(*) into visible_rows from public.accounts where user_id = first_user;
  if visible_rows = 0 then raise exception 'first tenant cannot read its own account'; end if;
  select count(*) into visible_rows from public.accounts where user_id = second_user;
  if visible_rows <> 0 then raise exception 'first tenant can read second tenant accounts'; end if;
  select count(*) into visible_rows from public.account_entities where user_id = second_user;
  if visible_rows <> 0 then raise exception 'first tenant can read second tenant account entities'; end if;
  select count(*) into visible_rows from public.categories where user_id = second_user;
  if visible_rows <> 0 then raise exception 'first tenant can read second tenant categories'; end if;
  select count(*) into visible_rows from public.group_allocations where user_id = second_user;
  if visible_rows <> 0 then raise exception 'first tenant can read second tenant plan'; end if;
  select count(*) into visible_rows from public.profiles where id = second_user;
  if visible_rows <> 0 then raise exception 'first tenant can read second tenant profile'; end if;

  update public.accounts set name = name where user_id = second_user;
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then raise exception 'first tenant updated % second-tenant accounts', changed_rows; end if;

  begin
    insert into public.accounts (user_id, name, account_type, initial_balance, color)
    values (second_user, 'Cross-tenant write', 'cash', 0, '#000000');
    raise exception 'first tenant inserted an account owned by the second tenant';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', second_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', second_user, 'role', 'authenticated')::text, true);
  select id, version into second_account_id, second_account_version
  from public.accounts
  where user_id = second_user
  order by created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', first_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_user, 'role', 'authenticated')::text, true);
  begin
    perform public.archive_account_v1(gen_random_uuid(), second_account_id, second_account_version);
    raise exception 'first tenant archived a second-tenant account';
  exception
    when others then
      if sqlerrm = 'first tenant archived a second-tenant account' then raise; end if;
      if sqlerrm <> 'account is not available' then raise exception 'unexpected cross-tenant archive error: %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claim.sub', second_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', second_user, 'role', 'authenticated')::text, true);
  select count(*) into visible_rows from public.accounts where user_id = first_user;
  if visible_rows <> 0 then raise exception 'second tenant can read first tenant accounts'; end if;
end;
$$;

rollback;
