-- Pure ownership policies: authentication establishes identity, auth.uid()
-- authorizes only rows owned by that identity.
drop policy if exists profiles_select_owner on public.profiles;
drop policy if exists profiles_insert_owner on public.profiles;
drop policy if exists profiles_update_owner on public.profiles;
drop policy if exists profiles_delete_owner on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['accounts', 'categories', 'transactions', 'budgets', 'recurring_rules'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_owner', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_owner', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_owner', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_owner', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_select_self', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_insert_self', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_update_self', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_delete_self', table_name);
  end loop;
end;
$$;

create policy group_allocations_select_self on public.group_allocations for select to authenticated using (user_id = (select auth.uid()));
create policy group_allocations_insert_self on public.group_allocations for insert to authenticated with check (user_id = (select auth.uid()));
create policy group_allocations_update_self on public.group_allocations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
