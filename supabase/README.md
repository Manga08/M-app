# Supabase de Moneva

## Preparación

1. Vincula el proyecto con `pnpm dlx supabase link --project-ref <ref>`.
2. Revisa `supabase/config.toml`: el registro y Email están desactivados; Google es el único proveedor.
3. Configura Google OAuth y agrega `http://localhost:3000/auth/callback` y la URL estable de producción a Redirect URLs.
4. Ejecuta `pnpm dlx supabase db push` y copia Project URL + publishable key a `.env.local`.
5. Nunca coloques una service-role key en variables `NEXT_PUBLIC_*` ni en el repositorio.

## Seguridad multiusuario

La lista privada `private.access_allowlist` decide quién puede entrar y qué rol tiene. `/ajustes/acceso` usa RPC administrativas que vuelven a comprobar el rol dentro de PostgreSQL. Cada tabla de usuario tiene RLS permisiva por propietario y una política restrictiva adicional que exige seguir autorizado. Las claves foráneas compuestas `(user_id, id)` bloquean referencias entre usuarios incluso ante un error de aplicación.

El alta también falla de forma cerrada: `private.before_user_created_allowlist` es el hook oficial `Before User Created` y `auth_users_reject_unauthorized_before_insert` actúa como barrera previa en PostgreSQL. Solo una cuenta de Google habilitada en la lista privada puede llegar a existir en `auth.users`; un intento no autorizado no crea identidad, perfil, sesión ni datos financieros.

Las funciones `is_current_user_allowed`, `is_current_user_admin`, `list_authorized_users` y `upsert_authorized_user` son `SECURITY DEFINER` de forma intencional: solo exponen el mínimo necesario para consultar la tabla privada y las dos últimas verifican que el invocador sea administrador. Google-only hace irrelevante el aviso de protección de contraseñas filtradas mientras Email/Password permanezca desactivado.

## Modelo financiero v2

- `ledger_events` representa el evento financiero; `transactions` son sus apuntes por cuenta.
- Una transferencia exige exactamente un apunte de salida y uno de entrada con el mismo `base_amount`.
- Cada movimiento conserva moneda nativa, moneda de reporte, tasa, fecha y fuente del cambio.
- `main_categories` es la vista canónica sobre la tabla heredada `group_allocations`; las subcategorías enlazan por `main_category_id` sin romper datos existentes.
- `exchange_rates`, `account_valuations` e `ingestion_jobs` preparan divisas, inversiones e importación/IA con revisión humana.
- `mutation_receipts` vuelve idempotentes los reintentos offline y `audit_events` conserva trazabilidad de cambios financieros.
- `upsert_transactions_v2`, `delete_transactions_v2` y `upsert_financial_target_v2` guardan cambios compuestos dentro de una sola transacción.

Los grupos incluidos en el plan deben sumar exactamente 100%; el RPC y un trigger diferido hacen imposible guardar una distribución inválida aunque se omita el frontend. Los movimientos programados se materializan por adelantado y `pg_cron` procesa vencimientos con `FOR UPDATE SKIP LOCKED`.

## Verificación y operación

`supabase/tests/finance_foundations_v2.sql` es transaccional: crea un gasto, reintenta la misma operación, prueba una transferencia COP→USD, una deuda con detalles, auditoría y un usuario no autorizado; al final hace rollback. Ejecútala contra un entorno migrado desde SQL Editor o una conexión administrativa.

Después de cada cambio DDL:

```bash
pnpm dlx supabase db push
pnpm dlx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Revisa también Security Advisor y Performance Advisor. No elimines índices recién creados solo porque todavía figuren sin uso: las estadísticas requieren tráfico representativo.
