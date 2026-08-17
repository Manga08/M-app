# Configuración de Supabase para Moneva

1. Crea o vincula un proyecto y ejecuta `supabase db push`.
2. En el SQL Editor, registra el único correo autorizado:

```sql
insert into public.app_owner (email)
values (lower('TU_CORREO_GOOGLE'))
on conflict (singleton) do update set email = excluded.email;
```

3. Activa Google en Authentication → Providers y configura el client ID/secret.
4. Agrega `http://localhost:3000/auth/callback` y la URL de producción a la lista de redirect URLs.
5. Copia URL y publishable key a `.env.local`; define el mismo correo en `ALLOWED_OWNER_EMAIL`.

La migración no usa la service-role key en el navegador. Las tablas públicas tienen RLS, políticas por propietario y grants mínimos explícitos.
