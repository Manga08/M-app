alter table public.profiles
  add column if not exists custom_theme_color text not null default '#5B6EF5';

alter table public.profiles
  drop constraint if exists profiles_color_theme_check,
  add constraint profiles_color_theme_check
    check (color_theme in ('moneva', 'crimson', 'ocean', 'violet', 'amber', 'custom')),
  drop constraint if exists profiles_custom_theme_color_check,
  add constraint profiles_custom_theme_color_check
    check (custom_theme_color ~ '^#[0-9A-Fa-f]{6}$');

grant update (custom_theme_color) on public.profiles to authenticated;

comment on column public.profiles.custom_theme_color is
  'Color HEX base del tema personalizado. La interfaz deriva variantes accesibles para claro y oscuro.';
