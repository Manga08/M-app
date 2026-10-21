-- Personal, scoped capabilities. Neither a Google session nor an integration
-- token ever receives a general-purpose privileged database credential.
create table private.integration_gateway_keys (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
create table private.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  permission text not null check (permission in ('read','write','full')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null,
  reset_generation bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
create index integration_connections_owner_idx on private.integration_connections(user_id, created_at desc);
create table private.integration_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  units integer not null default 0,
  requests integer not null default 0,
  bytes bigint not null default 0,
  primary key (user_id, window_start)
);
create table private.integration_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references private.integration_connections(id) on delete cascade,
  operation_id uuid not null,
  body_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (connection_id, operation_id)
);
create table private.integration_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references private.integration_connections(id) on delete cascade,
  operation text not null,
  command_count integer not null,
  created_at timestamptz not null default now()
);
create table private.integration_command_ids (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  connection_id uuid not null,
  operation_id uuid not null,
  primary key(user_id,command_id),
  foreign key(connection_id,operation_id) references private.integration_receipts(connection_id,operation_id) on delete cascade
);
alter table private.integration_command_ids enable row level security;
revoke all on private.integration_command_ids from public,anon,authenticated,service_role;
create index integration_activity_owner_idx on private.integration_activity(user_id, connection_id, created_at desc);
create index integration_activity_connection_idx on private.integration_activity(connection_id);
create index integration_activity_retention_idx on private.integration_activity(created_at);
create index integration_receipts_owner_idx on private.integration_receipts(user_id);
create index integration_receipts_retention_idx on private.integration_receipts(created_at);
create index integration_commands_receipt_idx on private.integration_command_ids(connection_id,operation_id);
create index integration_usage_retention_idx on private.integration_usage(window_start);
create table private.finance_revisions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  external_revision bigint not null default 0
);
insert into private.finance_revisions(user_id) select id from public.profiles;

alter table private.integration_gateway_keys enable row level security;
alter table private.integration_connections enable row level security;
alter table private.integration_usage enable row level security;
alter table private.integration_receipts enable row level security;
alter table private.integration_activity enable row level security;
alter table private.finance_revisions enable row level security;
revoke all on private.integration_gateway_keys, private.integration_connections,
  private.integration_usage, private.integration_receipts, private.integration_activity,
  private.finance_revisions from public, anon, authenticated, service_role;

create function private.integration_hash(value text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(value, 'UTF8')), 'hex');
$$;
revoke all on function private.integration_hash(text) from public, anon, authenticated;

create function public.get_financial_revision() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null or not public.is_current_user_allowed() then
    raise sqlstate 'PT403' using message = 'Tu acceso a Moneva no está habilitado.';
  end if;
  return coalesce((select jsonb_build_object('revision', revision::text, 'externalRevision', external_revision::text)
    from private.finance_revisions where user_id = actor), '{"revision":"0","externalRevision":"0"}'::jsonb);
end;
$$;
revoke all on function public.get_financial_revision() from public, anon;
grant execute on function public.get_financial_revision() to authenticated;

create function private.track_financial_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := coalesce((to_jsonb(new)->>'user_id')::uuid, (to_jsonb(old)->>'user_id')::uuid);
  expected text;
  external_version bigint;
  request_role text := current_setting('role', true);
begin
  insert into private.finance_revisions(user_id) values(actor) on conflict do nothing;
  select external_revision into external_version from private.finance_revisions where user_id=actor for update;
  if request_role = 'authenticated' and coalesce(current_setting('moneva.integration', true), '') <> '1' then
    expected := nullif(current_setting('request.headers', true),'')::jsonb ->> 'x-moneva-external-revision';
    if external_version > 0 and (expected is null or expected::bigint <> external_version) then
      raise sqlstate 'PT409' using message = 'Un asistente modificó tus datos. Conservamos tu cambio pendiente: sincroniza y revisa el conflicto antes de volver a guardarlo.';
    end if;
  end if;
  update private.finance_revisions set revision=revision+1 where user_id=actor;
  return coalesce(new, old);
end;
$$;
revoke all on function private.track_financial_revision() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['accounts','account_entities','transactions','categories','group_allocations',
    'budgets','monthly_budget_plans','recurring_rules','recurring_occurrences','financial_targets',
    'financial_target_entries','financial_target_debt_details','credit_card_profiles','credit_card_statements',
    'credit_card_purchase_plans','credit_card_installments','credit_card_rate_periods',
    'credit_card_payment_allocations','liabilities','liability_terms','liability_rate_periods',
    'liability_obligations','liability_event_metadata','liability_payment_rules','liability_payment_intents',
    'liability_payment_allocations','ledger_events','account_valuations','exchange_rates']
  loop
    execute format('create trigger integration_finance_revision before insert or update or delete on public.%I for each row execute function private.track_financial_revision()',t);
  end loop;
end $$;

create function public.manage_integration_connections(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  saved private.integration_connections%rowtype;
  result jsonb;
  auth_time numeric;
begin
  if actor is null or not public.is_current_user_allowed() then
    raise sqlstate 'PT403' using message='Tu acceso a Moneva no está habilitado.';
  end if;
  if p_action not in ('list','activity') then
    perform pg_advisory_xact_lock(hashtextextended('integration-connections:'||actor::text,0));
  end if;
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(c)-array['user_id','token_hash','reset_generation'] order by (c.revoked_at is null and c.expires_at>now()) desc,c.created_at desc),'[]')
      into result from (select * from private.integration_connections where user_id=actor
        order by (revoked_at is null and expires_at>now()) desc,created_at desc limit 60) c;
    return result;
  elsif p_action='activity' then
    select coalesce(jsonb_agg(to_jsonb(a)-'user_id' order by a.id desc),'[]') into result
      from (select * from private.integration_activity where user_id=actor
        and connection_id=(p_data->>'id')::uuid order by id desc limit 30) a;
    return result;
  elsif p_action='create' then
    select max((entry->>'timestamp')::numeric) into auth_time
      from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) entry;
    if auth_time is null or extract(epoch from now())-auth_time > 1800 then
      raise sqlstate 'PT401' using message='Vuelve a verificar tu cuenta de Google para crear una conexión.';
    end if;
    if (select count(*) from private.integration_connections where user_id=actor and revoked_at is null and expires_at>now()) >= 10 then
      raise sqlstate 'PT422' using message='Ya tienes diez conexiones activas. Revoca una antes de crear otra.';
    end if;
    if p_data->>'prefix' !~ '^mnv_[A-Za-z0-9_-]{8,16}$' then raise sqlstate 'PT422' using message='El token no es válido.'; end if;
    insert into private.integration_connections(user_id,name,permission,token_hash,token_prefix,expires_at,reset_generation)
    select actor,trim(p_data->>'name'),p_data->>'permission',p_data->>'hash',p_data->>'prefix',
      (p_data->>'expiresAt')::timestamptz,p.financial_reset_generation from public.profiles p where p.id=actor
    returning * into saved;
    return to_jsonb(saved)-array['user_id','token_hash','reset_generation'];
  elsif p_action='revoke' then
    update private.integration_connections set revoked_at=coalesce(revoked_at,now())
      where user_id=actor and id=(p_data->>'id')::uuid;
  elsif p_action='revoke_all' then
    update private.integration_connections set revoked_at=coalesce(revoked_at,now()) where user_id=actor;
  elsif p_action='rename' then
    update private.integration_connections set name=trim(p_data->>'name') where user_id=actor and id=(p_data->>'id')::uuid;
  else raise sqlstate 'PT422' using message='Esta acción no está disponible.';
  end if;
  return jsonb_build_object('saved',true);
end;
$$;
revoke all on function public.manage_integration_connections(text,jsonb) from public,anon;
grant execute on function public.manage_integration_connections(text,jsonb) to authenticated;

-- The registry is closed, owned by migrations, and never writable by clients.
create table private.integration_operations (
  action text primary key,
  routine regprocedure not null,
  permission text not null check (permission in ('read','write','full'))
);
alter table private.integration_operations enable row level security;
revoke all on private.integration_operations from public,anon,authenticated,service_role;

insert into private.integration_operations values
('summary','public.get_finance_snapshot(date)'::regprocedure,'read'),
('movements','public.get_transactions_page(integer,date,timestamp with time zone,uuid,text,text,date,date,uuid,uuid)'::regprocedure,'read'),
('budget','public.get_monthly_budget_plan(date)'::regprocedure,'read'),
('simulation.seed','public.get_plan_simulation_seed(date)'::regprocedure,'read'),
('liabilities','public.get_liability_overview_v2(boolean)'::regprocedure,'read'),
('calendar','public.get_liability_calendar_v2(date,date,integer)'::regprocedure,'read'),
('report','public.get_detailed_finance_report_v4(date,date,date[],text,text,text[],uuid[],uuid[],uuid[],text,date,date)'::regprocedure,'read'),
('movements.save','public.upsert_transactions_v3(uuid,jsonb)'::regprocedure,'write'),
('movements.delete','public.delete_transactions_v2(uuid,uuid,uuid)'::regprocedure,'full'),
('entity.save','public.upsert_account_entity(uuid,jsonb,bigint)'::regprocedure,'write'),
('entity.archive','public.archive_account_entity(uuid,uuid,bigint)'::regprocedure,'full'),
('account.update','public.update_account_v3(uuid,jsonb,bigint,numeric,date,numeric,numeric,text)'::regprocedure,'write'),
('account.archive','public.archive_account_v1(uuid,uuid,bigint)'::regprocedure,'full'),
('category.save','public.upsert_finance_category(uuid,text,text,text,text)'::regprocedure,'write'),
('category.archive','public.archive_finance_category(uuid)'::regprocedure,'full'),
('category.order','public.set_finance_category_order(text,jsonb)'::regprocedure,'write'),
('income-type.save','public.upsert_income_type(uuid,text,text,text)'::regprocedure,'write'),
('income-type.archive','public.archive_income_type(uuid)'::regprocedure,'full'),
('main-category.save','public.upsert_finance_group(uuid,text,text,text,text,integer)'::regprocedure,'write'),
('main-category.archive','public.archive_finance_group_atomic(text,jsonb,text,boolean)'::regprocedure,'full'),
('distribution.set','public.set_group_allocations(jsonb)'::regprocedure,'write'),
('budget.set','public.set_monthly_budget_plan(date,numeric,text,jsonb)'::regprocedure,'write'),
('target.save','public.upsert_financial_target_v2(uuid,jsonb,jsonb)'::regprocedure,'write'),
('target.status','public.set_financial_target_status_v2(uuid,uuid,text)'::regprocedure,'write'),
('card.save','public.upsert_credit_card_v1(uuid,jsonb,jsonb,bigint,bigint)'::regprocedure,'write'),
('card.purchase','public.create_credit_card_purchase_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure,'write'),
('liability.save','public.upsert_liability_v2(uuid,jsonb,jsonb,bigint,bigint)'::regprocedure,'write'),
('liability.terms','public.upsert_liability_terms_v2(uuid,jsonb,jsonb,bigint)'::regprocedure,'write'),
('liability.obligation','public.upsert_liability_obligation_v2(uuid,jsonb,jsonb,jsonb,boolean,bigint)'::regprocedure,'write'),
('liability.payment','public.record_liability_payment_v2(uuid,jsonb,jsonb)'::regprocedure,'write'),
('liability.payment-rule','public.upsert_liability_payment_rule_v2(uuid,jsonb,bigint)'::regprocedure,'write'),
('liability.payment-intent','public.upsert_liability_payment_intent_v2(uuid,jsonb,bigint)'::regprocedure,'write'),
('liability.archive','public.archive_liability_v2(uuid,uuid,bigint,bigint)'::regprocedure,'full');

-- Invokes only a migration-owned routine, with typed/named parameters. The
-- caller cannot choose a relation, routine, cast, SQL fragment or tenant.
create function private.integration_call(p_action text,p_data jsonb,p_operation uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
  routine_oid oid;
  proc pg_proc%rowtype;
  args text[] := array[]::text[];
  key text;
  typ text;
  result jsonb;
  i integer;
  data jsonb := coalesce(p_data,'{}'::jsonb);
begin
  select routine::oid into routine_oid from private.integration_operations where action=p_action;
  if routine_oid is null then raise sqlstate 'PT422' using message='La operación no existe.'; end if;
  select * into proc from pg_proc where oid=routine_oid;
  if jsonb_typeof(data)<>'object' or exists(select 1 from jsonb_object_keys(data) k where
    not exists(select 1 from unnest(proc.proargnames) n where substr(n,3)=k and n<>'p_operation_id')) then
    raise sqlstate 'PT422' using message='El comando contiene un campo desconocido o protegido.';
  end if;
  if array_position(proc.proargnames,'p_operation_id') is not null then data:=data||jsonb_build_object('operation_id',p_operation); end if;
  for i in 0..proc.pronargs-1 loop
    key:=substr(proc.proargnames[i+1],3);
    typ:=format_type(proc.proargtypes[i],null);
    if data ? key then
      if typ='jsonb' then
        args:=array_append(args,format('%I := ($1->%L)',proc.proargnames[i+1],key));
      elsif typ like '%[]' then
        args:=array_append(args,format('%I := case when $1->%L = ''null''::jsonb then null else array(select jsonb_array_elements_text($1->%L))::%s end',proc.proargnames[i+1],key,key,typ));
      else
        args:=array_append(args,format('%I := ($1->>%L)::%s',proc.proargnames[i+1],key,typ));
      end if;
    elsif i < proc.pronargs-proc.pronargdefaults then
      raise sqlstate 'PT422' using message='Falta el campo obligatorio: '||key;
    end if;
  end loop;
  execute format('select to_jsonb(public.%I(%s))',proc.proname,array_to_string(args,',')) into result using data;
  return coalesce(result,'null'::jsonb);
end;
$$;
revoke all on function private.integration_call(text,jsonb,uuid) from public,anon,authenticated;

create function private.integration_catalog() returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('action',o.action,'permission',o.permission,
    'arguments',(select coalesce(jsonb_agg(jsonb_build_object(
      'name',substr(p.proargnames[i+1],3),'type',format_type(p.proargtypes[i],null),
      'required',i<p.pronargs-p.pronargdefaults) order by i),'[]')
      from generate_series(0,p.pronargs-1) i where p.proargnames[i+1]<>'p_operation_id')) order by o.action),'[]')
  from private.integration_operations o join pg_proc p on p.oid=o.routine::oid;
$$;
revoke all on function private.integration_catalog() from public,anon,authenticated;

-- No file uploads or unbounded collection reads. Every direct read below has
-- an explicit owner predicate even though the dispatcher sets trusted claims.
create function private.integration_read(p_action text,p_data jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare actor uuid:=(select auth.uid()); result jsonb; today date; first_day date;
  relation_name text;
  key_name text:='id';
  page_limit integer:=least(100,greatest(1,coalesce((p_data->>'limit')::int,100)));
  after_id uuid:=nullif(p_data->>'after_id','')::uuid;
  more boolean;
  date_predicate text:='';
begin
  select (statement_timestamp() at time zone timezone)::date into today from public.profiles where id=actor;
  first_day:=date_trunc('month',today)::date;
  relation_name:=case p_action when 'entities' then 'account_entities' when 'categories' then 'categories'
    when 'distribution' then 'group_allocations' when 'targets' then 'financial_target_overview' when 'cards' then 'credit_card_profiles'
    when 'scheduled.rules' then 'recurring_rules' when 'scheduled.occurrences' then 'recurring_occurrences' else null end;
  if relation_name is not null then
    if p_action='cards' then key_name:='account_id'; end if;
    if p_action='scheduled.occurrences' then date_predicate:=' and scheduled_on between $4 and $5'; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)-''user_id'' order by t.%I),''[]'') from
      (select * from public.%I where user_id=$1 and ($2 is null or %I>$2)%s order by %I limit $3) t',key_name,relation_name,key_name,date_predicate,key_name)
      into result using actor,after_id,page_limit+1,coalesce((p_data->>'start_date')::date,today),coalesce((p_data->>'end_date')::date,today+31);
    more:=jsonb_array_length(result)>page_limit;
    if more then result:=result-page_limit; end if;
    return jsonb_build_object('items',result,'hasMore',more,'nextCursor',case when more then result->(page_limit-1)->>key_name else null end);
  end if;
  case p_action
  when 'profile' then
    select jsonb_build_object('timezone',timezone,'reportingCurrency','COP','today',today) into result from public.profiles where id=actor;
  when 'accounts' then
    with page as (select * from public.accounts where user_id=actor and (after_id is null or id>after_id) order by id limit page_limit+1),
    balances as (select account_id,sum(case when kind in ('income','transfer_in','adjustment_in') then amount else -amount end) amount from public.transactions where user_id=actor and account_id in (select id from page) group by account_id)
    select coalesce(jsonb_agg((to_jsonb(a)-'user_id')||jsonb_build_object('current_balance',a.initial_balance+coalesce(b.amount,0)) order by a.id),'[]') into result
      from page a left join balances b on b.account_id=a.id;
    more:=jsonb_array_length(result)>page_limit;
    if more then result:=result-page_limit; end if;
    return jsonb_build_object('items',result,'hasMore',more,'nextCursor',case when more then result->(page_limit-1)->>'id' else null end);
  when 'scheduled' then
    result:=jsonb_build_object('rules',private.integration_read('scheduled.rules',p_data),'occurrences',private.integration_read('scheduled.occurrences',p_data));
  else
    if p_action in ('summary','budget','simulation.seed') then p_data:=jsonb_build_object('month',coalesce((p_data->>'month')::date,first_day)); end if;
    if p_action='movements' then
      p_data:=coalesce(p_data,'{}')||jsonb_build_object('limit',least(100,greatest(1,coalesce((p_data->>'limit')::int,100))));
    end if;
    result:=private.integration_call(p_action,p_data,null);
  end case;
  return result;
end;
$$;
revoke all on function private.integration_read(text,jsonb) from public,anon,authenticated;

create function private.integration_owned_write(p_table text,p_data jsonb,p_create_only boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  row_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
  fields text[];
  updates text[];
  values_sql text[];
  field record;
  result jsonb;
  data jsonb:=p_data||jsonb_build_object('id',row_id,'user_id',actor);
begin
  if p_table not in ('accounts','recurring_rules','financial_target_entries') then raise sqlstate 'PT403' using message='La operación no está permitida.'; end if;
  if p_data ?| array['user_id','created_at','updated_at','version','archived_at'] then raise sqlstate 'PT422' using message='El comando contiene un campo protegido.'; end if;
  if exists(select 1 from jsonb_object_keys(data) k where not exists(select 1 from pg_attribute a where a.attrelid=('public.'||p_table)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped)) then raise sqlstate 'PT422' using message='El comando contiene un campo desconocido.'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_table) into result using row_id;
  if result is not null and (result->>'user_id')::uuid<>actor then raise sqlstate 'PT404' using message='No encontramos este elemento.'; end if;
  if result is not null and p_create_only then raise sqlstate 'PT409' using message='Este identificador ya existe. Usa la operación de edición.'; end if;
  if result is not null then
    data:=(result-array['user_id','created_at','updated_at','version','archived_at'])||data;
  end if;
  for field in select a.attname,format_type(a.atttypid,a.atttypmod) typ from pg_attribute a
    where a.attrelid=('public.'||p_table)::regclass and a.attnum>0 and not a.attisdropped and data ? a.attname order by a.attnum
  loop
    fields:=array_append(fields,format('%I',field.attname));
    values_sql:=array_append(values_sql,format('($1->>%L)::%s',field.attname,field.typ));
    if field.attname not in ('id','user_id') then updates:=array_append(updates,format('%I=excluded.%I',field.attname,field.attname)); end if;
  end loop;
  execute format('insert into public.%I (%s) values (%s) on conflict(id) do update set %s returning to_jsonb(%I.*)',
    p_table,array_to_string(fields,','),array_to_string(values_sql,','),array_to_string(updates,','),p_table) into result using data;
  return result-'user_id';
end;
$$;
revoke all on function private.integration_owned_write(text,jsonb,boolean) from public,anon,authenticated;

create function private.integration_command(p_action text,p_data jsonb,p_operation uuid)
returns jsonb language plpgsql set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  source_account public.accounts%rowtype;
  destination public.accounts%rowtype;
  amount numeric;
  received numeric;
  rate numeric;
  base numeric;
  group_id uuid;
  rows jsonb;
  common jsonb;
  result jsonb;
  kind text;
begin
  if p_operation is null then raise sqlstate 'PT422' using message='Cada comando necesita un id UUID estable.'; end if;
  case p_action
  when 'account.create' then
    if p_data->>'account_type' in ('credit','loan') then raise sqlstate 'PT422' using message='Crea tarjetas o deudas con su comando especializado.'; end if;
    if p_data->>'currency_code'='USD' and coalesce((p_data->>'opening_exchange_rate')::numeric,0)<=0 then
      raise sqlstate 'PT422' using message='Indica la tasa COP por USD del saldo inicial.';
    end if;
    return private.integration_owned_write('accounts',jsonb_build_object('opening_balance_date',(now() at time zone (select timezone from public.profiles where id=actor))::date)||p_data,true);
  when 'scheduled.save' then
    if p_data ?| array['next_run_on','active','suspended_by_target'] then raise sqlstate 'PT422' using message='El comando contiene campos de programación internos.'; end if;
    if p_data->>'status'='archived' then
      raise sqlstate 'PT422' using message='Para archivar utiliza scheduled.archive.';
    end if;
    if p_data ? 'starts_on' then p_data:=jsonb_build_object('next_run_on',p_data->>'starts_on')||p_data; end if;
    if p_data ? 'status' then p_data:=p_data||jsonb_build_object('active',p_data->>'status'='active'); end if;
    return private.integration_owned_write('recurring_rules',p_data);
  when 'scheduled.archive' then
    update public.recurring_rules set status='archived',active=false,archived_at=now() where user_id=actor and id=(p_data->>'id')::uuid returning to_jsonb(recurring_rules.*)-'user_id' into result;
    if not found then raise sqlstate 'PT404' using message='No encontramos esta programación.'; end if;
    return result;
  when 'scheduled.occurrence' then
    if p_data->>'status' not in ('planned','skipped','cancelled') then raise sqlstate 'PT422' using message='El estado de la ocurrencia no es válido.'; end if;
    update public.recurring_occurrences set status=p_data->>'status',failure_reason=null where user_id=actor and id=(p_data->>'id')::uuid and status<>'posted' returning to_jsonb(recurring_occurrences.*)-'user_id' into result;
    if not found then raise sqlstate 'PT404' using message='La ocurrencia no está disponible para este cambio.'; end if;
    return result;
  when 'target-entry.save' then
    return private.integration_owned_write('financial_target_entries',p_data);
  when 'target-entry.delete' then
    delete from public.financial_target_entries where user_id=actor and id=(p_data->>'id')::uuid returning jsonb_build_object('id',id,'deleted',true) into result;
    if not found then raise sqlstate 'PT404' using message='No encontramos este aporte.'; end if;
    return result;
  when 'movement.record' then
    select * into source_account from public.accounts where user_id=actor and id=(p_data->>'account_id')::uuid and not archived;
    if not found then raise sqlstate 'PT422' using message='Selecciona una cuenta activa propia.'; end if;
    amount:=(p_data->>'amount')::numeric; kind:=p_data->>'kind';
    if amount is null or amount<=0 or amount>90000000000000 or amount<>round(amount,case when source_account.currency_code='USD' then 2 else 0 end) then raise sqlstate 'PT422' using message='El monto o su precisión no son válidos.'; end if;
    rate:=case when source_account.currency_code='COP' then 1 else (p_data->>'exchange_rate')::numeric end;
    if rate is null or rate<=0 then raise sqlstate 'PT422' using message='Indica la tasa histórica COP por USD.'; end if;
    if nullif(trim(p_data->>'description'),'') is null or p_data->>'occurred_on' is null then raise sqlstate 'PT422' using message='Indica descripción y fecha del movimiento.'; end if;
    common:=jsonb_build_object('description',p_data->>'description','occurred_on',(p_data->>'occurred_on')::date,
      'merchant',p_data->>'merchant','note',p_data->>'note','icon',p_data->>'icon',
      'base_currency_code','COP','exchange_rate_date',coalesce(p_data->>'exchange_rate_date',p_data->>'occurred_on'),
      'exchange_rate_source',case when source_account.currency_code='COP' then 'same_currency' else 'manual' end);
    base:=round(amount*rate,2);
    if kind='transfer' then
      select * into destination from public.accounts where user_id=actor and id=(p_data->>'destination_account_id')::uuid and not archived and id<>source_account.id;
      if not found then raise sqlstate 'PT422' using message='Selecciona otra cuenta propia activa como destino.'; end if;
      received:=case when destination.currency_code=source_account.currency_code then amount else (p_data->>'destination_amount')::numeric end;
      if received is null or received<=0 or received<>round(received,case when destination.currency_code='USD' then 2 else 0 end) then raise sqlstate 'PT422' using message='Indica el monto recibido en la moneda del destino.'; end if;
      if source_account.currency_code<>destination.currency_code and (
        coalesce((p_data->>'exchange_rate')::numeric,0)<=0 or
        abs((p_data->>'exchange_rate')::numeric * case when source_account.currency_code='USD' then amount else received end - case when source_account.currency_code='COP' then amount else received end)>1
      ) then raise sqlstate 'PT422' using message='La tasa y el monto recibido no coinciden. Registra cualquier comisión como gasto separado.'; end if;
      if source_account.currency_code='USD' and destination.currency_code='COP' then base:=received; rate:=received/amount; end if;
      group_id:=gen_random_uuid();
      rows:=jsonb_build_array(
        common||jsonb_build_object('id',p_operation,'account_id',source_account.id,'kind','transfer_out','amount',amount,'native_currency_code',source_account.currency_code,'base_amount',base,'exchange_rate',rate,'transfer_group_id',group_id),
        common||jsonb_build_object('id',gen_random_uuid(),'account_id',destination.id,'kind','transfer_in','amount',received,'native_currency_code',destination.currency_code,'base_amount',base,'exchange_rate',base/received,'exchange_rate_source',case when destination.currency_code='COP' then 'same_currency' else 'manual' end,'transfer_group_id',group_id));
    elsif kind in ('income','expense') then
      if not exists(select 1 from public.categories where user_id=actor and id=(p_data->>'category_id')::uuid and not archived and transaction_kind=kind) then raise sqlstate 'PT422' using message='Selecciona una subcategoría activa del tipo correcto.'; end if;
      rows:=jsonb_build_array(common||jsonb_build_object('id',p_operation,'account_id',source_account.id,'category_id',p_data->>'category_id','kind',kind,'amount',amount,'native_currency_code',source_account.currency_code,'base_amount',base,'exchange_rate',rate));
    else raise sqlstate 'PT422' using message='El tipo de movimiento no es válido.';
    end if;
    perform public.upsert_transactions_v3(p_operation,rows);
    return jsonb_build_object('movements',rows);
  else
    if p_action='movements.save' and (jsonb_typeof(p_data->'transactions')<>'array' or jsonb_array_length(p_data->'transactions')>100) then raise sqlstate 'PT422' using message='Guarda hasta cien apuntes por comando.'; end if;
    return private.integration_call(p_action,p_data,p_operation);
  end case;
end;
$$;
revoke all on function private.integration_command(text,jsonb,uuid) from public,anon,authenticated;

create function private.integration_execute(p_gateway_key text,p_token text,p_mode text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  c private.integration_connections%rowtype;
  actor uuid;
  claims_before text:=current_setting('request.jwt.claims',true);
  sub_before text:=current_setting('request.jwt.claim.sub',true);
  active_before text:=current_setting('moneva.integration',true);
  body_hash text;
  prior private.integration_receipts%rowtype;
  rev bigint;
  units_used integer;
  request_count integer;
  cost integer:=1;
  commands jsonb;
  entry jsonb;
  selected_action text;
  required text;
  result jsonb:='{}';
  catalog jsonb;
  op uuid;
  command_index integer:=0;
  is_write boolean:=p_mode='commands';
begin
  if length(p_gateway_key)<32 or not exists(select 1 from private.integration_gateway_keys where key_hash=private.integration_hash(p_gateway_key)) then
    raise sqlstate 'PT401' using message='Conexión no autorizada.';
  end if;
  -- The server sends only the token digest, never the raw personal credential.
  if p_token !~ '^[a-f0-9]{64}$' then raise sqlstate 'PT401' using message='El token no es válido.'; end if;
  if octet_length(p_payload::text)>262144 then raise sqlstate 'PT413' using message='La solicitud supera el tamaño permitido.'; end if;
  select * into c from private.integration_connections where token_hash=p_token for update;
  if not found or c.revoked_at is not null or c.expires_at<=statement_timestamp() then
    raise sqlstate 'PT401' using message='El token caducó, fue revocado o no es válido.';
  end if;
  actor:=c.user_id;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('moneva.integration','1',true);
  if not public.is_current_user_allowed() or not exists(select 1 from public.profiles where id=actor and financial_reset_generation=c.reset_generation) then
    raise sqlstate 'PT403' using message='El acceso fue deshabilitado o la cuenta fue reiniciada.';
  end if;
  insert into private.finance_revisions(user_id) values(actor) on conflict do nothing;
  select revision into rev from private.finance_revisions where user_id=actor for update;

  if p_mode='commands' then
    if c.permission='read' then raise sqlstate 'PT403' using message='Esta conexión es de solo lectura.'; end if;
    commands:=p_payload->'commands'; op:=(p_payload->>'operationId')::uuid;
    if op is null or jsonb_typeof(commands)<>'array' or jsonb_array_length(commands) not between 1 and 50 then
      raise sqlstate 'PT422' using message='Incluye operationId y entre uno y cincuenta comandos.';
    end if;
    body_hash:=private.integration_hash(p_payload::text);
    select * into prior from private.integration_receipts where connection_id=c.id and operation_id=op;
    if found then
      if prior.body_hash<>body_hash then raise sqlstate 'PT409' using message='Este identificador ya se usó con otro contenido.'; end if;
      perform set_config('request.jwt.claim.sub',coalesce(sub_before,''),true);
      perform set_config('request.jwt.claims',coalesce(claims_before,'{}'),true);
      perform set_config('moneva.integration',coalesce(active_before,''),true);
      return private.integration_json(prior.result||jsonb_build_object('replayed',true));
    end if;
    if p_payload->>'expectedRevision' is null or (p_payload->>'expectedRevision')::bigint<>rev then
      raise sqlstate 'PT409' using message='Tus datos cambiaron. Consulta contexto y revisa el cambio antes de reintentarlo.';
    end if;
    cost:=jsonb_array_length(commands)*5;
  elsif p_mode='query' then
    if jsonb_typeof(p_payload->'queries')<>'array' or jsonb_array_length(p_payload->'queries') not between 1 and 10 then
      raise sqlstate 'PT422' using message='Incluye entre una y diez consultas.';
    end if;
    cost:=jsonb_array_length(p_payload->'queries')*2;
  end if;
  catalog:=private.integration_catalog()||private.integration_extra_catalog();
  select coalesce(jsonb_agg(value),'[]') into catalog from jsonb_array_elements(catalog)
    where c.permission='full' or value->>'permission'='read' or (c.permission='write' and value->>'permission'='write');
  if p_mode='catalog' or p_mode='capabilities' then
    result:=jsonb_build_object('operations',catalog);
  elsif p_mode='context' then
    commands:=coalesce(p_payload->'include','["profile","summary","accounts","entities","categories","distribution","budget","targets","scheduled","liabilities","cards"]');
    if jsonb_typeof(commands)<>'array' or jsonb_array_length(commands)>12 then raise sqlstate 'PT422' using message='Selecciona hasta doce bloques de contexto.'; end if;
    for entry in select value from jsonb_array_elements(commands) loop
      selected_action:=entry#>>'{}';
      if selected_action not in ('profile','summary','accounts','entities','categories','distribution','budget','targets','scheduled','liabilities','cards') then raise sqlstate 'PT422' using message='El bloque de contexto no existe.'; end if;
      result:=result||jsonb_build_object(selected_action,private.integration_read(selected_action,coalesce(p_payload->'filters','{}')));
    end loop;
    result:=jsonb_build_object('data',result,'operations',catalog);
  elsif p_mode='query' then
    result:='[]';
    for entry in select value from jsonb_array_elements(p_payload->'queries') loop
      selected_action:=entry->>'action';
      if selected_action not in ('profile','accounts','entities','categories','distribution','targets','scheduled','scheduled.rules','scheduled.occurrences','cards') and not exists(select 1 from private.integration_operations where integration_operations.action=selected_action and permission='read') then
        raise sqlstate 'PT403' using message='Esta operación no es de consulta.';
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('id',entry->>'id','data',private.integration_read(selected_action,coalesce(entry->'data','{}'))));
    end loop;
    result:=jsonb_build_object('results',result);
  elsif p_mode='commands' then
    if exists(select 1 from jsonb_array_elements(commands) e join private.integration_command_ids used
      on used.user_id=actor and used.command_id=(e->>'id')::uuid)
      or (select count(distinct e->>'id') from jsonb_array_elements(commands) e)<>jsonb_array_length(commands) then
      raise sqlstate 'PT409' using message='Un id de comando ya se utilizó. Recupera el recibo y reintenta el mismo lote original.';
    end if;
    result:='[]';
    for entry in select value from jsonb_array_elements(commands) loop
      command_index:=command_index+1; selected_action:=entry->>'action';
      select permission into required from private.integration_operations where integration_operations.action=selected_action;
      if required is null then required:=case when selected_action in ('account.create','scheduled.save','scheduled.occurrence','target-entry.save','movement.record') then 'write' when selected_action in ('scheduled.archive','target-entry.delete') then 'full' else null end; end if;
      if required is null or required='read' then raise sqlstate 'PT422' using message='El comando no existe.'; end if;
      if (required='full' or jsonb_path_exists(entry->'data','$.** ? (@.status == "archived" || @.archived == true)')) and c.permission<>'full' then
        raise sqlstate 'PT403' using message='Para eliminar o archivar se necesita acceso total.';
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('id',entry->>'id','data',private.integration_command(selected_action,coalesce(entry->'data','{}'),(entry->>'id')::uuid)));
    end loop;
    set constraints all immediate;
    update private.finance_revisions set external_revision=external_revision+1 where user_id=actor returning revision into rev;
    result:=jsonb_build_object('committed',true,'results',result,'revision',rev::text);
    if octet_length(result::text)>65536 then raise sqlstate 'PT413' using message='El recibo supera 64 KiB. Divide los comandos en lotes más pequeños.'; end if;
    insert into private.integration_receipts values(actor,c.id,op,body_hash,result,now());
    insert into private.integration_command_ids(user_id,command_id,connection_id,operation_id)
      select actor,(e->>'id')::uuid,c.id,op from jsonb_array_elements(commands) e;
    insert into private.integration_activity(user_id,connection_id,operation,command_count) values(actor,c.id,'commands',command_index);
  elsif p_mode='operation' then
    select r.result into result from private.integration_receipts r where r.connection_id=c.id and r.operation_id=(p_payload->>'id')::uuid;
    if not found then raise sqlstate 'PT404' using message='No encontramos esta operación.'; end if;
  else raise sqlstate 'PT422' using message='La operación no existe.';
  end if;
  if octet_length(result::text)>1048576 then raise sqlstate 'PT413' using message='El resultado es demasiado grande. Reduce los filtros o pagina el detalle.'; end if;
  if c.last_used_at is null or c.last_used_at<now()-interval '5 minutes' then update private.integration_connections set last_used_at=now() where id=c.id; end if;
  result:=result||jsonb_build_object('revision',rev::text,'connection',jsonb_build_object('id',c.id,'name',c.name,'permission',c.permission,'expiresAt',c.expires_at),
    'asOf',statement_timestamp(),'timezone',(select timezone from public.profiles where id=actor));
  perform set_config('request.jwt.claim.sub',coalesce(sub_before,''),true);
  perform set_config('request.jwt.claims',coalesce(claims_before,'{}'),true);
  perform set_config('moneva.integration',coalesce(active_before,''),true);
  return private.integration_json(result);
end;
$$;
revoke all on function private.integration_execute(text,text,text,jsonb) from public,anon,authenticated,service_role;

-- PostgreSQL serializes decimals before they cross JavaScript's JSON parser.
-- Returning numeric leaves as strings preserves large native/base amounts.
create function private.integration_json(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb;
begin
  case jsonb_typeof(value)
  when 'number' then return to_jsonb(value#>>'{}');
  when 'array' then select coalesce(jsonb_agg(private.integration_json(v)),'[]') into result from jsonb_array_elements(value) v; return result;
  when 'object' then select coalesce(jsonb_object_agg(k,private.integration_json(v)),'{}') into result from jsonb_each(value) e(k,v); return result;
  else return value;
  end case;
end;
$$;
revoke all on function private.integration_json(jsonb) from public,anon,authenticated;

create function private.integration_extra_catalog() returns jsonb
language plpgsql stable set search_path='' as $$
declare result jsonb:='[]'; spec record;
begin
  for spec in select * from (values
    ('account.create','accounts','write'),('scheduled.save','recurring_rules','write'),('target-entry.save','financial_target_entries','write')
  ) t(action,relation,permission) loop
    result:=result||jsonb_build_array(jsonb_build_object('action',spec.action,'permission',spec.permission,'arguments',
      (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull and d.adbin is null and a.attname<>'id') order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=('public.'||spec.relation)::regclass and a.attnum>0 and not a.attisdropped and a.attname not in ('user_id','created_at','updated_at','version','archived_at','next_run_on','active','suspended_by_target'))));
  end loop;
  for spec in select * from (values
    ('profile','read'),('accounts','read'),('entities','read'),('categories','read'),('distribution','read'),('targets','read'),('scheduled','read'),('scheduled.rules','read'),('scheduled.occurrences','read'),('cards','read')
  ) t(action,permission) loop
    result:=result||jsonb_build_array(jsonb_build_object('action',spec.action,'permission',spec.permission,'arguments',case when spec.action='profile' then '[]'::jsonb else
      '[{"name":"limit","type":"integer","required":false},{"name":"after_id","type":"uuid","required":false}]'::jsonb || case when spec.action in ('scheduled','scheduled.occurrences') then
        '[{"name":"start_date","type":"date","required":false},{"name":"end_date","type":"date","required":false}]'::jsonb else '[]'::jsonb end end));
  end loop;
  return result||'[
    {"action":"movement.record","permission":"write","description":"Registra un ingreso, gasto o transferencia en las cuentas reales. Para monedas diferentes indica monto recibido y tasa histórica COP por USD.","arguments":[
      {"name":"kind","type":"text","required":true},{"name":"account_id","type":"uuid","required":true},
      {"name":"category_id","type":"uuid","required":false},{"name":"amount","type":"numeric","required":true},
      {"name":"description","type":"text","required":true},{"name":"occurred_on","type":"date","required":true},
      {"name":"destination_account_id","type":"uuid","required":false},{"name":"destination_amount","type":"numeric","required":false},
      {"name":"exchange_rate","type":"numeric","required":false},{"name":"exchange_rate_date","type":"date","required":false},
      {"name":"merchant","type":"text","required":false},{"name":"note","type":"text","required":false},{"name":"icon","type":"text","required":false}]},
    {"action":"scheduled.occurrence","permission":"write","arguments":[{"name":"id","type":"uuid","required":true},{"name":"status","type":"text","required":true}]},
    {"action":"scheduled.archive","permission":"full","arguments":[{"name":"id","type":"uuid","required":true}]},
    {"action":"target-entry.delete","permission":"full","arguments":[{"name":"id","type":"uuid","required":true}]}
  ]'::jsonb;
end;
$$;
revoke all on function private.integration_extra_catalog() from public,anon,authenticated;

create function public.integration_schema_v1(p_gateway_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if length(p_gateway_key)<32 or not exists(select 1 from private.integration_gateway_keys where key_hash=private.integration_hash(p_gateway_key)) then
    raise sqlstate 'PT401' using message='Conexión no autorizada.';
  end if;
  return private.integration_catalog()||private.integration_extra_catalog();
end;
$$;
revoke all on function public.integration_schema_v1(text) from public,authenticated;
grant execute on function public.integration_schema_v1(text) to anon;

-- Bounded operational retention. Never deletes the canonical financial audit.
create function private.cleanup_integration_metadata() returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from private.integration_usage where window_start<now()-interval '2 days';
  delete from private.integration_activity where created_at<now()-interval '30 days';
  delete from private.integration_receipts where created_at<now()-interval '90 days';
end;
$$;
revoke all on function private.cleanup_integration_metadata() from public,anon,authenticated,service_role;
select cron.schedule('moneva-integration-retention','13 4 * * *','select private.cleanup_integration_metadata()');

-- Keep metering outside the domain subtransaction. Failed validations and
-- previews still consume the same shared quota; financial effects stay atomic.
create function public.integration_gateway_v1(p_gateway_key text,p_token text,p_mode text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare
  c private.integration_connections%rowtype;
  cost integer:=1;
  usage_row private.integration_usage%rowtype;
  daily_requests integer;
  daily_units integer;
  daily_bytes bigint;
  result jsonb;
  code text;
  detail text;
begin
  if not exists(select 1 from private.integration_gateway_keys where key_hash=private.integration_hash(p_gateway_key)) then
    raise sqlstate 'PT401' using message='Conexión no autorizada.';
  end if;
  select * into c from private.integration_connections where token_hash=p_token for update;
  if not found or c.revoked_at is not null or c.expires_at<=statement_timestamp() then
    raise sqlstate 'PT401' using message='El token caducó, fue revocado o no es válido.';
  end if;
  if p_mode in ('commands','preview') and jsonb_typeof(p_payload->'commands')='array' then cost:=least(251,jsonb_array_length(p_payload->'commands')*5);
  elsif p_mode='query' and jsonb_typeof(p_payload->'queries')='array' then cost:=least(21,jsonb_array_length(p_payload->'queries')*2);
  elsif p_mode='context' then cost:=12;
  end if;
  cost:=cost+octet_length(p_payload::text)/1024;
  -- One owner lock serializes quota decisions across tokens and concurrent calls.
  perform pg_advisory_xact_lock(hashtextextended('integration-usage:'||c.user_id::text,0));
  insert into private.integration_usage(user_id,window_start,units,requests)
  values(c.user_id,date_trunc('minute',statement_timestamp()),greatest(1,cost),1)
  on conflict(user_id,window_start) do update set units=private.integration_usage.units+excluded.units,requests=private.integration_usage.requests+1
  returning * into usage_row;
  select coalesce(sum(requests),0),coalesce(sum(units),0),coalesce(sum(bytes),0) into daily_requests,daily_units,daily_bytes
    from private.integration_usage where user_id=c.user_id and window_start>=date_trunc('day',statement_timestamp());
  if usage_row.requests>120 or usage_row.units>600 or daily_requests>2000 or daily_units>10000 or usage_row.bytes>=5242880 or daily_bytes>=20971520 then
    return jsonb_build_object('error',jsonb_build_object('status',429,'code','rate_limited','message','Alcanzaste la cuota temporal de conexiones. Espera antes de reintentar.',
      'retryAfter',case when daily_requests>2000 or daily_units>10000 or daily_bytes>=20971520 then greatest(60,ceil(extract(epoch from date_trunc('day',statement_timestamp())+interval '1 day'-statement_timestamp()))) else 60 end));
  end if;
  begin
    if p_mode='preview' then
      begin
        result:=private.integration_execute(p_gateway_key,p_token,'commands',p_payload);
        raise sqlstate 'MNV01' using message='preview rollback';
      exception when sqlstate 'MNV01' then null;
      end;
      result:=result||jsonb_build_object('committed',false,'preview',true,'revision',p_payload->>'expectedRevision');
    else
      result:=private.integration_execute(p_gateway_key,p_token,p_mode,p_payload);
    end if;
    if usage_row.bytes+octet_length(result::text)>5242880 or daily_bytes+octet_length(result::text)>20971520 then
      raise sqlstate 'PT429' using message='Alcanzaste la cuota de transferencia de conexiones. Reduce el detalle o espera antes de reintentar.';
    end if;
    update private.integration_usage set bytes=bytes+octet_length(result::text) where user_id=c.user_id and window_start=usage_row.window_start;
    return result;
  exception when others then
    get stacked diagnostics code=returned_sqlstate,detail=message_text;
    return jsonb_build_object('committed',false,'error',jsonb_build_object('status',case when code ~ '^PT[0-9]{3}$' then substring(code,3)::int when code like '42%' then 503 else 422 end,
      'code',case when code='PT409' then 'conflict' when code='PT403' then 'forbidden' when code='PT401' then 'unauthorized' else 'invalid_request' end,
      'message',case when code ~ '^PT[0-9]{3}$' then detail else 'Hay un dato o una regla financiera que impide guardar. Revisa los campos y vínculos del comando.' end));
  end;
end;
$$;
revoke all on function public.integration_gateway_v1(text,text,text,jsonb) from public,authenticated,service_role;
grant execute on function public.integration_gateway_v1(text,text,text,jsonb) to anon;

create function public.integration_preview_v1(p_gateway_key text,p_token text,p_payload jsonb)
returns jsonb language sql security definer set search_path='' set statement_timeout='8s' as $$
  select public.integration_gateway_v1(p_gateway_key,p_token,'preview',p_payload);
$$;
revoke all on function public.integration_preview_v1(text,text,jsonb) from public,authenticated,service_role;
grant execute on function public.integration_preview_v1(text,text,jsonb) to anon;
