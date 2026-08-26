-- This constraint trigger is deferred until the surrounding transaction commits.
-- During a first Google sign-in that means the provisioning SECURITY DEFINER
-- frame has already returned and Supabase Auth's role is effective again. Run
-- this trigger-only validator as its owner so it can inspect the just-created
-- finance rows without granting Supabase Auth access to user financial tables.
alter function private.validate_group_allocation_plan()
  security definer;

alter function private.validate_group_allocation_plan()
  set search_path = '';

-- Trigger execution does not require a caller EXECUTE grant. Keep the privileged
-- function private and unavailable through RPC or direct role invocation.
revoke all on function private.validate_group_allocation_plan()
  from public, anon, authenticated, service_role, supabase_auth_admin;

comment on function private.validate_group_allocation_plan() is
  'Deferred trigger-only validator for the per-user 0-or-100 allocation invariant.';
