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

Las cuentas admiten COP y USD. Cada apunte conserva `native_currency_code`, `base_currency_code`, `base_amount`, la tasa aplicada, su fecha y una referencia oficial opcional. La tasa se captura al registrar el movimiento y no se recalcula después: cambiar la TRM de hoy nunca reescribe el pasado.

- El saldo de una cuenta se calcula siempre en su moneda nativa.
- Patrimonio, plan, presupuestos, metas y reportes se calculan en la moneda contable del perfil con `base_amount`.
- Las transferencias entre monedas guardan dos montos nativos vinculados por un mismo `transfer_group_id`.
- Una comisión es un gasto separado, no una reducción silenciosa del monto transferido.
- La ruta servidor `/api/trm` consulta la TRM oficial, limita fechas y cachea únicamente datos públicos. El usuario puede reemplazar la tasa aplicada sin borrar la referencia consultada.
- Por ahora las programaciones con cuenta USD se rechazan de forma explícita: una tasa histórica verificable solo existe cuando ocurre el movimiento. No se debe auto-publicar una conversión futura con una tasa inventada.

### Patrimonio, flujo y conciliación

El saldo inicial de una cuenta es patrimonio de apertura; no es un ingreso. Cambiar el saldo actual crea un movimiento interno `adjustment_in` o `adjustment_out` para conservar trazabilidad, pero ese ajuste no participa en ingresos, gastos, presupuestos, gráficas de flujo ni movimientos recientes. El patrimonio sí incorpora apertura y ajustes.

La fecha y la tasa de apertura (`opening_balance_date`, `opening_exchange_rate`) son parte de la valoración del stock. La moneda de una cuenta queda inmutable después de su primer apunte. Una cuenta todavía vacía puede cambiar de COP a USD únicamente si se aporta una tasa de apertura válida.

### Plan opcional

Una distribución financiera válida tiene uno de dos estados: ningún grupo incluido y suma cero, o uno o más grupos incluidos cuya suma es exactamente 100. Un usuario nuevo comienza con categorías útiles pero sin plan activado. Cuentas, movimientos, patrimonio e informes deben seguir funcionando en ese estado; la interfaz ofrece configurar el plan sin presentarlo como requisito.

### Recurrencia quincenal

`weekly` con `interval_count = 2` significa cada 14 días y conserva el desfase del día inicial. `semimonthly` significa dos anclas independientes por mes (por ejemplo 15 y fin de mes). Las anclas 29–31 se ajustan al último día válido y se deduplican si coinciden. Estos conceptos no se deben presentar como equivalentes.

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
