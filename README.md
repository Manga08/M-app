# Moneva

PWA multiusuario de finanzas personales para Colombia. Convierte el modelo del planificador mensual original en una experiencia rápida para escritorio y móvil: cuentas, movimientos, transferencias, presupuestos, reportes, CSV, perfiles, paletas de color y trabajo sin conexión cifrado.

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

Las pruebas cubren totales mensuales, agregados paginados, saldos de cuenta, gasto por categoría, disponibilidad de presupuesto y exportación CSV segura.

## Rutas

- `/` — resumen mensual
- `/movimientos` — búsqueda, filtros, edición, eliminación, paginación y CSV
- `/estructura` — grupos y subcategorías dinámicos, inclusión en el plan y distribución obligatoria del 100%
- `/presupuestos` — presupuestos mensuales por subcategoría
- `/cuentas` — saldos y nuevas cuentas
- `/reportes` — agregados reales de los últimos 12 meses calculados en PostgreSQL
- `/ajustes` — temas, estructura, exportación completa y estado offline
- `/ajustes/acceso` — lista privada de correos y roles, visible solo para administradores
- `/perfil` — nombre y preferencias regionales del usuario
- `/login` — acceso individual con Google

## Despliegue

Configura en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_APP_URL`. Añade la URL final a los Redirect URLs de Supabase Auth antes de promover a producción. La publishable key puede estar en el cliente; la autorización real se aplica con lista privada + RLS por propietario y nunca se debe exponer una service-role key.
