# Moneva — plan integral de simplificación de uso

Fecha: 22 de octubre de 2026. Base revisada: `3e77287`.

Estado: **implementado y verificado automáticamente; validación con personas pendiente**. Los apartados 1–18 conservan el plan aprobado como referencia. El apartado 19 registra la implementación real, sus ajustes respecto a la propuesta y los resultados verificables. No se reiniciaron datos de usuarios.

## 1. Dirección de producto

> Entender cuánto dinero tengo, registrar lo que entra y sale y saber qué viene después, sin tener que aprender un sistema financiero completo.

Moneva conservará su identidad y sus motores financieros. El cambio será de jerarquía, recorridos, estados y lenguaje. No consistirá en añadir un tutorial largo a las mismas pantallas ni en sustituir el sistema de diseño.

La experiencia cotidiana deberá funcionar con una cuenta y las categorías predeterminadas. Porcentajes, presupuestos, entidades, tarjetas, deudas con cálculo, simulaciones y conexiones serán capacidades opcionales, disponibles cuando hagan falta. No habrá dos aplicaciones paralelas de «principiante» y «experto».

Decisiones de alcance:

- Inicio sin pestañas, enfocado en saldo registrado, mes actual y próximos compromisos.
- Sin selector global de mes que cambie silenciosamente todas las pantallas. Cada pantalla histórica mantiene su periodo explícito.
- Cuentas será acceso principal en móvil; Plan dejará de ocupar ese lugar prioritario.
- Categorías tendrá gestión propia, independiente de los porcentajes.
- Registrar un movimiento será el recorrido de referencia y tendrá menos decisiones iniciales.
- La búsqueda de movimientos estará siempre visible, fuera de Filtros.
- Programaciones y sus movimientos derivados tendrán procedencia reconocible, no solo un color.
- Se retirará la lectura de imágenes/OCR completa. Se mantienen importación y exportación Excel, iconos, logotipos y avatar de Google.
- No se reescribirá el libro contable ni se reiniciarán datos de usuarios para ejecutar este refactor.

## 2. Base de la propuesta y límites de la evidencia

La auditoría de origen está en `C:/Users/mangu/.codex/visualizations/2026/10/21/moneva-usabilidad/auditoria-y-plan.md`, con capturas y registros DOM en la misma carpeta.

Se revisaron 44 estados en tres tamaños: **132 capturas y registros**, no 132 pruebas funcionales independientes. Hubo inspección de código, formularios, navegación y escenarios locales reproducibles, sin escrituras de prueba en producción. No se ha realizado todavía una sesión observada con personas nuevas: la dificultad general procede del feedback del usuario, contrastado con problemas concretos de la aplicación.

La auditoría local no acredita OAuth real, administración privada, teclado físico de teléfonos ni sincronización real entre dispositivos. Estas comprobaciones se incorporan a la aceptación, no se dan por superadas.

Contratos que gobiernan la implementación:

1. [Sistema visual](../.interface-design/system.md): composición, marca, jerarquía, separadores y semántica.
2. [Formularios](./form-system.md): campos, editores móviles, validación, foco y recuperación.
3. [Movimiento](./motion-system.md): respuesta, transiciones, overlays, gestos y movimiento reducido.
4. [Dinero](./money-system.md): monedas, valoración, transferencias, tarjetas y obligaciones.

Skills aplicadas: `design-everyday-things`, `interface-design`, `accessibility`, `tgrep-search`, `supabase` y `supabase-postgres-best-practices`. En la implementación se añadirán las de pruebas de frontend, React y despliegue que correspondan a cada entrega. No se aplicarán patrones nativos o de videojuegos ajenos al producto por el solo hecho de tener esas skills instaladas.

El criterio de divulgación progresiva sigue a [Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/): las acciones frecuentes permanecen visibles y las secundarias aparecen a petición. La claridad de propósito y controles se contrasta con la [orientación cognitiva del W3C](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o1-understandable/); esto no sustituye una evaluación WCAG.

## 3. Lo que cambia y lo que se conserva

| Área actual | Problema concreto | Destino propuesto |
| --- | --- | --- |
| Inicio mezcla saldo, patrimonio y resultado mensual | Tener ahorro previo puede parecer insuficiencia de dinero | Saldo registrado separado del balance del mes; inversiones y deudas con nombre propio |
| Plan comienza por Distribución | Parece necesario repartir el 100 % para empezar | Presupuesto mensual primero; porcentajes y simulador como herramientas secundarias |
| Categorías dentro de Distribución | Clasificar un gasto obliga a entender porcentajes | Gestor de categorías independiente, con enlaces desde los selectores |
| Tipos de ingreso dentro de Cuentas | «Ingresos» parece dinero recibido, pero es configuración | Se traslada al gestor de categorías de ingresos sin cambiar sus identificadores |
| Registro comienza con OCR y muchas opciones | El gasto sencillo compite con las funciones avanzadas | Tipo, importe, cuenta y clasificación primero; repetición y detalles a petición |
| Búsqueda dentro de Filtros | No se descubre una tarea básica | Buscador persistente; Filtros reserva fechas, tipo y demás restricciones |
| Programados muestran poca relación con el historial | No queda claro qué se espera y qué se registró | Próxima fecha, cuenta, categoría, importe, estado y vínculo a su registro |
| Metas mezcla acciones de ahorro y deuda | Se ofrece una acción equivocada según el tipo | Un detalle y una acción principal acordes al tipo, sin formularios financieros incompatibles |
| Reportes abre un año con muchas secciones | Análisis avanzado antes de una respuesta clara | Mes actual por defecto; resumen y análisis ampliable, sin perder filtros ni Excel completo |
| Ajustes concentra mucho contenido desplegado | Hay demasiadas decisiones técnicas al entrar | Secciones por intención; conexiones e importación se abren solo cuando se necesitan |

No se cambian por estética: el significado de un ingreso/gasto, los importes nativos, las tasas históricas, los IDs, la propiedad de los datos, las relaciones entre transferencias, la cola offline ni las garantías de idempotencia.

## 4. Navegación e información

### Navegación principal

En móvil: **Inicio · Movimientos · Registrar (+) · Cuentas · Más**. Registrar será una acción, no una página ficticia ni una pestaña seleccionable. Cada destino tendrá nombre visible y área táctil del sistema; a 320 px no se resolverá ocultando etiquetas importantes.

Más agrupará Presupuesto, Metas y deudas, Reportes, Categorías y Ajustes, con una frase corta únicamente donde el nombre no baste. No será un segundo escritorio lleno de métricas.

En escritorio se mantendrán los destinos accesibles desde la navegación lateral. Se alinearán los nombres y su prioridad con móvil, sin esconder innecesariamente funciones aprovechando que hay más espacio. Administración seguirá condicionada al rol.

No habrá onboarding bloqueante ni navegación nueva para cada subtipo de producto financiero.

### Rutas y compatibilidad

- `/` continúa siendo Inicio.
- `/movimientos` conserva Historial, Programados y Calendario; son tres tareas relacionadas, no tres pasos obligatorios.
- `/cuentas` tendrá Cuentas y Tarjetas. La gestión de ingresos se retira de este hub, no se duplica.
- `/ajustes/categorias` será el gestor canónico, con vistas Gastos e Ingresos. También será accesible desde Más y desde el selector de categoría.
- `/presupuestos` abrirá el presupuesto mensual. Se conservarán `?vista=distribucion` y `?vista=simulador` para acceder a esas herramientas.
- `/metas` mantiene su ruta y pasa a presentarse como Metas y deudas.
- `/reportes` conserva sus filtros y enlaces históricos; `/ajustes` conserva las funciones existentes.
- El enlace antiguo `/cuentas?vista=ingresos` se adaptará al nuevo gestor. `/estructura`, que hoy redirige a Plan, apuntará al gestor de categorías. Los enlaces que realmente pretendan editar porcentajes usarán su vista explícita.

El traslado actualizará enlaces internos, enlaces del asistente cuando proceda, accesos de teclado, títulos y pruebas. No se renombrarán tablas para hacerlas coincidir con las etiquetas visuales. Los IDs y filtros existentes seguirán resolviendo los mismos datos.

## 5. Inicio: un vistazo comprensible, no otro reporte

### Orden de lectura

1. **Dinero en tus cuentas.** Saldo registrado de cuentas activas de efectivo, corriente y ahorro; por moneda, con equivalente estimado cuando proceda. Enlace a ver las cuentas que lo forman.
2. **Este mes.** Ingresos, gastos y diferencia del mes actual, con el nombre completo del mes. Explicación breve: «La diferencia del mes no incluye el dinero que ya tenías».
3. **Lo próximo.** Compromisos pendientes y alertas accionables. Sin avisos genéricos ni una pared de tarjetas vacías.
4. **Tus gastos.** Categorías con actividad; límites de presupuesto solo donde realmente estén configurados.
5. **Últimos movimientos.** Actividad reciente y acceso inequívoco al detalle de cada movimiento.
6. **Metas y deudas.** Resumen compacto, proporcional al contenido, sin duplicar el total de deuda de las tarjetas.

En escritorio se podrá componer una columna principal y una secundaria; en móvil conservarán ese orden de importancia. No se estirarán módulos cortos para rellenar huecos ni se añadirán separadores entre contenedores que ya están suficientemente separados.

### Corrección financiera prioritaria

Actualmente `dashboard-page.tsx` obtiene una proyección desde el resultado mensual. Esa cifra no debe llamarse cierre de dinero disponible cuando ignora saldos anteriores. Se retirarán del resumen las frases «cerrarías con» o «te faltarían» basadas únicamente en esa resta.

Ejemplo de aceptación: apertura de $10.000.000 y gasto de $200.000, sin ingreso del mes. Debe verse saldo de $9.800.000 y diferencia mensual de −$200.000. **No** debe afirmarse que faltan $200.000 ni que todo el dinero disponible es negativo.

Reglas adicionales:

- El cupo de tarjeta no es dinero propio disponible. La deuda de una tarjeta tampoco se vuelve a restar si ya está incluida en el agregado de pasivos.
- Inversiones, dinero líquido y patrimonio neto no se intercambian de etiqueta. Los detalles pueden mostrar los tres, pero el número principal no los mezclará.
- «Saldo registrado» no promete un saldo bancario consultado en vivo. Si incluye movimientos futuros ya registrados por la opción de anticipo, se indicará y se enlazarán esos registros. No se modificará silenciosamente esa política para maquillar Inicio.
- USD se presenta en USD; una suma combinada en COP lleva `≈` y contexto de tasa. Un equivalente sin cotización vigente no aparenta ser una TRM de hoy.
- Transferencias entre cuentas propias no se presentan como ingreso o gasto. El capital de préstamos y pagos de tarjeta conserva su tratamiento canónico.
- Las cifras salen de snapshots/agregados completos. No se recalcula un saldo desde la página de movimientos que casualmente esté cargada.

Una proyección de caja completa queda fuera de este refactor: requeriría alcance y cobertura propios. Mostrar lo previsto por separado es preferible a otra estimación de cierre que parezca dinero real.

### Estados de Inicio

| Estado | Presentación |
| --- | --- |
| Sin cuentas | Una invitación principal: «Añade tu primera cuenta»; explica saldo inicial; sin mosaico de ceros |
| Cuenta con saldo y ningún movimiento | Saldo útil desde el primer momento; «Aún no tienes movimientos este mes» y Registrar |
| Solo actividad de meses anteriores | Mantiene el saldo; no afirma que la persona no tiene dinero ni borra su historial |
| Sin distribución ni presupuesto | Gasto por categoría cuando exista; sin porcentajes vacíos ni advertencia de configurar Plan |
| Con distribución, sin límites | Puede contextualizar el reparto, pero no afirma que existe un límite de gasto |
| Con presupuesto | Gastado, límite y restante; previstos separados y sin doble conteo |
| Sin programados/metas | Omite bloques extensos; sugerencia secundaria discreta, no cinco tareas pendientes |
| Offline o cobertura parcial | Conserva lo conocido y señala su alcance; nunca muestra cero como sustituto de dato desconocido |

## 6. Primer uso, cuentas y categorías

### Empezar sin una clase

El primer recorrido será: añadir cuenta → indicar saldo inicial → registrar ingreso/gasto. Las categorías predeterminadas ya estarán disponibles. No se exigirá crear entidad, elegir colores, asignar porcentajes ni configurar presupuestos.

La ayuda vivirá junto a la decisión: «Pon cuánto tienes en esta cuenta al empezar. No se contará como un ingreso». Importar Excel será alternativa secundaria, no otro paso obligatorio. No se insertarán datos de demostración en cuentas reales.

Las recomendaciones se derivarán de datos reales. No se añadirá un booleano de «usuario nuevo» para impedir usar una cuenta ya existente ni se recreará el onboarding después de cada sincronización. Una ayuda descartable no contendrá estado financiero.

### Cuentas

- Directorio de cuentas antes de visualizaciones secundarias; acción Añadir cuenta fácil de encontrar.
- Al crear: nombre, tipo, moneda y saldo inicial. Icono/color con valores predeterminados y personalización disponible; entidad opcional en segundo nivel.
- Diferenciar «dinero que tienes» de tarjetas y otros pasivos. No llamar «cuentas» a la clasificación de ingresos.
- Entidades siguen siendo agrupadores sin saldo ni movimientos propios; muestran totales exactos separados por moneda y valoración combinada estimada.
- Conservar archivar/restaurar e historial. Antes de archivar, explicar el efecto en las vistas activas y advertir si existe saldo; no borrar ni mover dinero por archivar.
- Editar usa las mismas superficies, secciones y validación que crear; móvil a pantalla completa mediante `FormDialog*`.

### Categorías

Se extraerá la responsabilidad de clasificación de `FinanceStructurePage` y la de tipos de ingreso de `AccountsPage`, componiendo un gestor reutilizable. No se copiarán formularios con sus propias mutaciones.

Gastos mostrará categoría principal y sus subcategorías; Ingresos conservará los tipos existentes con una etiqueta comprensible. Crear, editar, ordenar, archivar e identificar por icono/color permanecerá disponible. Nunca se borrará historial para cambiar el nombre de una categoría.

Desde un movimiento habrá un acceso discreto a gestionar categorías que conserve el borrador y permita regresar. El selector seguirá siendo categoría principal → subcategoría; no se sustituirá por una lista plana enorme. Si faltan opciones, el estado explicará por qué y ofrecerá la acción adecuada.

## 7. Registrar y consultar movimientos

### Registro frecuente

Orden propuesto: tipo → importe → cuenta → categoría principal/subcategoría cuando corresponda → fecha. El tipo por defecto puede ser Gasto, pero será visible y editable. La fecha comienza en hoy, indicada explícitamente.

- Gasto/ingreso conserva la cuenta y clasificación correspondientes. Transferencia muestra origen, destino y, si cambian monedas, ambos importes y la tasa; no campos de gasto irrelevantes.
- Una única cuenta activa puede estar preseleccionada mostrando su nombre. Con varias, se puede recordar una última cuenta válida del mismo usuario; nunca sustituir una archivada por otra sin que se vea.
- El concepto se solicita de forma breve o se propone a partir de la categoría, editable y visible. No se saltará un requisito del dominio enviando cadenas vacías para simular menos campos.
- «Añadir detalles» contiene comercio, nota y vinculación opcional. El efecto sobre una meta solo aparece si hay una meta seleccionada.
- Las cuotas de una compra con tarjeta aparecen solo después de elegir esa tarjeta. No se ocultan datos obligatorios del producto bajo la etiqueta «opcional».
- «Se repite» abre la configuración de recurrencia. No hace falta entender «programado» antes de registrar un café.
- Al editar un dato avanzado ya existente, se muestra su sección abierta con sus valores; contraerla no los borra ni los cambia.
- Guardado local, en cola y sincronizado se distinguen; un error conserva el borrador. No prometer «guardado en la nube» sin confirmación.

### Historial

Sobre la lista: buscador visible, periodo activo, botón Filtros y resumen de restricciones. Accesos rápidos Este mes, Hoy y Todo el historial disponibles también en móvil con composición adaptable. El botón Exportar se mantiene accesible, pero no desplaza el buscador y las primeras filas fuera del primer vistazo.

El título corresponde al alcance: «Movimientos de octubre» no «Historial completo» cuando hay un filtro mensual. Limpiar filtros vuelve al estado explícito indicado por la acción, no a una fecha inesperada.

Fechas, tipo, cuenta, entidad y categoría se codificarán en los parámetros compartibles admitidos por `transaction-query.ts`. La búsqueda de texto se conservará en el estado de navegación de la pestaña, sin añadir términos financieros a nuevas URLs, logs o telemetría. Atrás/Adelante restablece periodo, consulta, scroll y movimiento abierto; una URL compartida sin texto seguirá mostrando su filtro estructural correcto. Los filtros actuales de Reportes no se reinterpretarán con este cambio.

La lista seguirá paginada. Al buscar, debounce de 250 ms como control de solicitudes —no token de animación—, cancelación/descarte de respuestas antiguas y una sola consulta por cambio estable. Sin filtrado falso únicamente sobre las filas cargadas.

### Detalle y edición

Pulsar una fila de Inicio, Historial, Calendario o Programados abrirá el registro preciso por ID. El detalle tendrá resumen legible y acción Editar; no dejará a la persona en una lista sin señalar qué seleccionó.

Se mantendrá la resolución de enlaces existentes. El estado de overlay distinguirá lectura y edición; los eventos actuales de editar abrirán edición explícita. El botón Atrás cerrará primero el detalle y devolverá al contexto anterior, sin resetear filtros ni perder una página cargada.

## 8. Programados y calendario

Se conservarán las tres vistas de Movimientos, con presentación más directa. En Programados: nombre, tipo, importe/moneda, cuenta o ambas cuentas, categoría cuando corresponda, frecuencia, próxima fecha y estado. En escritorio habrá encabezados útiles; en móvil los campos se convertirán en líneas etiquetadas, no columnas sin título comprimidas.

Habrá dos ejes distintos:

- **Naturaleza del dinero:** ingreso verde, gasto rojo y transferencia con el token informativo existente.
- **Procedencia/estado:** «Programado», «Registrado automáticamente», «Registrado por anticipado», «Pausado» o «Requiere revisión». Ámbar para reconocer programación, con texto e icono; no pintar todos los importes de amarillo.

Una expectativa no registrada nunca se presenta como movimiento ocurrido. Un movimiento automático del Historial sí será un registro real, con su procedencia y vínculo a la regla, aunque esta esté pausada o archivada. Se usará `recurringOccurrenceId` y datos relacionados sin una petición por fila.

Se respetará la opción solicitada de registrar al inicio del mes:

- Si la regla vence cada 24 y se activa el anticipo, se registra al comenzar el mes **con fecha financiera del día 24**.
- La interfaz separa «registrado el día 1» de «fecha del movimiento: día 24» y explica su efecto en el saldo registrado.
- Ese registro no vuelve a contarse como pendiente ni se duplica el día 24, al reintentar o al sincronizar otro dispositivo.
- La frecuencia y fecha ancla originales se conservan; febrero y días 29–31 siguen las reglas canónicas.

La etiqueta de automatización será «Registrar automáticamente en Moneva». Ayuda breve: «No realiza cobros ni pagos en tu banco». Las transferencias programadas entre monedas conservarán sus restricciones reales; no se habilitarán con una tasa inventada para hacer más corto el formulario.

Calendario conservará swipe con alternativa de botones, contexto de día y mes, leyenda breve y detalle al tocar. Se distinguirán registros y expectativas, sin marcadores que obliguen a adivinar su significado. La navegación de semana/mes no moverá verticalmente la página ni atrapará el scroll.

## 9. Presupuesto, distribución y simulador

La página pasará a presentarse como Presupuesto. Su entrada principal responde: «¿Cuánto quiero permitirme gastar y cuánto llevo?».

Distribución y Simulador seguirán disponibles como herramientas secundarias claramente enlazadas; dejarán de parecer pasos obligatorios de un proceso. Esta es una modificación deliberada del modelo anterior de tres subpestañas al mismo nivel. Se conservarán las URLs y las implementaciones financieras, no se duplicarán editores.

### Presupuesto

- Límites mensuales por subcategoría independientes de tener porcentajes.
- Agrupación por categoría principal, con total del límite, gastado y restante. Previsto pendiente por separado, no sumado dos veces a lo ya registrado.
- Ingreso esperado como referencia de planificación, no como saldo real. Poder configurar límites aunque esa referencia sea cero, sin división por cero ni mensaje engañoso.
- Acciones automáticas existentes de reparto o histórico con explicación y vista previa; no sobreescribir un borrador modificado sin avisar.
- Guardar el plan completo mantiene la operación atómica existente y su compatibilidad offline.

### Distribución opcional

- Los usuarios nuevos recibirán categorías utilizables pero fuera del reparto: `includedInPlan=false`, porcentaje 0. El modelo existente admite un plan vacío; no se añade una tabla o flag de activación solo para representarlo.
- Los usuarios existentes conservan sus porcentajes y presupuestos. No se inferirá que sus valores actuales son «predeterminados sin intención» para desactivarlos.
- «Configurar reparto» permite escoger categorías y repartir 100 %. Reparto igualitario y basado en otro mes continúan diferenciados; la suma final debe ser exactamente 100, con residuos de redondeo previsibles.
- «Dejar de usar porcentajes» será una acción explícita y confirmada que pone a cero/excluye las categorías de forma atómica. No elimina categorías, límites, movimientos ni metas. La confirmación avisa de que se restablece ese reparto; no promete conservar una configuración desactivada que el modelo no guarda.
- Un presupuesto sin distribución no se verá «incompleto» ni obligará a sumar porcentajes.

El cambio de semillas debe cubrir alta autorizada, fixtures, inicialización y el script de reinicio financiero. Las migraciones antiguas no se editarán. **Comprobación durante la implementación:** el aprovisionamiento vigente ya crea categorías en cero y fuera del reparto; por tanto no hizo falta una migración nueva. Véase el apartado 19.

### Simulador

Se mantiene aislado y sin escrituras financieras. Entrada «Probar sin cambiar tus datos», botón de copiar datos con alcance explícito, ingresos de prueba y filas etiquetadas. No será condición para crear presupuestos ni aparecerá como otra tarea pendiente del primer uso.

## 10. Metas, deudas y tarjetas

### Metas y deudas

La ruta `/metas` conservará las capacidades actuales pero las nombrará. Crear permitirá escoger meta de ahorro/inversión o deuda antes de presentar campos específicos; no se necesitará descubrir que «Nueva meta» también crea un préstamo.

Corrección prioritaria: en `financial-targets-page.tsx` el bloque de deuda heredada se está condicionando por ausencia de `liabilityOverview`, no suficientemente por tipo. Una meta de ahorro no debe mostrar «Esta deuda es de una versión anterior» ni Reducir/Aumentar deuda. Se añadirán pruebas separadas por tipo y por modelo heredado/canónico.

Primera capa: nombre, objetivo/saldo adeudado, moneda y avance o capital pendiente según el tipo. Icono y color conservan defaults; fechas, prioridad, vinculaciones y notas se revelan cerca de su propósito.

En deuda, «Solo llevar el saldo» utilizará el método manual canónico; «Calcular cuotas e intereses» mostrará los términos requeridos. No bastará con ocultar `required` de fecha/plazo: se adaptarán borrador, validación, preview, payload y pruebas para que el método manual sea realmente válido. Editar una deuda calculada no la convertirá en manual por defecto ni borrará su contrato.

Una tarjeta seguirá gestionándose en Cuentas → Tarjetas, no duplicada como otra deuda genérica. Conservar visibilidad agregada en Inicio/Reportes sin duplicar pasivos.

### Tarjetas

Mantener resumen simple: deuda registrada, cupo disponible y próximo pago; términos, cuotas, extractos y conciliación dentro del detalle. Distinguir estimación, cálculo y confirmación conforme al contrato de dinero.

El modelo actual requiere día de corte y de pago: se pedirán con lenguaje breve y ejemplo. No se inventarán valores si la persona no los conoce. Ampliar el dominio para tarjetas sin ciclo sería otra decisión, no una omisión de campos en este rediseño.

Revisar que un calendario del ciclo use el vencimiento de ese ciclo y que «próximo pago» pueda referirse al ciclo anterior. Son datos distintos; no se debe presentar un pago anterior al corte como si ambos pertenecieran al mismo periodo. Es un punto de verificación del refactor, no una declaración de fallo de todos los cálculos.

## 11. Reportes, ajustes y páginas públicas

### Reportes

- Entrada sin filtros guardados: mes actual. Una URL con periodo específico mantiene su alcance y los controles lo explican.
- Primera lectura: ingresos, gastos, diferencia y principales destinos del gasto, con periodo visible. Tendencia, cuentas/entidades, categorías, presupuestos y tablas exactas siguen disponibles en análisis ampliable.
- Cifras y gráficos vacíos no se renderizan como secciones grandes sin utilidad; mostrar ausencia de datos distinta de error o carga parcial.
- Metas y deuda viva se etiquetan como estado actual, fuera de los totales del periodo. No afirmar que TODO responde al filtro histórico si hay un bloque de estado presente.
- Mantener gráficos y Excel existentes, jerarquía más clara, encabezados y exportación completa según los filtros. Abrir/cerrar un bloque visual no cambia qué datos solicita o exporta el reporte.
- Reutilizar vocabulario y presentación de filtros, no fusionar a la fuerza el modelo de consulta de Reportes con el de Movimientos.

### Ajustes

Secciones por intención: Perfil, Apariencia, Categorías, Datos e importación, Conexiones y ayuda/estado. El contenido pesado se abre a petición. Importación explica formatos admitidos, vista previa, cuentas/saldos y categorías por crear antes de confirmar; no se toca su contabilidad para simplificar texto.

Conexiones conserva tokens, permisos y guía, pero no se consulta como requisito para ver Ajustes ni añade ruido a quien nunca la utilizó. No se cambia el contrato de la API de agentes en este trabajo; se actualizan enlaces y conceptos que hayan cambiado de ubicación.

Errores: mensaje orientado a recuperación, con detalle técnico consultable/copiar para soporte. No exponer SQL, nombres de tablas o stack traces como explicación principal al usuario. Nunca ocultar un fallo de escritura tras un mensaje de éxito.

### Públicas y estados globales

Login pone acceso con Google y condición de acceso privado antes de contenido secundario en móvil. Acceso denegado, offline, carga y ruta inexistente indican qué pasó y qué puede hacerse, con marca y componentes actuales. No se cambia OAuth ni se promete acceso por una acción visual.

El indicador de sincronización tendrá información accesible al tocar y al usar teclado; `title` por sí solo no será el canal de explicación. Diferenciar sin conexión, cambios pendientes y error de sincronización. El error no desaparece solo por cerrar el panel.

## 12. Retirada de lectura de imágenes

Retirada funcional y técnica, no solo ocultación de un botón:

1. Quitar la entrada de `QuickTransaction`, el componente `local-image-capture`, su estado y documentación de uso.
2. Retirar módulos OCR/captura y sus tests exclusivos, dependencias `tesseract.js` y datos españoles, scripts de sincronización y artefactos públicos exclusivos. Regenerar lockfile con el gestor del proyecto.
3. Corregir `predev`/`prebuild` sin perder generación de iconos y logotipos. Actualizar configuraciones que excluyan assets OCR para no dejar rutas especiales sin propósito.
4. En el service worker, retirar fetch/caché OCR y purgar solo la caché conocida `moneva-ocr-v1` y las variantes OCR documentadas que se encuentren. Respetar el mecanismo normal de actualización de shell.
5. No borrar IndexedDB, sesión, preferencias, movimientos locales, cola pendiente ni todas las cachés del origen.
6. Revisar permisos CSP de WASM/workers/rutas OCR y retirar únicamente los que sean exclusivos de esta función. Mantener los que utilicen otras capacidades legítimas.
7. Inventariar si existe persistencia remota real de OCR/adjuntos antes de proponer limpieza. No asumir que procesar imágenes localmente creó archivos en Supabase ni borrar Storage de otras funciones por coincidencia de nombre.
8. Prueba PWA: instalación antigua con caché OCR + cola financiera pendiente → actualización → OCR ausente, caché exclusiva retirada y cola financiera intacta/sincronizable.

## 13. Arquitectura y fuentes de verdad

| Trabajo | Piezas actuales a extender/recomponer |
| --- | --- |
| Navegación y nombres | `src/components/app-shell.tsx`, rutas de `src/app/(app)` |
| Inicio y estados | `dashboard-page.tsx`, `dashboard-state.ts`, `calculations.ts`, `portfolio-valuation.ts` |
| Alta/edición y feedback | `quick-transaction.tsx`, `ui/form-dialog.tsx`, `ui/form-control.tsx`, `mutation-feedback.ts` |
| Categorías y tipos de ingreso | `finance-structure-page.tsx`, `accounts-page.tsx`, mutaciones de `finance-provider.tsx` |
| Cuentas y tarjetas | `accounts-hub.tsx`, `account-select-options.tsx`, `credit-card-detail-page.tsx` |
| Historial y filtros | `transactions-page.tsx`, `transaction-query.ts`, componentes existentes de filtros |
| Procedencia y automatización | `recurringOccurrenceId`, reglas/ocurrencias, `movement-visuals.ts`, proveedor y consultas relacionadas |
| Presupuesto y herramientas | `plan-page.tsx`, `budgets-page.tsx`, `setMonthlyBudgetPlan`, operaciones atómicas de distribución |
| Metas y obligaciones | `financial-targets-page.tsx`, `financial-targets.ts`, `obligations.ts`, `credit-cards.ts` |
| Reportes y exportación | `reports-page.tsx`, `report-query.ts`, `detailed-report.ts`, `workbook-standard.ts`, `report-workbook.ts` |
| Sincronización | `finance-provider.tsx`, almacenamiento/cola y marcadores `serverRevision`/`externalRevision` existentes |

Las funciones monetarias no vivirán dentro de componentes visuales. Si el resumen necesita un agregado que el snapshot no ofrece, se extenderá su consulta canónica y sus tipos; no se descargará todo el historial ni se mantendrá un segundo saldo en React.

No se agregará una librería de UI, animación o gráficos por este refactor. Se conservan React/Next, Motion, Radix, Recharts y las primitivas de Moneva. Antes de escribir código de rutas o servidor se leerá la guía relevante de Next instalada en `node_modules/next/dist/docs/`, conforme a `AGENTS.md`.

Patrones compartidos a consolidar solo si hay varios consumidores: estado vacío orientado a una acción, ayuda contextual accesible, procedencia de movimiento y resumen de filtros. Se extenderán los componentes canónicos; no una nueva familia de tarjetas, diálogos y pestañas paralelas.

## 14. Datos, seguridad y compatibilidad

La modificación de datos prevista es limitada: actualizar el aprovisionamiento futuro para categorías sin reparto activo. No migrar a cero el reparto de personas existentes. La activación/desactivación solicitada por un usuario usa la operación atómica existente.

- Mantener IDs, dueños, categorías archivadas, monedas y relaciones. No ejecutar scripts de reinicio ni limpiezas generales: la aplicación ya tiene personas usándola.
- No modificar migraciones históricas. Toda modificación SQL será nueva, revisada contra la definición vigente completa y probada con su cadena de migraciones.
- La función de alta debe conservar acceso privado, aislamiento y los arreglos de contexto de permisos del aprovisionamiento. No conceder acceso amplio a tablas financieras al rol de Auth para acomodar el rediseño.
- Mantener RLS, comprobación de propietario y atomicidad. Ni la ocultación de una sección ni su navegación constituyen control de acceso.
- No cambiar formatos de cola por un simple cambio de ubicación. Si resulta imprescindible un nuevo campo, versionar serialización y soportar payloads de clientes anteriores.
- Revisar API de conexiones, importador Excel, exportador y script de reinicio frente a las mismas reglas de inicialización. La UI no será un segundo contrato de datos.
- Preservar resolución de conflictos, invalidación por revisión externa y reintentos. No solucionar incidencias borrando indiscriminadamente datos locales.
- Producción: respaldo y comprobación acotada antes de migrar; registrar exactamente qué cambió. Nunca probar un usuario ajeno mediante suplantación no autorizada.

La revisión del changelog y documentación Supabase se repetirá antes de implementar migraciones. Este plan no requiere habilitar servicios de pago, IA, Storage nuevo ni consultas masivas a producción.

## 15. Rendimiento y accesibilidad

### Rendimiento

Tomar línea base de bundle, carga de Inicio, solicitudes y latencia de búsqueda antes de cambiar. Comparar build de producción en el mismo entorno y con datos equivalentes; no atribuir al refactor diferencias de red o del servidor de desarrollo.

- Inicio usa agregados completos y listas cortas; no necesita cargar 10.000 movimientos.
- Listas paginadas, consultas estables y sin peticiones por fila. Evitar reconsultar toda la aplicación al abrir un detalle.
- Cargar análisis y herramientas costosas al necesitarlas. Retirar bytes OCR realmente, no solo posponer el componente.
- No animar todas las cifras/filas en cada filtro. Conservar los tokens y la reducción de movimiento.
- Mantener estados de carga de tamaño estable y respuesta inmediata del control, sin esperar la animación para iniciar una acción.
- Documentar medianas y dispersión de varias ejecuciones, coste en solicitudes y tamaño antes/después. Un fallo financiero bloquea aunque el benchmark mejore.

### Accesibilidad y composición

- Una acción principal por contexto, etiquetas permanentes, orden de foco y mensajes de estado anunciados sin interrumpir cada tecleo.
- Mínimos táctiles y medidas de control del sistema; botones con texto que no se corte al aumentar fuente.
- Color acompañado de signo, etiqueta e icono. Contraste comprobado en temas claros, oscuros y colores personalizados extremos.
- Editores fullscreen en móvil, un scroll principal, teclado que no tape acción/campo, foco restaurado y cinco ciclos de capas internas sin bloqueo residual.
- Separadores solo dentro de conjuntos donde ayuden a leer; nunca borde de sección + borde de lista + borde final vacío apilados. Revisar casos de cero y un elemento además de listas largas.
- Contenido adaptado por prioridades, no tablas de escritorio comprimidas. Las tablas analíticas necesarias tendrán scroll interno rotulado sin desbordar la página.
- Ayudas activables con toque y teclado. Gestos con alternativa. Verificación manual con lector de pantalla además de axe.

## 16. Entregas y dependencias

| Entrega | Alcance concreto | Condición para cerrarla |
| --- | --- | --- |
| 0. Seguridad semántica | Corregir mensajes de saldo/cierre, ahorro tratado como deuda y doble conteo registrado/previsto | Casos financieros reproducibles y tests de regresión; sin cambiar contratos monetarios |
| 1. Estructura y primer uso | Navegación, gestor de categorías, enlaces heredados y aprovisionamiento sin porcentajes obligatorios | Nuevo usuario puede tener cuenta y gasto sin tocar Plan; existente conserva datos |
| 2. Registro y retirada OCR | Formulario progresivo, detalles condicionales, eliminación de OCR/assets/caché exclusiva | Gasto, ingreso, transferencia COP/USD y tarjeta válidos; PWA/cola conservadas |
| 3. Movimientos y programados | Buscador, filtros, detalle por ID, origen/estado y lista programada más informativa | Encontrar histórico, volver al contexto y distinguir futuro de registrado sin ambigüedad |
| 4. Inicio | Jerarquía nueva y todos los estados de saldo/mes/presupuesto | Caso de arrastre correcto, datos parciales honestos, móvil y escritorio legibles |
| 5. Opcionales | Presupuesto primero, distribución/simulador secundarios, metas/deudas/tarjetas por intención | Se puede usar cada opción sin activar otra; edición no pierde contratos ni valores |
| 6. Coherencia global | Reportes, Ajustes, públicas, mensajes y documentación de patrones | Exportaciones conservan alcance; misma semántica y controles en todas las entradas |
| 7. Validación y publicación | Pruebas automatizadas, visuales, usabilidad observada y comprobación de despliegue | Criterios de salida completos y pendientes documentados; ninguna incidencia crítica abierta |

La entrega 0 fija el significado antes de pulirlo. La 1 establece dónde vive cada tarea. La 2 y la 3 completan el recorrido más frecuente. Inicio se compone después con esos mismos conceptos y componentes, no al revés. Las entregas son unidades revisables, no permiso para publicar a medias un recorrido roto.

Antes de programar las nuevas composiciones se revisarán wireframes de baja fidelidad de Inicio vacío/con saldo, alta de gasto, lista/Programados y gestor de categorías a 320 y 1440 px. Sirven para validar orden y comprensión, no para aprobar un diseño distinto al sistema vigente.

## 17. Plan de pruebas y criterios de salida

### A. Dominio y persistencia

Ampliar suites existentes (`dashboard-state`, `transaction-query`, `financial-targets`, contabilidad, recurrencia, presupuesto e importador), sin sustituir pruebas monetarias por snapshots visuales:

- Saldo previo positivo con mes negativo; cero actividad; sueldo sin gastos; solo gastos; saldos negativos reales.
- COP y USD por separado y juntos; tasa histórica distinta de la actual; offline sin tasa; cuenta archivada o eliminada de la selección actual.
- Transferencia propia y cruzada sin ingreso/gasto falso; apertura de cuenta no tratada como ingreso.
- Compra con tarjeta una sola vez, pago como transferencia, cuotas sin gasto duplicado, pasivo presente en más de una vista sin duplicar su agregado.
- Tres estados: sin reparto/limites, reparto sin límites y límites con/sin reparto. Distribución vacía o 100 exacto, categorías en 0 y excluidas, redondeo, alta/archivo y cambios concurrentes.
- Anticipo del día 24: registro el día 1, fecha del movimiento 24, reintento al 24 sin duplicación; febrero, bisiesto, 29–31, pausa/archivo y zonas horarias.
- Meta ahorro, inversión, deuda manual, deuda calculada, deuda heredada, tarjeta. Cada una solo ofrece su acción válida; editar no borra condiciones.
- Guardar offline, recargar, recuperar borrador, sincronizar, conflicto con otro dispositivo/API y reinicio autorizado de datos detectado por revisión.
- Aprovisionamiento autorizado de usuario nuevo, acceso no autorizado rechazado sin datos financieros y usuarios existentes preservados.
- Actualización desde PWA anterior con OCR y escritura pendiente. Prohibida la pérdida de cola o credenciales.

La cadena SQL y RLS se probarán localmente con las herramientas existentes y, cuando requieran Auth/PostgREST real, en un entorno de pruebas aislado. Producción solo recibirá verificaciones acotadas autorizadas; no una carga de 10.000 filas por usuario.

### B. Recorridos de extremo a extremo

Reutilizar y ampliar `navigation-history.spec.ts`, `movements-history-filters.spec.ts`, `dashboard-states.spec.ts`, `financial-targets.spec.ts`, `account-entities.spec.ts`, `reports-v2.spec.ts`, `import-planner.spec.ts` y las suites responsive/motion/offline pertinentes.

Recorridos obligatorios: empezar con saldo; registrar gasto/ingreso; transferir COP/USD; encontrar un movimiento viejo; abrir desde Inicio y regresar; crear/pausar programación; anticipar y verificar no duplicación; categorizar sin porcentajes; fijar un límite; aportar/pagar según tipo; consultar periodo y exportar Excel filtrado; editar con red caída y reintentar.

Se actualizarán expectativas por cambios deliberados de texto/ruta y se añadirán aserciones de significado. Los tests OCR exclusivos se retirarán con su función; en su lugar se verificará su ausencia y la limpieza segura de caché. No eliminar una prueba de dinero porque la interfaz cambió.

### C. Matriz visual e interacción

- Teléfono pequeño 320 × 720 y grande 430 × 932; Chromium táctil y WebKit.
- iPhone 15 Pro, Pixel 7, iPad Mini y tablet grande en las configuraciones del proyecto, con retrato/paisaje relevante.
- Escritorio 1440 × 900, 1920 × 1080 y 2560 × 1440.
- Claro, oscuro, Crimson y muestras personalizadas de bajo contraste potencial; zoom 200 %, teclado, toque y movimiento reducido.
- Datos vacíos, un elemento, pocos, muchos, etiquetas largas y límites monetarios válidos. Fixture local de 10.000 movimientos y cuentas con cientos de miles de millones.
- Capturas de página completa y zonas relevantes, revisión estética humana de cada composición y pruebas con animaciones activas. Sin errores de consola/ejecución ni overflow de página; scroll de tablas contenido dentro de su región.
- Foco, Escape, Atrás/Adelante, teclado móvil real y lector de pantalla. La emulación táctil no se presentará como una prueba en un dispositivo físico.

Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, suites E2E afectadas, `pnpm test:responsive` y `pnpm test:stress`. Leer la configuración real antes de seleccionar proyectos o ampliar comandos. Pruebas de integración y visuales usarán datos locales/aislados por defecto para cuidar cuotas.

### D. Comprensión con personas

Proponer una sesión corta con cinco personas nuevas, sin guía del propietario. La automatización no puede demostrar que entienden qué representa una cifra.

Tareas: empezar con dinero que ya tenían, registrar un gasto, encontrar el de un mes anterior, crear un gasto fijo y explicar qué ocurrirá, y decir cuánto tienen frente a cuánto gastaron este mes.

Objetivos de validación —no resultados ya obtenidos—: al menos cuatro de cinco completan el núcleo sin ayuda; nadie interpreta Moneva como una app que cobra en su banco; nadie confunde diferencia mensual con saldo total. Primera cuenta y primer movimiento idealmente en menos de tres minutos, gasto cotidiano en menos de treinta segundos una vez preparada la cuenta. Registrar bloqueos y lenguaje espontáneo, no solo preguntar «¿te gusta?».

Un error grave de modelo mental obliga a revisar el flujo, aunque pasen las pruebas automáticas. Si no se dispone de participantes, se informará expresamente y no se afirmará que la usabilidad ya fue validada con usuarios.

### E. Publicación y documentación

La publicación requerirá autorización de implementación, migración compatible antes del frontend si fuese necesaria, verificación del build desplegado y una comprobación corta de la URL canónica. No crear otra URL de producto ni pedir borrar toda la caché a los usuarios.

Actualizar los contratos visual/formulario con los patrones realmente implementados —sin reescribir identidad ni tokens—, guía de navegación, capturas de referencia y pruebas. Documentar qué se midió, qué pasó y qué quedó pendiente. Conservar migraciones compatibles para poder revertir el frontend sin perder datos.

## 18. Definición de terminado

No se considerará completo por tener pantallas nuevas o por superar una prueba de overflow. Deben cumplirse conjuntamente:

- Se puede empezar y registrar sin entender porcentajes, presupuestos, entidades ni contratos de deuda.
- Inicio explica saldo y mes sin contradicciones, incluso con arrastre y varias monedas.
- Búsqueda visible, historial completo accesible y detalle correcto sin perder el contexto.
- Programados explica fecha, registro, pendiente y automatización sin insinuar pagos bancarios reales.
- Las funciones avanzadas siguen siendo completas y accesibles, pero no dominan el primer uso.
- Ningún formulario oculta requisitos reales ni pierde valores avanzados al editar.
- OCR retirado de interfaz, dependencias y caché específica sin afectar sincronización.
- Identidad, dinero, formularios, movimiento y accesibilidad coherentes en todas las rutas afectadas.
- Datos y enlaces existentes preservados; pruebas financieras, SQL, regresión, visuales y límites de evidencia documentados.

La mejora buscada no es «menos funciones». Es que cada persona vea primero lo que necesita y pueda descubrir lo demás sin una explicación personal del desarrollador.

## 19. Registro de implementación y verificación

### Resultado implementado

- Navegación móvil: Inicio, Movimientos, Registrar, Cuentas y Más. Presupuesto, Metas y deudas, Categorías, Reportes y Ajustes siguen accesibles. Las etiquetas no se abrevian ni ocultan para acomodar 320 px.
- Inicio separa saldo de efectivo/corriente/ahorro del resultado del mes; inversiones y deuda no se presentan como dinero para gastar. Moneda nativa primero; equivalentes marcados como aproximados. Se retiró la falsa predicción de insolvencia basada exclusivamente en ingresos del mes. Gasto, actividad y compromisos preceden al análisis patrimonial opcional.
- Categorías de gastos e ingresos en `/ajustes/categorias`, con las mutaciones e IDs existentes. No exige porcentajes. Ordenar categorías conserva el reparto; restablecer porcentajes es explícito, confirmado y conserva los límites de presupuesto.
- Registro cotidiano con campos esenciales; «Se repite», detalles, icono y personalización de color se revelan cuando hacen falta. No se eliminaron condiciones de tarjetas ni conversiones COP/USD.
- Historial con buscador visible, accesos Este mes/Hoy/Todo, filtros completos y paginación. Periodo/filtros estructurales se conservan en URL; texto de búsqueda y cursor solo en el estado privado del historial, no en URL/referrer.
- Detalle de movimiento antes de editar, incluida procedencia de programación, fecha financiera frente a fecha de registro y tasa histórica. Si falta en la copia local se consulta solo ese registro y su pareja de transferencia, con propietario explícito y RLS; nunca se abre un formulario nuevo fingiendo ser el registro perdido.
- Programados mantiene fecha/repetición y registro anticipado; etiqueta ámbar de procedencia independiente del color financiero. El texto aclara que Moneva no realiza cobros bancarios y que un movimiento registrado por anticipado ya afecta al saldo registrado.
- Presupuesto primero; porcentajes y simulador como herramientas opcionales. Los borradores de herramientas visitadas se conservan al cambiar de vista. No se descargan todas las herramientas al entrar.
- Meta/deuda como primera elección. Deuda manual realmente válida sin fecha de cuota ni plazo inventados; cálculo avanzado explícito. Las metas de ahorro ya no muestran controles de deuda heredada.
- Reportes comienza en el mes actual de la zona horaria del perfil; URL explícita conserva su periodo. Análisis ampliable y exportación completa sin depender de qué bloques estén abiertos.
- Ajustes no consulta conexiones hasta abrirlas; login presenta primero la acción de acceso en móvil. Los estados calculado/manual/aproximado tienen ayuda activable con toque y teclado.
- Mensajes internos conocidos se convierten en instrucciones comprensibles. Los formularios principales conservan diagnóstico opcional para soporte; no hay envío automático.

### OCR, caché y datos

Se retiraron componente, lectores, tests exclusivos, dos dependencias directas y su subárbol del lockfile, script y ocho artefactos públicos exclusivos de OCR. La caché del shell pasa a `moneva-shell-v8`; la activación retira únicamente shells anteriores y `moneva-ocr-v1`. Se preservan IndexedDB cifrado, cola offline, sesión, preferencias y cachés ajenas. Una prueba ejecuta el service worker con CacheStorage simulado para comprobarlo. No equivale a una actualización observada en un teléfono físico.

La captura OCR eliminada procesaba imágenes localmente. No se encontró una ruta de subida de sus imágenes a Storage; no se ejecutó una limpieza remota indiscriminada. Excel, exportaciones, logotipos y avatar continúan.

La definición vigente de `private.provision_finance_user` ya crea las cinco categorías principales con `target_percent = 0` e `included_in_plan = false` (migración `20260904005458_seed_default_account_in_profile_timezone.sql`, manteniendo el acceso privado). Por eso **no se aplicó una migración redundante ni se cambió el reparto de nadie**. Se añadió una aserción al script de reinicio para proteger esta semilla; el script no se ejecutó. La revisión remota fue de solo lectura. Se confirmó RLS de `transactions`, política permisiva por `auth.uid()` y barrera privada restrictiva.

### Evidencia y límites

Build local de producción, con demo aislada y sin credenciales de Supabase. Evidencia en `C:/Users/mangu/.codex/visualizations/2026/10/22/moneva-usability/`.

- Las pruebas se ejecutan con Playwright/Chromium/WebKit disponibles en el proyecto; el plugin Browser no está disponible en esta sesión. No se ha simulado una prueba física ni una sesión de lector de pantalla.
- Se corrigió un desbordamiento real del filtro a 320 px y el recorte de la etiqueta de navegación. Las expectativas antiguas de pestañas, campos desplegados y fechas de fixtures se actualizaron conservando las aserciones financieras.
- Las fixtures de calendario/simulador fijan solo `Date`, no los temporizadores: su mes de referencia es agosto de 2026, independiente de la fecha de ejecución. Congelar todo el reloj producía ruido de prefetched RSC en WebKit durante navegación forzada; la verificación final no silencia errores generales de la app.
- Prueba local de 10.000 movimientos: paginación y cifras contenidas en móvil 320, tablet 600, escritorio 1080p y 2K. Exportación verificada leyendo el Excel generado: **10.000 filas**, 902.355 bytes, 2.746 ms en esa ejecución local. No es una promesa de rendimiento en todos los dispositivos.
- En esa muestra, Inicio tuvo 469–497 nodos DOM; la lista visible siguió paginada en vez de renderizar 10.000 filas. Se registraron tiempos por ruta. No se dispone de una serie temporal comparable del build anterior: no se afirma una mejora porcentual de latencia ni de Core Web Vitals.
- El análisis experto de comprensión es provisional: **8/10** en el diagnóstico de `design-everyday-things`. Hay evidencia técnica de feedback, recuperación, correspondencia control/resultado y restricciones; que una persona nueva descubra y comprenda todo sin ayuda todavía requiere observación. No se asigna 10/10 por pasar automatización.

Pendiente de validación humana: cinco personas nuevas sin guía, lector de pantalla/teclado móvil físico, OAuth real y sincronización real entre dos dispositivos. Estas comprobaciones no se sustituyen con axe ni con emulación y no se dan por realizadas.

### Bloqueo de dependencias resuelto antes de publicar

La auditoría final encontró 59 avisos en el grafo de producción anterior, incluidos cinco críticos. Se detuvo la publicación. Siguiendo el [aviso oficial del 14 de octubre](https://nextjs.org/blog/nextjs-security-update-october-14-2026), se actualizaron Next y su configuración ESLint a 16.4.1 y Sharp a 0.35.5. También se actualizaron dependencias transitivas compatibles y Vitest/coverage a 4.1.12. El CLI de shadcn pasó a herramientas de desarrollo, donde corresponde; no cambió la familia de componentes de la app. Los overrides son parches exactos, no saltos de versión mayor ni excepciones para ignorar avisos.

Resultado del registro de paquetes: **cero avisos en `pnpm audit --prod`**. La auditoría de todo el repositorio conserva **un aviso alto de `braces@3.0.3`**, usado por las herramientas de desarrollo; el registro todavía no publica 3.0.4 y el [aviso de GitHub no ofrece versión corregida](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). No se inventó un parche ni se silenció el aviso. Hasta disponer de él: no procesar patrones glob de terceros no confiables con esas herramientas ni exponer servidores de desarrollo. Este resultado no equivale a garantizar ausencia de vulnerabilidades.

También se adaptó Open Graph a los elementos SVG intrínsecos que exige el renderizador corregido, leyendo exactamente la geometría canónica del logo, y se habilitó su ruta estática pública sin abrir rutas financieras. La prueba verifica PNG de 1200 × 630 sin redirección de login.

Las pruebas se ejecutaron de nuevo sobre el build con las dependencias corregidas. No se ejecutaron exploits sobre la aplicación pública ni se modificaron permisos/datos para subsanar avisos de paquetes.

### Cierre de pruebas y publicación

Resultados sobre Next 16.4.1 y las dependencias corregidas:

| Comprobación | Resultado |
| --- | --- |
| Vitest, dominio/contabilidad/importación/SQL local/cola/cliente | 59 archivos, 377 pruebas aprobadas |
| Regresión de 17 suites, 3 dispositivos | 153 aprobadas, 21 omitidas por tamaño/plataforma |
| Responsive completo y axe | 30 aprobadas, 36 omitidas intencionalmente; responsive en 11 proyectos, axe en escritorio y móvil pequeño |
| Movimiento/gestos/calendario/reducción de movimiento | 25 aprobadas, 11 omitidas por plataforma |
| COP/USD y marca/Open Graph | 6 aprobadas, 2 omitidas por tamaño |
| 10.000 movimientos, 4 tamaños | 7 aprobadas, 5 omitidas para no repetir exportación/axe |
| Typecheck, ESLint, diff sin errores de whitespace y build optimizado | Aprobados |
| Auditoría del grafo de producción | Cero avisos |

En total: 377 pruebas unitarias/integración local y 221 ejecuciones E2E aprobadas en la matriz, con 75 casos no aplicables omitidos explícitamente. No son 221 tareas distintas observadas con personas. La suite nueva de simplificación está incluida en la regresión: 15 ejecuciones para arrastre de saldo, categorías sin porcentajes, detalle/edición, deuda manual, ausencia de OCR, conservación de límites y recuperación de un monto inválido.

Una ejecución de Vitest con alta concurrencia simultánea a navegadores agotó los 5 segundos de la prueba de permisos del cliente en Windows. La repetición completa con `pnpm test --maxWorkers=2` aprobó las 377 sin aumentar timeouts ni quitar aserciones. Los fallos intermedios de fixtures fuera de mes y selectores antiguos también se corrigieron y repitieron; no se presentan como pruebas exitosas.

Entrega mediante el proyecto Vercel existente y `main`, manteniendo `https://moneva-three.vercel.app`. El commit se identifica en el historial de Git y en los metadatos de la compilación de Vercel. La comprobación posterior al despliegue debe confirmar READY, SHA correcto, acceso público y límites de autenticación; no requiere escrituras financieras ni suplantar personas.

Las capturas de revisión están en la carpeta de evidencia indicada arriba. Para repetir la validación en futuros cambios: usar build optimizado, la matriz del proyecto y datos aislados; no ejecutar la demo ni las fixtures contra producción.

## Corrección tras feedback: Inicio y registro explícito — 22 de octubre de 2026

El feedback posterior mostró dos límites de la propuesta inicial: la divulgación ocultaba datos cotidianos (comercio y cuentas individuales) y las selecciones por defecto podían convertir una omisión en un registro equivocado. Esta revisión reemplaza esos patrones; no cambia el libro financiero ni la base de datos.

- Inicio prioriza cuentas individuales con saldo nativo, nombre y entidad como contexto. Nunca sustituye las cuentas por un único total de entidad. Se ven hasta seis y una acción con el conteo abre todas, también en móvil; cada una abre su historial completo filtrado.
- El total pasa a segundo plano, conserva el arrastre y distingue monedas. La explicación del saldo detalla apertura, ingresos, gastos, transferencias y ajustes. El resumen mensual explica ingresos menos gastos, no lo presenta como dinero disponible y conserva valores cero cuando no hubo actividad.
- Metas, deudas, tarjetas, próximos movimientos y planificación opcional siguen disponibles sin pestañas en Inicio. Las inversiones permanecen separadas del dinero de uso diario.
- Registrar inicia cuenta, destino, categoría, subcategoría, tipo de ingreso, importe y fecha sin seleccionar. «Usar hoy» es explícito; elegir una categoría no elige su primera subcategoría. Cambiar tipo limpia clasificación; pulsar el tipo ya activo no borra trabajo.
- Edición conserva los datos originales. Las acciones contextuales deliberadas —calendario, aporte, pago de tarjeta— conservan exclusivamente el contexto que envían, no se sustituyen por la primera cuenta.
- Comercio/etiqueta e icono y Descripción están visibles después de los campos principales. Luego se muestra recurrencia y sus condiciones; nota y vínculos son adicionales. Las validaciones anuncian y enfocan el campo pendiente, sin guardar ni limpiar el borrador.
- Correcciones compartidas: pestañas distribuidas por número real de opciones; una opción vacía deshabilitada ya no atenúa un select habilitado; reserva inferior de tablet mientras el botón sigue fijo; identidades React independientes para editores de entidad e ingreso. Se mantiene la misma geometría, paleta y movimiento de Moneva.
- La vista previa usa el mes elegido y el equivalente contable para gastos USD, no compara dólares con un presupuesto COP. Una programación no descuenta dinero de la vista previa antes de registrarse.

### Verificación de esta revisión

Evidencia aislada en `C:/Users/mangu/.codex/visualizations/2026/10/22/moneva-clarity/`. Se utiliza Playwright porque el plugin Browser no está disponible. No se inicia sesión como un usuario real, se reinicia su cuenta ni se ejecutan escrituras financieras en Supabase.

- 377 pruebas unitarias e integración local aprobadas; auditoría de dependencias de producción sin avisos conocidos.
- Matriz optimizada de 11 proyectos: 74 ejecuciones aprobadas y 36 omitidas intencionalmente por tamaño/plataforma. Incluye cuenta/destino/fecha/clasificación vacíos, recuperación de errores, comercio y descripción visibles, edición, varias cuentas de una misma entidad, COP/USD, contraste y dos pestañas sin columna vacía.
- Estados de Inicio, tarjetas, COP/USD y regresión de recorridos: 57 aprobadas, 3 omitidas. Incluye nuevo usuario, mes sin actividad, saldo previo, solo gastos, distribución, presupuesto y compromisos opcionales.
- Estrés local en 320 px y 2K: 4 aprobadas, 2 omitidas para no duplicar exportación/axe; 10.000 movimientos y cifras extremas, sin escrituras remotas.
- Tras el último pulido de tipografía y etiquetas, rebuild optimizado y repetición focal: 13 aprobadas, 2 omitidas. La vista previa de USD 100 representa COP 410.000 frente a un límite de COP 900.000 (46 %); transferir USD 20 a COP conserva USD 80 en origen y COP 762.000 en destino en la fixture. Los campos finales quedan por encima del botón fijo y la cifra focal conserva al menos 28 px también en escritorio.
- En desarrollo, un recorrido largo con compilación y axe superó el límite del test; la repetición del mismo recorrido en el build optimizado aprobó sin cambiar su límite ni retirar aserciones.

Estas comprobaciones no sustituyen observar a personas nuevas ni prueban dispositivos físicos, lector de pantalla o sincronización real entre dos dispositivos. No se afirma que el feedback de usabilidad quede resuelto únicamente por pasar pruebas automáticas.
