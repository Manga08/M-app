-- Store stable routine signatures, not regprocedure catalog columns, so
-- pg_upgrade can validate the integration registry on future PostgreSQL upgrades.
set local search_path = '';
alter table private.integration_operations alter column routine type text using routine::text;

create or replace function private.integration_call(p_action text,p_data jsonb,p_operation uuid)
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
  select routine::regprocedure::oid into routine_oid from private.integration_operations where action=p_action;
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

create or replace function private.integration_catalog() returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('action',o.action,'permission',o.permission,
    'arguments',(select coalesce(jsonb_agg(jsonb_build_object(
      'name',substr(p.proargnames[i+1],3),'type',format_type(p.proargtypes[i],null),
      'required',i<p.pronargs-p.pronargdefaults) order by i),'[]')
      from generate_series(0,p.pronargs-1) i where p.proargnames[i+1]<>'p_operation_id')) order by o.action),'[]')
  from private.integration_operations o join pg_proc p on p.oid=o.routine::regprocedure::oid;
$$;
