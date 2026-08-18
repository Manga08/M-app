-- The client uses the idempotent upsert_transfer RPC. Keep the original
-- non-idempotent helper private so retries cannot create duplicate pairs.
revoke execute on function public.create_transfer(uuid, uuid, numeric, text, date, text)
from public, anon, authenticated;
