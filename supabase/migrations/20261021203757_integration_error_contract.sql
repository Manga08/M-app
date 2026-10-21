-- Keep canonical optimistic-lock conflicts distinct from validation failures.
create or replace function public.integration_gateway_v1(p_gateway_key text,p_token text,p_mode text,p_payload jsonb default '{}')
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
    return jsonb_build_object('committed',false,'error',jsonb_build_object('status',case when code ~ '^PT[0-9]{3}$' then substring(code,3)::int when code='23505' or detail ~* '(modified elsewhere|version conflict|stale version)' then 409 when left(code,2) in ('42','08','53','57') then 503 else 422 end,
      'code',case when code in ('PT409','23505') or detail ~* '(modified elsewhere|version conflict|stale version)' then 'conflict' when code='PT403' then 'forbidden' when code='PT401' then 'unauthorized' else 'invalid_request' end,
      'message',case when code ~ '^PT[0-9]{3}$' then detail when code='23505' or detail ~* '(modified elsewhere|version conflict|stale version)' then 'Ese elemento cambió o su identificador ya existe. Consulta su versión y revisa el cambio antes de reintentar.' else 'Hay un dato o una regla financiera que impide guardar. Revisa los campos y vínculos del comando.' end));
  end;
end;
$$;
