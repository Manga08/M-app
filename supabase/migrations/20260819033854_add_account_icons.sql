alter table public.accounts
  add column icon text not null default 'wallet'
  check (char_length(icon) between 1 and 100);

update public.accounts
set icon = case
  when lower(name) like '%bancolombia%' then 'bank:bancolombia'
  when lower(name) like '%nequi%' then 'bank:nequi'
  when lower(name) like '%davivienda%' then 'bank:davivienda'
  when lower(name) like '%daviplata%' then 'bank:daviplata'
  when lower(name) like '%bbva%' then 'bank:bbva-colombia'
  when lower(name) like '%banco de bogot%' then 'bank:banco-de-bogota'
  when lower(name) like '%caja social%' then 'bank:banco-caja-social'
  when lower(name) like '%banco de occidente%' then 'bank:banco-de-occidente'
  when lower(name) like '%av villas%' then 'bank:av-villas'
  when lower(name) like '%banco popular%' then 'bank:banco-popular'
  when lower(name) like '%itau%' or lower(name) like '%itaú%' then 'bank:itau-colombia'
  when lower(name) like '%lulo%' then 'bank:lulo-bank'
  when lower(name) like '%nubank%' or lower(name) like '%nu colombia%' then 'bank:nu-colombia'
  when lower(name) like '%efectivo%' then 'banknote'
  when lower(name) like '%visa%' then 'brand:visa'
  when lower(name) like '%mastercard%' then 'brand:mastercard'
  else icon
end;

comment on column public.accounts.icon is
  'Identificador local de icono genérico, bancario o de marca; no contiene URLs remotas.';
