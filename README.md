# Moneva

PWA privada de finanzas personales para Colombia. Convierte el modelo del planificador mensual original en una experiencia rápida para escritorio y móvil: cuentas, movimientos, transferencias, presupuestos, reportes, CSV, tema claro/oscuro y trabajo sin conexión.

![Vista social de Moneva](./public/og-moneva.png)

## Stack

- Next.js 16 (App Router), React 19, TypeScript y Tailwind CSS 4
- shadcn/ui + Radix, Lucide, Motion y Geist
- Supabase Auth/Postgres con Google OAuth PKCE, RLS y permisos explícitos
- IndexedDB como caché local y cola de sincronización offline
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

Las pruebas cubren totales mensuales, saldos de cuenta, gasto por categoría, disponibilidad de presupuesto y exportación CSV.

## Rutas

- `/` — resumen mensual
- `/movimientos` — búsqueda, filtros, eliminación y CSV
- `/presupuestos` — regla 50/30/20 y edición rápida
- `/cuentas` — saldos y nuevas cuentas
- `/reportes` — tendencias mensuales
- `/ajustes` — tema, categorías, exportación y estado offline
- `/login` — acceso privado con Google

## Despliegue

Configura en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_OWNER_EMAIL` y `NEXT_PUBLIC_APP_URL`. Añade la URL final a los Redirect URLs de Supabase Auth antes de promover a producción.
