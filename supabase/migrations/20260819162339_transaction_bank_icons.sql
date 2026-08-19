alter table public.transactions
  drop constraint if exists transactions_icon_format;

alter table public.transactions
  add constraint transactions_icon_format
  check (
    icon is null
    or (
      char_length(icon) between 1 and 80
      and icon ~ '^(brand:|bank:)?[a-z0-9-]+$'
    )
  );

comment on column public.transactions.icon is
  'Optional bundled generic, bank, or brand icon identifier. No remote URL is stored or requested.';
