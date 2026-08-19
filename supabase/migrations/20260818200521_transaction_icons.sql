alter table public.transactions
  add column if not exists icon text;

alter table public.transactions
  drop constraint if exists transactions_icon_format;

alter table public.transactions
  add constraint transactions_icon_format
  check (icon is null or (char_length(icon) between 1 and 80 and icon ~ '^(brand:)?[a-z0-9-]+$'));

comment on column public.transactions.icon is
  'Optional bundled icon identifier. No remote URL is stored or requested.';

create or replace function public.get_transactions_page(
  p_limit integer default 20,
  p_cursor_occurred_on date default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_kind text default 'all',
  p_query text default ''
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

revoke all on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.get_transactions_page(integer, date, timestamptz, uuid, text, text)
  to authenticated;
