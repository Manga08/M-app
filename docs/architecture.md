# Arquitectura de Moneva

## Principios

- PostgreSQL es la fuente de verdad; IndexedDB es una caché cifrada y una cola durable por usuario.
- La UI aplica cambios optimistas, pero el servidor valida propiedad, allowlist, integridad, porcentajes y transferencias.
- Una operación de dinero tiene un identificador estable. Un reintento devuelve el recibo previo en lugar de duplicar filas.
- Los importadores y futuros modelos de IA crean borradores revisables; nunca apuntes contables directos.

## Flujo de datos

1. La interfaz valida y escribe el cambio en IndexedDB con un `operationId`.
2. `finance-provider` coordina estado, red y publicación de la copia durable.
3. `remote-mutations.ts` traduce una entrada de cola a un RPC atómico o una escritura simple.
4. Triggers de PostgreSQL fijan evento, moneda, versión y auditoría.
5. Al confirmar, la cola retira el cambio; si falla conserva orden causal y reintenta después.

Las consultas y mapeos viven en `remote-state.ts`; los tipos reales se generan en `database.types.ts`. Esto evita que cambios de esquema se propaguen sin comprobación de TypeScript.

## Evolución prevista

### Divisas

Las cuentas ya tienen `currency_code`; cada apunte conserva `native_currency_code`, `base_currency_code`, `base_amount` y la tasa usada. Una futura interfaz solo debe añadir selección de moneda y proveedor TRM, manteniendo edición manual. Los reportes deberán sumar `base_amount`; los saldos de una cuenta siguen usando el monto nativo.

### Inversiones

`expected_annual_return` es una hipótesis de proyección, no una transacción. Los valores observados se guardan en `account_valuations`, separados del libro mayor para no inventar rendimientos realizados.

### Captura con imagen, audio o IA

`ingestion_jobs` guarda estado, origen, huella del archivo y un borrador estructurado. La retención prevista es corta y explícita. Solo una confirmación humana crea un `ledger_event`; así una extracción imperfecta no afecta saldos.

## Seguridad y privacidad

- Google OAuth PKCE, sin registro ni contraseña por Email.
- Allowlist privada y RLS de doble condición: usuario propietario + acceso vigente.
- Sin service-role en navegador.
- Portadas privadas con URL firmada; la ruta determinista permite reemplazo sin acumular archivos huérfanos.
- CSP restringe orígenes y la caché local usa AES-GCM separada por `userId`.
- `audit_events` es append-only para el cliente y registra altas, cambios y bajas financieras.

## Cambios y recuperación

Las migraciones son incrementales y viven en `supabase/migrations`. Antes de un lanzamiento con datos reales se debe probar una restauración en una rama/backup, ejecutar el smoke SQL y verificar Advisors. Los datos actuales de prueba pueden reiniciarse, pero Auth y la allowlist se consideran infraestructura y no forman parte de un reset financiero.
