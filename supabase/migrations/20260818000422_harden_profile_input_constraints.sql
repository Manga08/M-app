alter table public.profiles
  drop constraint if exists profiles_display_name_check,
  add constraint profiles_display_name_check check (
    display_name is null or char_length(trim(display_name)) between 2 and 80
  ),
  drop constraint if exists profiles_timezone_check,
  add constraint profiles_timezone_check check (
    char_length(timezone) between 1 and 100
  );
