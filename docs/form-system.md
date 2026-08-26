# Moneva — sistema de formularios

Este documento es el contrato visual, funcional y accesible de todos los formularios de Moneva. Se aplica junto con [`.interface-design/system.md`](../.interface-design/system.md) y [`docs/motion-system.md`](./motion-system.md).

La intención es que registrar, editar o filtrar información financiera se sienta como completar una frase clara: **qué ocurrió, cuánto dinero implica, dónde se registra y cuándo sucede**. El formulario debe reducir decisiones, prevenir errores y conservar siempre el contexto del usuario.

## Principios obligatorios

1. **Una tarea y un foco.** Cada formulario tiene una acción principal y un dato dominante: normalmente el importe o el nombre del objeto financiero.
2. **Mismo lenguaje, distinta escala.** Un flujo complejo y un diálogo de tres campos comparten controles, ritmo, estados y voz; no necesitan la misma anchura ni la misma cantidad de estructura.
3. **Etiquetas permanentes.** El placeholder ejemplifica; nunca reemplaza el nombre del campo.
4. **Divulgación progresiva.** Mostrar primero lo necesario para completar la tarea. Opciones avanzadas aparecen después de elegir el tipo o activar la función relacionada.
5. **Entrada indulgente, almacenamiento estricto.** Aceptar formatos humanos —especialmente dinero— y normalizarlos antes de guardar.
6. **El estado nunca se adivina.** El usuario distingue entre borrador, inválido, guardando, guardado localmente, en cola y sincronizado.
7. **No perder trabajo.** Una validación, un error de red o un cierre accidental no borra lo escrito.
8. **Mobile first real.** Desde 320 px se completa con una mano, sin zoom, desbordamiento lateral, campos ocultos ni acciones tapadas por el teclado o el safe area.
9. **Una sola propiedad del scroll.** Cada overlay tiene un único contenedor desplazable y no acumula bloqueos modales anidados.
10. **Accesibilidad por estructura.** HTML nativo, nombres visibles, foco lógico y mensajes asociados; ARIA complementa, no reconstruye semántica ausente.

## Familias canónicas

Antes de construir, elegir una de estas familias. No mezclar sus anatomías por conveniencia.

### 1. Formulario de flujo

Para tareas con varios conceptos, ramificaciones o impacto financiero: registrar un movimiento, crear una meta o deuda, programar una recurrencia e importar datos.

**Anatomía:**

1. Cabecera: ceja contextual opcional, título orientado a la tarea, descripción breve y cierre.
2. Selector de intención o tipo, cuando modifica el resto del formulario.
3. Campo focal: importe o identidad principal.
4. Campos esenciales en el orden mental de la tarea.
5. Secciones condicionales o avanzadas, separadas por espacio o cambio tonal antes que por líneas repetidas.
6. Error general únicamente cuando no pertenece a un campo concreto.
7. Acción primaria persistente en móvil.
8. Resumen o vista previa en escritorio solo cuando ayuda a anticipar el resultado.

**Composición responsiva:**

- En móvil ocupa la pantalla completa, respeta ambos safe areas y tiene un único cuerpo con scroll vertical.
- El cuerpo reserva espacio inferior suficiente para que la acción persistente nunca cubra el último campo.
- Entre 320 y 599 px usa una columna. Solo una pareja corta y claramente relacionada puede compartir fila cuando conserve controles cómodos.
- Desde 600 px puede usar dos columnas para campos pares.
- Desde 1024 px puede separar edición y resumen con proporción aproximada `1.45fr / .55fr`; la edición sigue siendo dominante.
- En escritorio la superficie no supera aproximadamente `94dvh`; el scroll pertenece al cuerpo, no a la página ni a varias columnas simultáneas.

Referencias actuales: `QuickTransaction` y `TargetDialog`.

### 2. Formulario compacto

Para crear o editar una entidad sencilla de uno a seis campos: cuenta, tipo de ingreso, categoría, subcategoría o selección de un mes de referencia.

**Anatomía:**

1. Título directo y una descripción que explique el efecto.
2. Cuerpo en una columna, salvo parejas inseparables en escritorio.
3. Acción primaria al final; cancelar es secundario cuando cerrar no es suficiente.
4. Sin vista previa lateral, hero monetario ni pasos visuales si no aportan comprensión.

**Composición responsiva:**

- Ancho habitual de escritorio: `sm:max-w-md`; usar `sm:max-w-lg` cuando los nombres o selectores necesitan más aire.
- Controles separados por 20 px; secciones por 24–28 px.
- En móvil todo editor financiero ocupa la pantalla completa. La distinción compacto/flujo comienza en escritorio; nunca se usa una lámina parcial para crear o editar cuentas, categorías, tipos de ingreso, metas o deudas.
- La acción principal mide al menos 48 px y puede ocupar todo el ancho en móvil.

Referencia actual: formulario `Nueva cuenta`.

### 3. Formulario inline o de filtros

Para modificar una vista sin crear una entidad: filtros, periodo, búsqueda y parámetros de simulación.

- Vive junto al contenido que afecta y conserva visibles los resultados anteriores durante la actualización.
- En escritorio puede ser una banda o panel; en móvil puede abrir un sheet coherente con el origen del botón.
- Aplicar y restablecer tienen significado explícito. Cerrar no aplica cambios silenciosamente.
- Los filtros activos se reflejan en el botón de origen y en la URL cuando deben sobrevivir Atrás/Adelante o compartirse.
- No adoptar la jerarquía expresiva de un formulario de flujo: aquí gana la comparación con los resultados.

### 4. Confirmación destructiva

Para eliminar, archivar o descartar cambios.

- Usar `AlertDialog`, no un formulario general disfrazado.
- Una confirmación de archivo explica qué desaparece de la operación diaria y qué se conserva como historial. Si existen precondiciones —por ejemplo saldo pendiente, recurrencias o metas vinculadas— se enumeran dentro del diálogo y la acción destructiva permanece deshabilitada.
- El título nombra el objeto y la acción; la descripción explica consecuencias y qué se conserva.
- La acción destructiva usa semántica y variante destructiva; cancelar recibe el foco seguro.
- No pedir confirmación para acciones reversibles que ya ofrecen deshacer.

## Anatomía visual compartida

### Cabecera

- La ceja es opcional y contextual; no se usa como adorno ni repite el título.
- El título describe el objetivo en lenguaje humano: “¿Qué pasó con tu dinero?” o “Nueva cuenta”.
- La descripción ocupa una o dos frases breves y explica el efecto, no instrucciones obvias.
- El botón de cierre conserva 44 × 44 px de área táctil, nombre accesible y posición estable.
- En un flujo con cambios, cerrar solicita confirmación solo si existe un borrador realmente modificado.

### Ritmo

- Base espacial: 4 px.
- Etiqueta → control: 8 px.
- Control → ayuda o error: 6–8 px.
- Campo → campo: 20 px.
- Grupo → grupo: 24–28 px.
- Cabecera → primer control: 28 px en flujos; 20–24 px en compactos.
- Padding móvil: 16 px a 320 px y 20 px desde 360 px.
- Padding de escritorio en flujos: 28–32 px; en compactos: 24 px.
- Agrupar por proximidad antes de añadir divisores. Una sección no debe quedar encerrada en una tarjeta flotante por defecto.

### Jerarquía

- **Nivel 1:** importe o nombre focal.
- **Nivel 2:** selector de tipo y campos necesarios para completar la acción.
- **Nivel 3:** vínculo, programación, prioridad y otros parámetros secundarios.
- **Nivel 4:** ayuda, procedencia, privacidad y metadatos.
- Una sola acción primaria es visible por breakpoint. No duplicar botones competidores dentro del mismo viewport.

## Contrato de campos

### Marco canónico

- Usar `FormControl`, `FormControlInput`, `InputControl`, `SelectControl`, `DateControl` y `MonthControl` desde `src/components/ui/form-control.tsx`.
- Altura estándar: 52 px. Radio estándar: 14 px.
- Campo monetario focal: 72 px de alto, radio de 20 px y cifra de aproximadamente 30 px con `tabular-nums`.
- Textarea: mínimo 80–96 px, redimensionamiento bloqueado en overlays cuando pueda romper el layout.
- Fondo del campo: token `control`; foco: borde `ring` y anillo visible. No recrear el wrapper con clases sueltas.
- Iconos decorativos miden aproximadamente 18 px, heredan tokens semánticos y quedan fuera del árbol accesible.

### Etiqueta, ayuda y error

Cada campo sigue este orden:

1. `Label` visible y vinculada mediante `htmlFor`/`id`.
2. Control.
3. Ayuda persistente solo si reduce una duda real.
4. Error específico cuando corresponde.

- Marcar “(opcional)” en la etiqueta; no marcar todos los obligatorios con asteriscos.
- El placeholder usa ejemplos concretos: “Ej. Davivienda”; no contiene instrucciones largas.
- Ayuda y error tienen `id`; el control los referencia con `aria-describedby`.
- Un campo inválido expone `aria-invalid="true"`. El mensaje explica qué ocurrió y cómo corregirlo.
- El color nunca es la única señal de error, selección o éxito.

### Dinero y números

- Usar `formatMoneyInput`, `formatMoneyInputValue` y `parseMoneyInput`.
- Mostrar separadores regionales mientras se escribe; almacenar números normalizados.
- Preferir `type="text"` + `inputMode="decimal"` para dinero. No usar `type="number"` cuando sus steppers, localización o formato causen ambigüedad.
- La divisa se comunica con prefijo o código, sin repetirla dentro del valor.
- Permitir negativos únicamente donde tengan significado explícito, como un saldo inicial ajustado.
- Aplicar límites de dominio antes de guardar: porcentajes, días del mes, montos positivos y relaciones entre fechas.
- La moneda visible se deriva de la cuenta elegida. No se usa la moneda del perfil para etiquetar un monto nativo en USD.
- Cuando cuenta y moneda contable difieren, el monto principal conserva la moneda nativa y el equivalente contable aparece como ayuda secundaria con `≈`.
- Una conversión muestra en este orden: monto enviado, cuenta origen/destino, tasa aplicada, monto recibido y comisión opcional. La TRM oficial es referencia; nunca sustituye el valor realmente acreditado sin conocimiento del usuario.
- La edición de una tasa existente conserva el snapshot histórico. Consultar una TRM nueva solo ocurre al crear un movimiento o al cambiar deliberadamente fecha/cuentas.
- El saldo inicial se nombra “patrimonio” en la ayuda. Una conciliación de saldo advierte antes de guardar que creará un ajuste y no un ingreso o gasto.
- Cualquier resumen o vista previa que agregue varias cuentas aplica el contrato de [`money-system.md`](./money-system.md); no inventa conversiones dentro del formulario.

### Selectores

- `SelectControl` mantiene selector estilizado en escritorio y control nativo en móvil.
- Una opción vacía explica el estado: “Sin vincular” o “Selecciona”; nunca una cadena vacía visual.
- Cuando una selección altera campos posteriores, el cambio es inmediato y preserva los valores todavía válidos.
- Para dos a seis opciones visuales importantes, usar un selector segmentado con icono + etiqueta, `aria-pressed` o patrón de radio completo y objetivo mínimo de 44 px.
- No usar chips diminutos para elecciones que cambian el significado financiero del formulario.
- Cuando existan entidades de cuentas, agrupar las opciones con `optgroup` y mostrar `Entidad · Cuenta` fuera del selector cuando el contexto pueda perderse. El valor guardado continúa siendo siempre el `account_id`.
- Crear una entidad desde el formulario de cuenta usa divulgación inline dentro del mismo editor. No abre un modal anidado ni convierte la entidad en requisito; “Sin entidad” sigue siendo una elección válida.

### Identidad, icono y color

- Cuando nombre e icono describen la misma entidad, integrarlos en un único `FormControl` con `FinanceIconPicker embedded`.
- La sugerencia automática de icono se detiene después de que el usuario lo elige manualmente.
- El selector de iconos mantiene un único diálogo de capa superior y no añade otro bloqueo modal al formulario padre.
- Los colores se agrupan en `fieldset` con `legend`; cada muestra tiene nombre accesible, `aria-pressed` y un indicador que no depende solo del color.
- No separar “Nombre”, “Icono” y “Color” en tarjetas distintas.
- Usar `FinanceIdentityField` para cuentas, categorías principales, subcategorías, tipos de ingreso, metas y deudas. Estas entidades admiten una paleta Moneva y un color personalizado.
- Un movimiento admite icono personalizado, pero no color personalizado: ingreso usa `positive`, gasto usa `destructive` y transferencia usa `info`. Esta semántica es estable en historial, inicio, detalle y formulario.

### Fecha, archivo y texto largo

- Usar `DateControl`/`MonthControl`; móvil conserva el selector nativo y escritorio el popover canónico.
- Fechas relacionadas se limitan entre sí mediante `min`/`max` y mantienen una explicación visible si la relación no es obvia.
- Un archivo se elige desde una superficie con icono, propósito, formato, límite y privacidad; el `<input type="file">` puede ser visualmente oculto, no semánticamente eliminado.
- Mostrar el nombre del archivo elegido y ofrecer reemplazarlo o quitarlo antes de guardar.

## Secciones condicionales y complejidad

- El selector de intención aparece antes que los campos que modifica.
- Las secciones dinámicas se insertan cerca de su causa: deuda → datos de deuda; recurrencia → frecuencia y fecha final.
- Conservar valores al ocultar temporalmente solo si volver a la opción puede recuperarlos sin producir un envío inesperado. De lo contrario, limpiar con explicación.
- No convertir un formulario largo en un wizard solo para reducir su altura. Usar pasos únicamente si existe una secuencia dependiente, irreversible o cognitivamente distinta.
- Una vista previa lateral resume consecuencias; nunca replica todos los campos ni se convierte en un segundo formulario.

## Acciones y estados

### Acción primaria

- El texto usa verbo + objeto: “Crear cuenta”, “Guardar cambios”, “Registrar gasto”. Evitar “Aceptar” o “Continuar” cuando no explican el resultado.
- Deshabilitar durante una mutación o cuando la acción sea inequívocamente imposible. Un botón deshabilitado por datos incompletos debe tener campos y ayudas suficientes para entender por qué.
- En móvil, la acción persistente respeta `safe-area-inset-bottom` y el teclado. El último campo puede desplazarse completamente por encima del footer.
- En escritorio, el resumen puede alojar la acción primaria si permanece visible; el cuerpo no muestra una segunda copia visible.

### Estados mínimos

Todo formulario implementa y verifica:

- inicial;
- editado/dirty;
- válido;
- error por campo;
- error general o de red;
- guardando;
- guardado remoto, local o en cola;
- cierre o descarte;
- reintento sin perder valores.

Durante `saving`:

- preservar el contenido y el tamaño del botón;
- mostrar actividad y texto en gerundio: “Guardando…”;
- bloquear solo acciones que puedan duplicar o contradecir la mutación;
- no cerrar ni limpiar antes de conocer el resultado.

Al completar, usar `announceMutation`; al fallar, `announceMutationError`. Limpiar el estado después del cierre real definido por `onExitComplete`, nunca con temporizadores propios.

## Validación y recuperación

- Validar progresivamente después de la interacción y de nuevo al enviar; no mostrar una pared de errores al abrir.
- El error se coloca junto al campo y el primer campo inválido recibe foco o se desplaza a una posición visible.
- Un resumen superior se añade solo cuando hay varios errores distribuidos o una condición transversal.
- Las validaciones financieras críticas también viven en dominio/base de datos; la interfaz anticipa la regla, no es su única defensa.
- Normalizar espacios y formatos sin cambiar silenciosamente el significado.
- Una respuesta fallida conserva todo el borrador y permite reintentar.
- Cerrar un borrador modificado usa confirmación con “Seguir editando” y “Descartar”.

## Overlays, foco y scroll

- Un diálogo tiene un solo contenedor con `overflow-y-auto`; cabecera y footer pueden quedar fijos únicamente si no crean otro scroll vertical.
- El catálogo de un selector interno puede desplazarse, pero no bloquea ni roba permanentemente el scroll del formulario padre.
- No anidar dos modales Radix que compitan por `pointer-events`, foco o `data-scroll-locked`. Para `FinanceIconPicker`, conservar el patrón nativo de capa superior documentado en el sistema principal.
- `Escape` cierra la capa superior; Atrás del navegador hace lo mismo antes de cerrar el formulario padre.
- Al cerrar una capa interna, devolver foco a su trigger. Al cerrar el formulario, devolverlo a la acción que lo abrió.
- Usar `touch-action: pan-y` en catálogos verticales y evitar listeners globales que cancelen `touchmove`.
- Probar cinco ciclos de abrir/cerrar, seleccionar un elemento, usar Atrás y repetir después de un error.

El movimiento y la vida útil de overlays pertenecen exclusivamente a [`docs/motion-system.md`](./motion-system.md). Este documento no introduce duraciones, curvas ni escalas nuevas.

## Voz y contenido

- Español directo, cercano y preciso; nunca culpar al usuario.
- Títulos orientados a intención; etiquetas orientadas al dato; botones orientados al resultado.
- Ayudas de una frase. Si hacen falta párrafos, usar divulgación progresiva o documentación externa.
- Diferenciar “categoría principal” y “subcategoría”; no volver a usar “grupo” en la interfaz.
- Diferenciar “saldo”, “movimiento”, “presupuesto”, “meta” y “deuda”; no usar “monto” como nombre genérico de una entidad.
- Explicar las consecuencias antes de acciones destructivas o cálculos automáticos.

## Componentes y fuentes de verdad

| Responsabilidad | Fuente canónica |
| --- | --- |
| Campo compuesto, input, select, fecha y mes | `src/components/ui/form-control.tsx` |
| Input base y textarea | `src/components/ui/input.tsx` y `src/components/ui/textarea.tsx` |
| Botones | `src/components/ui/button.tsx` |
| Dialog y AlertDialog | `src/components/ui/dialog.tsx` y `src/components/ui/alert-dialog.tsx` |
| Superficie de editores | `src/components/ui/form-dialog.tsx` (`FormDialogContent`, `FormDialogBody`, `FormDialogActions`) |
| Iconografía financiera | `src/components/finance-icon-picker.tsx` |
| Identidad financiera editable | `src/components/finance-identity-field.tsx` |
| Color semántico de movimientos | `src/lib/finance/movement-visuals.ts` |
| Formato de dinero | `src/lib/finance/money-input.ts` |
| Feedback de mutaciones | `src/lib/finance/mutation-feedback.ts` |
| Movimiento y overlays | `docs/motion-system.md` |
| Formulario de flujo de referencia | `src/components/quick-transaction.tsx` |
| Formulario compacto de referencia | `src/components/accounts-page.tsx` (`Nueva cuenta`) |

No crear una primitiva nueva si una fuente canónica cubre el comportamiento. Si un patrón aparece por segunda vez, extraerlo o extender la primitiva existente en vez de copiar una cadena larga de clases.

## Estado actual y migración

- Los editores de cuenta, categoría principal, subcategoría, tipo de ingreso, meta/deuda y movimiento usan la superficie canónica de pantalla completa en móvil.
- Los selectores de identidad comparten icono, paleta, selector libre y accesibilidad; no mantienen paletas locales duplicadas.
- El color de movimientos se deriva del tipo y nunca se persiste como preferencia visual del movimiento.

La base canónica cubre hoy los editores financieros principales. Las utilidades breves —confirmaciones o elección de un mes— conservan `Dialog`/`AlertDialog` porque no son editores de entidad.

**Alineados o referencia:**

- Registrar/editar movimiento y programación.
- Crear/editar meta o deuda.
- Crear/editar cuenta, tipo de ingreso, categoría principal y subcategoría.
- Editor de tema personalizado.
- Controles de input, select, fecha y mes.

**Deuda visual a revisar en futuras iteraciones:**

- Formularios de administración, perfil e importación que aún recreen espacios, pies o errores localmente se migran solo cuando se revise el flujo completo.
- Los diálogos pequeños de mes de referencia siguen siendo utilidades compactas; no deben adquirir identidad o pantalla completa sin una necesidad de contenido.

La migración se hace por flujo completo, no cambiando controles aislados sin revisar cabecera, scroll, acciones, estados y accesibilidad. Primero se centralizan primitivas; después se actualizan consumidores.

## Matriz mínima de aceptación

Cada formulario nuevo o modificado se verifica en:

- 320 × 720 y un teléfono grande;
- Pixel / Chromium e iPhone / WebKit;
- iPad Mini y tablet grande;
- 1440 × 900, 1920 × 1080 y 2560 × 1440;
- tema claro, oscuro y una paleta de alto carácter;
- teclado abierto y cerrado en móvil;
- zoom del navegador al 200%;
- teclado completo, foco visible y lector de pantalla;
- movimiento normal y reducido;
- datos vacíos, máximos, texto largo, cifras extremas y error de red;
- cinco ciclos de apertura/cierre y selector interno;
- Atrás/Adelante con overlay abierto;
- validación automatizada con axe cuando el flujo es principal.

## Lista de revisión

Antes de aprobar un formulario:

- [ ] Pertenece claramente a una de las cuatro familias.
- [ ] Tiene una tarea y una acción primaria inequívocas.
- [ ] El orden de campos coincide con el modelo mental financiero.
- [ ] Todas las etiquetas permanecen visibles y asociadas.
- [ ] Usa primitivas canónicas y tokens semánticos.
- [ ] Dinero, porcentajes y fechas se formatean y limitan correctamente.
- [ ] Opcionales, ayudas y errores se comunican sin depender del color.
- [ ] Los campos condicionales aparecen cerca de su causa.
- [ ] Guardar, fallar, reintentar y descartar preservan el borrador.
- [ ] El foco entra, avanza, vuelve y nunca queda atrapado.
- [ ] Solo existe un scroll vertical por overlay y ningún bloqueo residual.
- [ ] La acción móvil no tapa contenido y respeta safe areas.
- [ ] No hay desbordamiento horizontal desde 320 px.
- [ ] Cumple el contrato de movimiento sin valores inline nuevos.
- [ ] Fue validado visualmente y con interacción real en Chromium y WebKit.
