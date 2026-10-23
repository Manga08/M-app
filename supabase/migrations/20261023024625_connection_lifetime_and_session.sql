-- A valid, allowlisted session is enough to manage personal assistant access.
-- NULL explicitly means no expiration; existing dated credentials are unchanged.
alter table private.integration_connections alter column expires_at drop not null;
alter table private.integration_connections drop constraint integration_connections_check;
alter table private.integration_connections add constraint integration_connections_expiry_check
  check (expires_at is null or (isfinite(expires_at) and expires_at > created_at
    and expires_at <= created_at + interval '90 days'));

create or replace function public.manage_integration_connections(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  saved private.integration_connections%rowtype;
  result jsonb;
begin
  if actor is null or not public.is_current_user_allowed() then
    raise sqlstate 'PT403' using message='Tu acceso a Moneva no está habilitado.';
  end if;
  if p_action not in ('list','activity') then
    perform pg_advisory_xact_lock(hashtextextended('integration-connections:'||actor::text,0));
  end if;
  if p_action='list' then
    select coalesce(jsonb_agg(to_jsonb(c)-array['user_id','token_hash','reset_generation']
      order by (c.revoked_at is null and (c.expires_at is null or c.expires_at>now())) desc,c.created_at desc),'[]')
      into result from (select * from private.integration_connections where user_id=actor
        order by (revoked_at is null and (expires_at is null or expires_at>now())) desc,created_at desc limit 60) c;
    return result;
  elsif p_action='activity' then
    select coalesce(jsonb_agg(to_jsonb(a)-'user_id' order by a.id desc),'[]') into result
      from (select * from private.integration_activity where user_id=actor
        and connection_id=(p_data->>'id')::uuid order by id desc limit 30) a;
    return result;
  elsif p_action='create' then
    -- Do not infer permanence from an omitted/malformed date in direct RPC calls.
    if not (p_data ? 'expiresAt') or (jsonb_typeof(p_data->'expiresAt') not in ('string','null')) then
      raise sqlstate 'PT422' using message='Elige un vencimiento o selecciona Sin vencimiento.';
    end if;
    if (select count(*) from private.integration_connections where user_id=actor
      and revoked_at is null and (expires_at is null or expires_at>now())) >= 10 then
      raise sqlstate 'PT422' using message='Ya tienes diez conexiones activas. Revoca una antes de crear otra.';
    end if;
    if p_data->>'prefix' !~ '^mnv_[A-Za-z0-9_-]{8,16}$' then
      raise sqlstate 'PT422' using message='El token no es válido.';
    end if;
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
