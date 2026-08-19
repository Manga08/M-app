-- Serialize access administration so concurrent role changes can never
-- remove the last enabled administrator.
create or replace function public.upsert_authorized_user(
  p_email text,
  p_access_role text default 'member',
  p_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  caller_email text;
  current_role text;
  existing_user_id uuid;
  existing_user_metadata jsonb;
begin
  if not (select public.is_current_user_admin()) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if char_length(clean_email) not between 3 and 320 or position('@' in clean_email) <= 1 then
    raise exception 'invalid email address';
  end if;
  if p_access_role not in ('admin', 'member') then raise exception 'invalid access role'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moneva-access-admin', 0));

  -- Authorization and the last-admin invariant are both checked again inside
  -- the serialized section; the caller may have changed while waiting.
  if not (select public.is_current_user_admin()) then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  select lower(trim(user_record.email)) into caller_email
  from auth.users user_record
  where user_record.id = (select auth.uid());

  select allowed.access_role into current_role
  from private.access_allowlist allowed
  where allowed.email = clean_email;

  if clean_email = caller_email and (not p_enabled or p_access_role <> 'admin') then
    raise exception 'the current administrator cannot disable or demote their own access';
  end if;
  if current_role = 'admin'
     and (not p_enabled or p_access_role <> 'admin')
     and (select count(*) from private.access_allowlist where enabled and access_role = 'admin') <= 1 then
    raise exception 'at least one enabled administrator is required';
  end if;

  insert into private.access_allowlist (email, enabled, access_role)
  values (clean_email, p_enabled, p_access_role)
  on conflict (email) do update
    set enabled = excluded.enabled,
        access_role = excluded.access_role;

  if p_enabled then
    select user_record.id, user_record.raw_user_meta_data
    into existing_user_id, existing_user_metadata
    from auth.users user_record
    where lower(trim(user_record.email)) = clean_email
      and exists (
        select 1
        from auth.identities identity_record
        where identity_record.user_id = user_record.id
          and identity_record.provider = 'google'
      )
    limit 1;

    if existing_user_id is not null then
      perform private.provision_finance_user(existing_user_id, clean_email, existing_user_metadata);
    end if;
  end if;
end;
$$;

revoke all on function public.upsert_authorized_user(text, text, boolean) from public, anon, authenticated;
grant execute on function public.upsert_authorized_user(text, text, boolean) to authenticated;

-- Apply period bounds before ordering/limiting. This turns an old-month query
-- from an unbounded client-side scan into one indexed, cursor-paginated query.
drop function if exists public.get_transactions_page(integer, date, timestamptz, uuid, text, text);

create function public.get_transactions_page(
  p_limit integer default 20,
  p_cursor_occurred_on date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_kind text default 'all',
  p_query text default '',
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  clean_query text := lower(trim(coalesce(p_query, '')));
  result jsonb;
begin
  if caller_id is null or not (select public.is_current_user_allowed()) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100'; end if;
  if p_kind not in ('all', 'expense', 'income', 'transfer') then raise exception 'invalid movement kind'; end if;
  if char_length(clean_query) > 100 then raise exception 'search is too long'; end if;
  if num_nonnulls(p_cursor_occurred_on, p_cursor_created_at, p_cursor_id) not in (0, 3) then
    raise exception 'cursor fields must be provided together';
  end if;
  if num_nonnulls(p_start_date, p_end_date) not in (0, 2) or (p_start_date is not null and p_start_date >= p_end_date) then
    raise exception 'date bounds must be provided together in ascending order';
  end if;

  with candidate_rows as (
    select movement.*,
      (
        select jsonb_build_object(
          'id', pair.id,
          'kind', pair.kind,
          'amount', pair.amount,
          'account_id', pair.account_id,
          'category_id', pair.category_id,
          'transfer_group_id', pair.transfer_group_id,
          'description', pair.description,
          'merchant', pair.merchant,
          'note', pair.note,
          'icon', pair.icon,
          'occurred_on', pair.occurred_on,
          'created_at', pair.created_at
        )
        from public.transactions pair
        where pair.user_id = caller_id
          and pair.transfer_group_id = movement.transfer_group_id
          and pair.kind = 'transfer_in'
        limit 1
      ) as transfer_pair
    from public.transactions movement
    where movement.user_id = caller_id
      and movement.kind <> 'transfer_in'
      and (p_start_date is null or movement.occurred_on >= p_start_date)
      and (p_end_date is null or movement.occurred_on < p_end_date)
      and (
        p_kind = 'all'
        or movement.kind = p_kind
        or (p_kind = 'transfer' and movement.kind = 'transfer_out')
      )
      and (
        clean_query = ''
        or position(clean_query in lower(movement.description)) > 0
        or position(clean_query in lower(coalesce(movement.merchant, ''))) > 0
        or position(clean_query in lower(coalesce(movement.note, ''))) > 0
        or exists (
          select 1
          from public.categories category
          where category.user_id = caller_id
            and category.id = movement.category_id
            and position(clean_query in lower(category.name)) > 0
        )
      )
      and (
        p_cursor_occurred_on is null
        or (movement.occurred_on, movement.created_at, movement.id)
          < (p_cursor_occurred_on, p_cursor_created_at, p_cursor_id)
      )
    order by movement.occurred_on desc, movement.created_at desc, movement.id desc
    limit p_limit + 1
  ), page_rows as (
    select *
    from candidate_rows
    order by occurred_on desc, created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'kind', page.kind,
          'amount', page.amount,
          'account_id', page.account_id,
          'category_id', page.category_id,
          'transfer_group_id', page.transfer_group_id,
          'description', page.description,
          'merchant', page.merchant,
          'note', page.note,
          'icon', page.icon,
          'occurred_on', page.occurred_on,
          'created_at', page.created_at,
          'transfer_pair', page.transfer_pair
        )
        order by page.occurred_on desc, page.created_at desc, page.id desc
      )
      from page_rows page
    ), '[]'::jsonb),
    'hasMore', (select count(*) > p_limit from candidate_rows),
    'nextCursor', (
      select jsonb_build_object(
        'occurredOn', last_row.occurred_on,
        'createdAt', last_row.created_at,
        'id', last_row.id
      )
      from page_rows last_row
      order by last_row.occurred_on, last_row.created_at, last_row.id
      limit 1
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text, date, date)
  from public, anon, authenticated;
grant execute on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text, date, date)
  to authenticated;
