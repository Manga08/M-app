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

## Tarjetas de crédito

Una tarjeta es una cuenta de tipo `credit` con un perfil adicional de cupo y ciclo. El libro mayor, no el perfil, determina su deuda.

- El saldo nativo de la cuenta permanece negativo mientras exista deuda; la cifra de deuda visible es `max(0, -saldo)`.
- Una compra se registra una sola vez como gasto completo en la fecha de compra. Las cuotas son compromisos futuros y nunca vuelven a sumarse como gastos.
- Un pago es una transferencia desde una cuenta propia hacia la tarjeta. Reduce patrimonio disponible y deuda, pero no crea un segundo gasto.
- Cupo disponible y utilización se calculan desde deuda viva y `credit_limit`; no se persisten como saldos paralelos.
- El extracto conciliado es la fuente verificable de total, mínimo, intereses y cargos. Antes de conciliar, corte, pago y totales se etiquetan como estimados.
- COP y USD siguen el mismo contrato: cada tarjeta conserva su moneda nativa exacta; cualquier agregado entre monedas es una valoración `≈`.
- Solo se permite guardar alias, red y últimos cuatro dígitos opcionales. PAN completo, CVV, PIN, credenciales, fotos y documentos quedan fuera del modelo.

## Obligaciones y deudas

El motor canónico de pasivos vive en `src/lib/finance/obligations.ts`. Modela el contrato y proyecta el calendario, pero no sustituye el extracto o certificación del acreedor. Una deuda genérica no duplica compras ni saldos de tarjeta: las tarjetas conservan su módulo especializado y solo participan en agregados de pasivos.

### Certeza y procedencia

Cada cifra debe conservar una de estas etiquetas, independiente del estado de la deuda:

- `confirmed`: saldo o acumulado conciliado contra una fuente verificable y fechado.
- `calculated`: resultado determinista con términos completos y valores vigentes conocidos.
- `approximate`: proyección que prolonga una tasa variable, un índice o una valoración no confirmada.
- `manual`: calendario escrito por el usuario, sin inferir condiciones que no entregó.

La prioridad es confirmado → calculado → aproximado → manual para escoger una cifra de resumen, pero una conciliación confirmada no convierte automáticamente el futuro en confirmado. La interfaz debe mostrar “Confirmado”, “Calculado”, “Aproximado” o “Manual”; nunca “saldo exacto” para una proyección.

### Tasas

- Todos los campos `percent` son porcentajes humanos: `12` significa 12 %, no `0.12`.
- Se conservan la tasa original y su convención (`EA`, `EM`, `NMV` o nominal con periodos/base). La normalización no reemplaza el dato contractual.
- `convertObligationRate` normaliza matemáticamente entre convenciones; `effectiveObligationRate` obtiene una tasa por periodo o por días con base contractual 360/365.
- Una tasa variable guarda snapshots del valor total aplicado, su fecha efectiva y vigencia. Fuera de la vigencia conocida, el resultado baja a `approximate`; una cotización nueva nunca recalcula periodos pasados.
- El motor puro puede calcular capital y calendario en unidades UVR. La aplicación operativa mantiene el libro en COP, convierte la vista con la referencia manual y la etiqueta como aproximada hasta conciliación; no trata la UVR como moneda ni indexa dos veces el capital.
- Un capital ajustado por IPC u otro índice expone `indexAdjustment` separado de capital e interés.

### Calendarios y precisión

- Métodos soportados: cuota constante, capital constante, solo interés, pago final/balloon y calendario manual.
- Frecuencias: semanal, cada 14 días exactos, dos veces al mes, mensual, trimestral, anual e irregular manual. `intervalCount` amplía el intervalo; dos veces al mes requiere dos anclas y deduplica cierres que coincidan por febrero.
- Los días 29–31 se fijan al último día válido sin perder el ancla original. Los años bisiestos y el devengo por días se calculan en UTC financiera, sin hora local.
- Internamente capital, cuotas, cargos y residuos se redondean en unidades menores con aritmética entera: COP 0 decimales, USD 2 y UVR 8. Las tasas usan precisión escalada. La última cuota absorbe el residuo; no quedan centavos fantasma.
- `generateObligationSchedule` entrega por cuota apertura, ajuste de índice, capital, interés, seguro, cargos, otros costos, total y cierre. Seguro/cargos nunca se esconden dentro de interés.

### Mora, abonos y conciliación

- `calculateObligationArrears` calcula mora únicamente sobre capital vencido y mantiene separados interés corriente, interés de mora, seguro, cargos y cobranza. La legalidad y topes dependen del producto y periodo; el motor no dicta que una tasa sea ilegal.
- `applyObligationPrepayment` aplica el pago a cargos vencidos, interés vencido y capital. En cuota o capital constante puede reducir cuota o plazo. Un calendario manual exige un calendario revisado: Moneva no inventa su distribución.
- `reconcileObligationSchedule` bloquea todas las filas con fecha igual o anterior al corte, registra la diferencia contra el saldo confirmado y recalcula únicamente el futuro. La referencia de fuente queda separada del calendario.
- Un desembolso aumenta efectivo y pasivo, no ingreso. El pago de capital reduce efectivo y pasivo, no es un segundo gasto; intereses, seguros y cargos sí son costo. Una refinanciación cierra/enlaza la deuda anterior y crea un nuevo contrato sin reescribir el historial.

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
| Deuda, cupo, ciclos y cuotas | `src/lib/finance/credit-cards.ts` |
| Tasas, calendarios, mora, abonos y conciliación de pasivos | `src/lib/finance/obligations.ts` |

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
- Tarjeta sin deuda, al límite y por encima del cupo; compra a una y varias cuotas; pago parcial y total.
- Cuotas con división no exacta: la suma de principales debe coincidir al centavo con la compra.
- Corte/pago en días 29–31 y febrero; extracto estimado frente a conciliado.
- Obligación a 0 %, tasa fija/variable/indexada, base 360/365 y cada frecuencia admitida.
- Cuota constante, capital constante, solo interés, pago final y calendario manual.
- Abono para reducir cuota/plazo y conciliación que conserve byte a byte el historial bloqueado.
- Mora con capital, interés corriente, interés moratorio, seguro, cargos y cobranza separados.
- UVR en unidades con valoración diaria; COP, USD y UVR con residuos y montos extremos.
