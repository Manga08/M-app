alter table public.profiles
  add column if not exists financial_reset_generation bigint not null default 0;

alter table public.profiles
  drop constraint if exists profiles_financial_reset_generation_check,
  add constraint profiles_financial_reset_generation_check
    check (financial_reset_generation >= 0);

comment on column public.profiles.financial_reset_generation is
  'Monotonic administrative reset marker used to invalidate this user local encrypted finance cache before queued writes are replayed.';
