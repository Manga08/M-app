# Reportes — implementación y contrato de claridad

## Objetivo y composición

Una página, sin pestañas: entender qué ocurrió en un periodo y comprobar cada
cifra. Inicio explica el dinero actual; Reportes no mezcla ese estado actual con
un histórico. Se conserva el sistema visual, formularios y movimiento de Moneva.

1. Periodo, búsqueda visible y filtros activos con nombres y posibilidad de quitar.
2. Ingresos, gastos y diferencia (ingresos − gastos); no saldo ni ahorro confirmado.
3. Evolución con leyenda y datos exactos; categorías e ingresos con desglose.
4. Presupuesto únicamente cuando existen límites y el alcance permite compararlos.
5. Saldos individuales al inicio y cierre; entidad solo como contexto.
6. Crédito/deudas y aportes a metas del periodo, solo cuando corresponden.
7. Movimientos enlazados y Excel con el mismo alcance y definiciones.

## Plan de entrega

- Corregir filtros en motor local y RPC sin cambiar permisos ni datos financieros.
- Comparar categorías principales y subcategorías por intersección; dentro de
  cada selector, varias opciones son alternativas. Los tipos de ingreso forman
  otra rama explícita. Los filtros de clasificación excluyen transferencias.
- Comparar únicamente gasto de categoría/mes con límite positivo. Sin límite
  no hay incumplimiento. El presupuesto mensual no se prorratea por días.
- No comparar un presupuesto global con una cuenta o búsqueda parcial. Explicar
  cuándo hay que quitar esos filtros para habilitar la comparación.
- Contar exclusivamente días/meses elegidos. Meses sueltos usan serie mensual
  y no se comparan con un intervalo continuo diferente. Meses completos se
  comparan con meses de calendario completos; comparación desactivada por defecto.
- Reorganizar la interfaz por preguntas, sin un acordeón que esconda lo esencial.
  Divulgación para detalles secundarios; espacio antes que divisores repetidos.
- Separar saldos históricos (todo el libro hasta el cierre) de actividad filtrada.
  Mostrar los importes nativos y el equivalente histórico, nunca TRM actual.
- No exponer porcentajes de distribución actuales como objetivos históricos.
- Exportar solo módulos relevantes. Evitar mezclar saldos vivos, tasas/cupos
  actuales o próximas cuotas con cifras del periodo histórico.
- Probar funciones puras, migración en PostgreSQL local, Excel e interacción
  Chromium/WebKit en móvil/tablet/escritorio antes de publicación.

## Reglas de trazabilidad

- Total de gastos = suma del desglose de gastos = suma de movimientos filtrados
  de gasto = Excel. Lo mismo para ingresos. Transferencias no duplican gasto.
- «Diferencia» nunca implica dinero disponible ni ahorro depositado.
- Saldo inicial + variación completa del libro = saldo final. Una búsqueda por
  comercio no transforma ese saldo real en un subtotal de movimientos encontrados.
- Registros anticipados conservan su fecha financiera y se distinguen de previstos.
- Un cambio durante la exportación debe detectarse y pedir volver a generar el
  reporte, en vez de producir un resumen que no coincida con sus movimientos.
- Empty states distinguen falta de actividad de ausencia de coincidencias.
- Ocultar una función opcional nunca borra ni modifica sus datos.

## Verificación

Vacío, ingreso/gasto único, arrastre anterior, solo distribución, presupuesto
parcial, meses separados, categorías combinadas, búsqueda, cuentas archivadas,
COP/USD, transferencias, tarjetas, deudas, metas, anticipados y cifras extremas.
Validar consola, teclado/foco, filtros, Atrás/Adelante, exportación y overflow
desde 320 px hasta 2560 px, claro/oscuro y movimiento reducido.
