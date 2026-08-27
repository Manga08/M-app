# Moneva — sistema de dinero y valoración

Este contrato define cómo se almacena, calcula, presenta y exporta dinero en toda la aplicación. Evita que una pantalla trate un saldo en USD como COP, que un reporte histórico cambie con la TRM de hoy o que una suma aproximada parezca exacta.

## Alcance multimoneda actual

- La moneda contable de Moneva es COP. Reportes, presupuestos, metas y totales históricos se agregan únicamente en COP.
- Una cuenta puede mantener saldo nativo en COP o USD. USD nunca se convierte silenciosamente en el saldo de la cuenta: la conversión existe solo en el snapshot contable o en una valoración marcada con `≈`.
- La tasa capturada es COP por USD. Cada movimiento extranjero conserva su tasa, fecha y procedencia; una transferencia conserva además los dos montos nativos exactos.
- El perfil no cambia la moneda contable después de crear datos. Añadir otra moneda base exige migrar el libro histórico completo y extender primero este contrato, la base de datos, los importadores y las pruebas.

## Tres lecturas distintas

### 1. Valor nativo exacto

Es el importe real en la moneda de la cuenta o del movimiento. Es la cifra principal al mostrar una cuenta, un movimiento o un total por moneda.

- Usa `currency_code` de la cuenta o `native_currency_code` del movimiento.
- El saldo de una cuenta se calcula con apertura y movimientos nativos.
- No lleva `≈` porque no es una conversión.
- Monedas diferentes nunca se suman dentro de esta lectura.

### 2. Equivalente histórico contable

Es el importe convertido cuando ocurrió el hecho financiero. Permite comparar movimientos y periodos sin reescribir el pasado.

- Usa `base_amount`, `base_currency_code`, `exchange_rate`, `exchange_rate_date` y la referencia guardada.
- Es inmutable después de registrar el movimiento, salvo una corrección explícita y auditable del propio movimiento.
- Reportes, flujo, presupuestos y exportaciones históricas agregan este valor.
- Si se muestra junto al valor nativo, aparece como información secundaria e identifica la moneda contable.

### 3. Valoración actual estimada

Responde cuánto equivaldría hoy el patrimonio vivo. Solo se usa para saldos actuales, no para reescribir ingresos, gastos o reportes pasados.

- Convierte el saldo nativo con la TRM oficial vigente cuando el par es compatible.
- Se marca siempre con `≈` si interviene otra moneda.
- Informa fecha y procedencia de la tasa en el contexto cercano.
- Si no hay una tasa actual disponible, puede usar el equivalente contable registrado como contingencia y debe decirlo; nunca aparenta ser una cotización vigente.

## Entidades y cuentas

Una entidad agrupa cuentas; no posee saldo, moneda ni movimientos propios.

- Los totales exactos de una entidad se presentan separados por moneda.
- El total combinado es únicamente una valoración actual estimada en la moneda del perfil.
- Las cuentas sin agrupador pertenecen visualmente a “Sin entidad”.
- Archivar una entidad o cuenta la retira de la operación diaria, pero no del historial ni de los reportes del periodo en que participó.

## Jerarquía visual

1. Monto nativo exacto.
2. Contexto de entidad y cuenta.
3. Equivalente histórico o actual, con `≈` únicamente cuando sea estimación vigente.
4. Tasa, fecha y procedencia cuando ayudan a tomar una decisión.

Las cifras usan `tabular-nums`, formato regional y código/símbolo inequívoco. El color expresa ingreso, gasto, transferencia o alerta, pero no reemplaza signo, etiqueta o moneda.

## Fuentes canónicas

| Responsabilidad | Fuente |
| --- | --- |
| Saldo nativo y contable de una cuenta | `src/lib/finance/calculations.ts` |
| Valoración actual del portafolio | `src/lib/finance/portfolio-valuation.ts` |
| Consulta y caché de TRM pública | `src/lib/finance/exchange-rate.ts` y `/api/trm` |
| Reporte histórico | RPC `get_detailed_finance_report_v4` y `src/lib/finance/detailed-report.ts` |
| Contexto entidad · cuenta | `src/lib/finance/account-entities.ts` |
| Libros Excel | `src/lib/finance/workbook-standard.ts` y `report-workbook.ts` |

No se implementan conversiones aisladas dentro de componentes. Una nueva moneda o proveedor de tasa extiende estas fuentes antes de aparecer en la interfaz.

## Verificación mínima

- Cuenta COP sin conversión.
- Cuenta USD con TRM vigente.
- Cuenta USD sin red: conserva valor de contingencia y lo comunica.
- Entidad con varias cuentas en la misma moneda y con monedas mixtas.
- Cuenta sin entidad y cuenta archivada.
- Transferencia entre monedas con ambos montos nativos vinculados.
- Reporte de un periodo pasado antes y después de cambiar la TRM actual: el resultado debe ser idéntico.
- Cifras negativas, cero, montos extremos y 10.000 movimientos sin overflow ni pérdida de moneda.
