# Moneva

PWA multiusuario de finanzas personales para Colombia. Convierte el modelo del planificador mensual original en una experiencia rápida para escritorio y móvil: cuentas, movimientos y transferencias, automatizaciones, metas y deudas, presupuestos, reportes y Excel, perfiles, temas dinámicos y trabajo sin conexión cifrado.

![Vista social de Moneva](./public/og-moneva.png)

## Stack

- Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS 4
- shadcn/ui + Radix, Lucide, Motion y Geist
- Supabase Auth/Postgres con Google OAuth PKCE, RLS y permisos explícitos
- IndexedDB con AES-GCM como caché local y cola de sincronización offline separada por usuario
- Vercel como destino de despliegue

## Desarrollo local

```bash
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Sin variables de Supabase, la app habilita un modo demo persistente en el dispositivo. Para un entorno conectado, completa `.env.local` y sigue [supabase/README.md](./supabase/README.md).

## Calidad

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Las pruebas cubren cálculos, recurrencia, paginación, cola offline, saldos, presupuestos, reportes, importación, exportación Excel, accesibilidad y vistas responsive con Playwright. La prueba SQL transaccional de `supabase/tests/finance_foundations_v2.sql` valida operaciones atómicas, transferencias multimoneda, auditoría y aislamiento de usuarios.

## Rutas

- `/` — resumen mensual
- `/movimientos` — historial paginado, filtros, calendario, programaciones, edición, eliminación y Excel
- `/presupuestos` — distribución del 100%, categorías principales, subcategorías, presupuesto y simulador
- `/cuentas` — saldos y nuevas cuentas
- `/metas` — metas, deudas, progreso verificable y aportes programados
- `/reportes` — periodos y filtros flexibles, comparaciones, gráficos y Excel
- `/ajustes` — apariencia, importación, exportación completa y estado offline
- `/ajustes/acceso` — lista privada de correos y roles, visible solo para administradores
- `/perfil` — nombre y preferencias regionales del usuario
- `/login` — acceso individual con Google

## Despliegue

Configura en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_APP_URL`. Añade la URL final a los Redirect URLs de Supabase Auth antes de promover a producción. La publishable key puede estar en el cliente; la autorización real se aplica con lista privada + RLS por propietario y nunca se debe exponer una service-role key.

La arquitectura y las decisiones de evolución están documentadas en [docs/architecture.md](./docs/architecture.md).
