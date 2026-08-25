-- Transactional smoke test for the pre-creation authorization boundary.
begin;

do $$
declare
  allowed_email text;
  allowed_event jsonb;
  denied_event jsonb;
  synthetic_user uuid := gen_random_uuid();
begin
  select email
    into allowed_email
  from private.access_allowlist
  where enabled
  order by created_at
  limit 1;

  if allowed_email is null then
    raise exception 'the auth allowlist needs one enabled address for this test';
  end if;

  allowed_event := jsonb_build_object(
    'user', jsonb_build_object(
      'email', allowed_email,
      'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google'))
    )
  );
  denied_event := jsonb_build_object(
    'user', jsonb_build_object(
      'email', 'not-invited@example.test',
      'app_metadata', jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google'))
    )
  );

  if private.before_user_created_allowlist(allowed_event) <> '{}'::jsonb then
    raise exception 'the hook rejected an enabled allowlist entry';
  end if;
  if private.before_user_created_allowlist(denied_event) -> 'error' ->> 'http_code' <> '403' then
    raise exception 'the hook did not reject an uninvited address';
  end if;
  if private.is_auth_user_creation_allowed(allowed_email, '{"provider":"email"}'::jsonb) then
    raise exception 'a non-Google provider passed the signup boundary';
  end if;

  begin
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (
      synthetic_user,
      'not-invited@example.test',
      '{"provider":"google","providers":["google"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );
    raise exception 'the auth.users trigger accepted an uninvited identity';
  exception
    when invalid_authorization_specification then null;
  end;

  if exists (select 1 from auth.users where id = synthetic_user) then
    raise exception 'the rejected synthetic identity was persisted';
  end if;
end;
$$;

rollback;
