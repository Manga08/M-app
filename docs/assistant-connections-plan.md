# Plan de conexiones para asistentes y API de Moneva

Estado: plan implementado; conservado como registro de decisiones. Fecha: 21 de octubre de 2026.
El contrato operativo, límites afinados y alcance entregado están en `docs/assistant-connections.md`; la guía efectiva se genera desde las funciones instaladas.

## 1. Decisiones de producto

- Añadir **Conexiones** como sección de Ajustes, disponible para cualquier usuario autorizado. No añadir un destino a la navegación principal.
- La API HTTPS con token personal es el contrato principal. Un agente con herramientas HTTP o terminal puede consumirla desde su computador; la PWA no necesita permanecer abierta.
- Un cliente local pequeño facilita usar credenciales sin pegarlas en una conversación. No requiere hospedar un modelo, abrir puertos ni mantener un servidor local.
- MCP es un adaptador opcional del mismo catálogo de operaciones, permisos y reglas; no una implementación financiera alternativa.
- Presentar exactamente tres niveles: **Solo lectura**, **Lectura y modificación**, **Acceso total**.
- Lectura y modificación autoriza escrituras reales. Un borrador o una vista previa son herramientas opcionales; no se impone otra confirmación en Moneva por cada escritura ya autorizada mediante la conexión.
- Acceso total permite además bajas y archivos financieros admitidos por el dominio. Nunca equivale a administrar Moneva, gestionar usuarios o modificar la seguridad del propietario.
- Las reglas de dinero, propiedad, versiones y autorización se aplican en servidor/base de datos. El Markdown orienta al agente, pero no es una barrera de seguridad.
- El modelo y su coste pertenecen a la herramienta elegida por el usuario. Moneva no ejecuta ni factura inferencia en este flujo; sí consume sus recursos de infraestructura.

## 2. Base examinada y ajustes necesarios

| Área | Base local actual | Trabajo necesario |
| --- | --- | --- |
| Autenticación web | `src/proxy.ts` exige cookies y redirige a login | Separar el tratamiento de `/api/v1/*`: validar bearer y responder JSON, sin aceptar una sesión web como sustituto del permiso de integración |
| API HTTP | Únicamente `/api/trm` para cotizaciones públicas | Añadir API financiera versionada y controles de consumo |
| Escrituras | `remote-mutations.ts` combina RPC atómicas con escrituras directas | Centralizar las operaciones expuestas en comandos de dominio con permisos y versiones; no publicar nombres de RPC ni nombres de tablas |
| Concurrencia | Cuentas/pasivos verifican versiones; el upsert de movimientos no recibe una versión esperada | Añadir control de conflictos también a movimientos, categorías, presupuestos y programaciones expuestos, incluyendo el camino de la cola web |
| Reintentos | `mutation_receipts` conserva recibos de operaciones | Extender la identidad del recibo y la huella del contenido para detectar reutilización de una clave con otro cuerpo |
| Carga remota | `loadRemoteFinanceState` realiza numerosas consultas y carga ventanas particulares | Construir lecturas compactas específicas para agentes; no invocar el bootstrap completo en cada petición |
| Caché local | IndexedDB cifrada, cola durable y BroadcastChannel local | Añadir revisión financiera del servidor y reconciliación al volver a la app, sin perder la cola ni publicar una copia antigua sobre otra nueva |
| Reinicio | `financial_reset_generation` invalida datos locales | Invalidar tokens, cursores y planes pendientes al reiniciar; actualizar el script y sus verificaciones para las nuevas tablas |
| Captura IA | `architecture.md` exige revisión humana general | Documentar la excepción expresa para integraciones con escritura concedida por el usuario; mantener revisión en captura/importación interactiva cuando corresponda |

La revisión se basa en el código y las migraciones del repositorio. Antes de desplegar se comparará el esquema real con esa base. No se han probado endpoints de integración porque todavía no existen.

## 3. Experiencia de Conexiones

### Sección en Ajustes

- Título: **Conexiones**.
- Ayuda: «Permite que un asistente consulte o gestione tus datos con el acceso que tú elijas».
- Una acción primaria: **Crear conexión**.
- Listado continuo de conexiones propias: nombre, permiso, estado, vencimiento y último uso.
- Estados: sin conexiones, cargando, error con reintento, activa sin usar, activa utilizada, caducada y revocada.
- Las conexiones nunca se crean ni se revocan solo de forma local. Sin red, explicar que se necesita conexión para completar la acción.
- Actividad accesible bajo demanda. No cargar ni actualizar un listado de registros constantemente al abrir Ajustes.

### Creación

Formulario compacto canónico con tres campos visibles:

1. **Nombre**: ejemplo «Asistente de mi computador».
2. **Permisos**: selector de radio con las tres opciones y una explicación de una frase por opción.
3. **Vence en**: una hora, un día, siete días, treinta días, noventa días o fecha personalizada dentro del máximo vigente.

Propuesta inicial: Solo lectura y siete días por defecto, máximo noventa días. Son decisiones configurables del producto, no límites de proveedores. No incluir token indefinido en la primera versión.

Las fechas personalizadas se muestran en la zona del perfil y se almacenan como instante absoluto. La primera propuesta limita a diez conexiones activas por usuario; la cuota de uso sigue siendo compartida por propietario para que crear más tokens no la multiplique.

Al elegir acceso total, mostrar cerca del selector: «Podrá eliminar movimientos y archivar datos financieros cuando las reglas de Moneva lo permitan».

Al guardar, abrir un resultado de una sola aparición con:

- confirmación del permiso y vencimiento;
- **Copiar instrucciones** y **Descargar guía .md**, siempre sin secretos;
- **Copiar token** y **Descargar credencial privada**, únicamente mientras el secreto exista en memoria;
- tres instrucciones breves para instalar la credencial, entregar la guía al agente y verificar la conexión;
- explicación: «Por seguridad no podrás volver a ver este token. Si lo pierdes, crea otro».

Cerrar elimina el secreto de la memoria del componente. Nunca persistirlo en localStorage, IndexedDB, URL, estado de navegación, caché del service worker, analítica ni logs. Navegar o refrescar no lo recupera.

### Detalle y mantenimiento

- Renombrar, consultar actividad y revocar por conexión; además, acción de revocar todas.
- El permiso no se eleva automáticamente. Para ampliar el alcance, crear una conexión nueva y revocar la anterior; así los permisos que autorizó el usuario siguen siendo claros.
- Perder el secreto implica emitir otro, no recuperar el anterior.
- Revocación efectiva en servidor antes de mostrar éxito. Una petición ya confirmada antes de revocar conserva su resultado; después del éxito de revocación no se admite otra operación con ese token.
- Gestión de credenciales protegida por sesión web, verificación de origen/CSRF y autenticación reciente para emitir secretos o conceder escritura. Un token financiero no puede gestionar conexiones.

### Coherencia visual y accesibilidad

Aplicar `.interface-design/system.md`, `docs/form-system.md` y `docs/motion-system.md` sin crear otra familia de formulario.

- `SettingsGroup`, `FormDialogContent`, `FormDialogBody`, `FormDialogActions`, `FormControl`, `SelectControl`, `DateControl`, `Button` y `AlertDialog` existentes.
- Pantalla completa en móvil, un solo dueño del scroll, safe areas y controles de 52 px.
- Tres opciones apiladas en móvil, objetivos de 44 px o mayores, etiquetas permanentes y teclado completo.
- Superficies continuas y proximidad para agrupar; sin una colección de tarjetas ni separadores repetidos.
- El estado tiene texto e icono, además del color. El token se enmascara con revelación voluntaria durante la única entrega.
- Foco correcto al copiar, terminar, fallar, cerrar o revocar. `aria-live` para resultados, sin anunciar el secreto completo.
- Una sola acción primaria por estado. Guía extensa bajo divulgación, sin llenar el formulario de instrucciones técnicas.
- No hay interfaz implementada aún: la puntuación de usabilidad y accesibilidad queda pendiente de pruebas reales.

## 4. Matriz de permisos

| Acción | Solo lectura | Lectura y modificación | Acceso total |
| --- | --- | --- | --- |
| Consultar información financiera propia | Sí | Sí | Sí |
| Obtener reportes y exportaciones filtrados | Sí | Sí | Sí |
| Calcular simulaciones sin guardar | Sí | Sí | Sí |
| Crear y editar datos financieros | No | Sí | Sí |
| Registrar ingresos, gastos, transferencias o pagos | No | Sí | Sí |
| Crear/editar/pausar/reactivar programaciones | No | Sí | Sí |
| Eliminar movimientos o aportes manuales permitidos | No | No | Sí |
| Archivar cuentas, entidades, categorías, metas o deudas | No | No | Sí |
| Administrar usuarios, roles, tokens o configuración de seguridad | No | No | No |
| Ejecutar SQL, modificar esquema o reiniciar toda la cuenta | No | No | No |
| Acceder a datos de otro usuario | No | No | No |

Todos los niveles están disponibles a miembros autorizados, no solo al administrador. Cada conexión actúa exclusivamente sobre su propietario. El rol administrativo del propietario no se hereda.

«Total» conserva las reglas actuales: una cuenta con saldo o vínculos activos no se cierra; un extracto conciliado no se borra para saltarse su inmutabilidad; un archivo se describe como archivo y no como borrado físico. El error explica la precondición y ofrece la acción de dominio que corresponda.

La política se basa en acciones registradas, no en el verbo HTTP: una consulta agrupada mediante POST sigue siendo solo lectura.

## 5. Credencial e instrucciones para el agente

### Guía pública

La guía descargable/copiable `MONEVA_AGENT.md` incluirá:

- propósito de Moneva y alcance de la conexión;
- URL estable y versión del contrato;
- cómo obtener contexto, capacidades y esquemas;
- catálogo permitido, filtros, paginación, lotes y ejemplos;
- monedas, fechas, entidades, presupuestos opcionales, tarjetas y deudas;
- idempotencia, conflictos y tratamiento de errores;
- instrucciones de credenciales y privacidad;
- cómo verificar el resultado de una operación sin releer toda la cuenta.

Generarla a partir del mismo registro de operaciones que OpenAPI y las validaciones. No mantener tres catálogos manuales divergentes. El permiso real se consulta al servidor, no se infiere de una copia antigua del MD.

La guía de entrada está en `docs/assistant-agent-guide.md`. La versión técnica operativa se genera en `/api/v1/guide` desde el catálogo instalado.

### Credencial privada

La credencial opcional se entrega como JSON separado, con URL de API, versión de formato, ID público de conexión, expiración y token. No contiene datos financieros ni credenciales de Google/Supabase.

- Instalación fuera del repositorio, Descargas y carpetas compartidas/sincronizadas; usar la carpeta privada de configuración del usuario.
- Preferir el almacén de credenciales del sistema cuando el cliente local lo soporte. El archivo es la alternativa portable, con ACL de propietario en Windows y permisos restrictivos en macOS/Linux.
- Descargar un archivo no lo cifra ni restringe automáticamente sus permisos. La instalación debe comprobar o aplicar la protección y recordar eliminar la copia temporal de Descargas.
- El cliente local lee el secreto y construye el header Authorization sin imprimirlo ni incluirlo en argumentos de terminal o en ejemplos con el valor real.
- El agente recibe el MD y la ruta/configuración del cliente. No necesita recibir el token como texto del chat.
- No ofrecer por defecto un MD con el secreto incrustado. Facilitaría que acabara en Git, historiales y conversaciones.
- Este manejo reduce la exposición accidental; un agente/proceso con permiso para leer el archivo aún puede extraerlo. Caducidad, permisos y revocación en servidor siguen siendo las barreras reales.

El cliente local será opcional, pequeño y sin dependencias de proveedor de IA. Puede distribuirse como script Node con una versión mínima explícita y probada. No ejecuta código o URLs arbitrarias recibidas en respuestas, no sigue redirecciones con Authorization a otro origen y nunca opera como proxy HTTP genérico.

## 6. Contrato HTTP propuesto

Base: el origen estable de Moneva + `/api/v1`. Usar el origen canónico configurado, no una URL efímera de preview ni el header Host sin validar.

| Ruta propuesta | Finalidad |
| --- | --- |
| `GET /api/v1/capabilities` | Permiso vigente, acciones disponibles, límites y versión; permite probar acceso |
| `POST /api/v1/context` | Contexto seleccionado y compacto de varios dominios en una petición |
| `POST /api/v1/query` | Lote de lecturas tipadas, filtros y cursores por conjunto |
| `POST /api/v1/commands` | Lote atómico de comandos tipados de dominio |
| `POST /api/v1/preview` | Validar/proyectar efectos sin guardar; opcional antes de una escritura |
| `GET /api/v1/operations/{id}` | Consultar el resultado propio tras una respuesta perdida |
| `GET /api/v1/openapi.json` | Especificación pública sin datos ni secretos |

Cada respuesta identifica `apiVersion`, `requestId`, hora del servidor y, cuando contiene datos, revisión financiera y fecha de corte. Errores estructurados con código, mensaje humano, campo/comando afectado y reintento permitido.

`context` incluye capacidades vigentes y límites en su respuesta; una tarea normal puede empezar directamente con esa llamada. `capabilities` queda como consulta ligera para diagnóstico o descubrimiento sin cargar datos financieros.

Estados previstos: 401 token inválido/caducado/revocado; 403 permiso o autorización insuficiente; 404 recurso no disponible sin revelar otro propietario; 409 conflicto de versión o idempotencia; 413 cuerpo excesivo; 422 regla/dato inválido; 429 límite con Retry-After; 503 indisponibilidad temporal.

Importes serializados como cadenas decimales normalizadas con moneda explícita. Fechas de negocio `YYYY-MM-DD`; timestamps de creación/registro separados y con zona inequívoca. La API no depende del formato visual es-CO.

El cliente no envía `userId`, roles, claims ni nombre de RPC para decidir el actor. El servidor lo obtiene de la credencial verificada.

## 7. Catálogo transversal de operaciones

| Dominio | Consultas | Comandos y reglas compartidas |
| --- | --- | --- |
| Inicio | Resumen mensual, patrimonio, próximos compromisos y alertas | Datos derivados; no editar saldos o alertas como totales independientes |
| Entidades y cuentas | Activas/archivadas, saldos nativos, equivalentes y movimientos | Crear/editar, agrupar/desagrupar, conciliar saldo y archivar con precondiciones |
| Movimientos | Historial completo filtrable y detalle | Ingresos, gastos, transferencias, corrección y baja atómica de ambas partes de una transferencia |
| Categorías y tipos de ingreso | Principales/subcategorías, orden y estado | Crear/editar/ordenar/archivar sin romper vínculos históricos |
| Distribución y presupuesto | Plan opcional, porcentajes y presupuestos por mes | Cambios conjuntos; reparto de 100% y presupuesto respetan sus invariantes |
| Programados | Regla, próximas ocurrencias, estados y fechas | Crear/editar/pausar/reactivar/archivar; acciones de ocurrencia permitidas; reintentos coordinados con cron |
| Metas | Objetivo, avance y vínculos | Crear/editar, estado y aportes usando el seguimiento canónico; no duplicar avance ligado a movimientos |
| Deudas | Saldo, términos, tasas, cuotas, compromisos y certeza | Alta/edición, términos, pagos, conciliación, reglas de pago y archivo |
| Tarjetas | Cupo, deuda, ciclos, compras, cuotas y extractos | Alta/edición, compra financiada, pago y conciliación mediante el motor existente |
| Reportes/Excel | Filtros y agregados del reporte completo | Exportación bajo demanda con los generadores existentes, sin guardar archivos en Storage |
| Simulador | Escenarios y resultados calculados | Cálculo sin guardar; no convertir simulaciones en apuntes por un cambio de endpoint |

La implementación entrega y verifica este catálogo por dominio. `capabilities` solo anuncia operaciones implementadas y probadas para el permiso vigente. No publicar un permiso de escritura con comandos simulados o dominios documentados pero inexistentes.

Lectura no debe ejecutar funciones con efectos de materialización/publicación. Revisar expresamente getters heredados y triggers para impedir que una consulta de solo lectura cree movimientos, obligue a guardar proyecciones o actualice finanzas.

Las imágenes, audios y documentos se procesan en la herramienta externa. Esta API recibe datos estructurados y no introduce almacenamiento de archivos ni de conversaciones. Los campos sensibles ya excluidos por el modelo continúan excluidos.

## 8. Agrupación y consumo

### Contexto orientado a la tarea

El agente puede pedir en una sola llamada: resumen del mes, cuentas/entidades, categorías, presupuesto, metas, pasivos y próximos programados. Elige bloques mediante `include`; por defecto no se devuelve todo el historial ni todos los calendarios.

La lectura agrupada tiene un RPC/dispatcher específico y agregaciones SQL por conjuntos. No se implementa invocando el bootstrap web ni haciendo una consulta por cuenta, fila o cuota. El contexto debe corresponder a un corte coherente, con revisión conocida.

Una llamada HTTP puede ejecutar varias operaciones SQL. Agrupar reduce viajes, autenticaciones y transferencia repetida; no garantiza reducir el cómputo de una agregación costosa. Medir también tiempo de base de datos, filas examinadas y bytes enviados.

### Escrituras agrupadas

- Varias operaciones relacionadas pueden enviarse en una petición y una transacción corta.
- Cada comando tiene ID estable y puede referenciar IDs temporales creados en el mismo lote mediante un mecanismo tipado, sin ejecutar expresiones arbitrarias.
- Todos los permisos, versiones y precondiciones se validan dentro de la transacción.
- Si falla un comando se revierte el lote; identificar el comando y devolver `committed: false`. No reportar éxitos parciales inexistentes.
- La respuesta incluye IDs, versiones, cambios efectivos, revisión y recibo para evitar una lectura posterior solo para confirmar.
- No permitir lotes anidados, SQL libre, GraphQL arbitrario, consultas HTTP externas ni un RPC elegido por el agente.

### Límites iniciales para medir y ajustar

Propuesta de partida: hasta 10 bloques de lectura por lote, 50 comandos de escritura, 100 movimientos por página (máximo 200), cuerpo de 256 KiB y respuestas paginadas antes de 1 MiB. Un reporte agregado puede cubrir años, pero devolver detalle exige paginar; las proyecciones complejas tienen sus propios topes de horizonte/cuotas.

Estos límites se publican en capacidades. El cliente divide un trabajo grande y comunica los lotes ya confirmados si uno posterior falla; no promete atomicidad entre peticiones diferentes. Las transferencias y otras unidades indivisibles nunca se separan entre lotes.

- Paginación por cursor estable con desempate por ID; advertir si cambió la revisión durante una lectura larga.
- Agregados calculados en servidor; no descargar 10.000 movimientos para sumar un mes en el modelo.
- Conteos exactos y detalle extenso solo cuando se soliciten.
- Cotizaciones públicas reutilizan la caché de TRM; se mantienen separadas de las respuestas financieras privadas.
- Respuestas financieras usan `private, no-store`. Cualquier validación condicional futura requiere autenticar y verificar revisión antes de omitir un cuerpo; no usar caché pública de CDN ni PWA.
- Límite de frecuencia y trabajo acumulado por conexión y por usuario, no solamente por IP o petición. Un lote consume presupuesto según su coste.
- Contadores compartidos y atómicos; no depender de memoria de una instancia de Vercel. Evitar logs y escrituras de last-used por cada fila.
- Tiempo máximo de consulta/lote y backoff acotado con Retry-After. No polling continuo de credenciales, historial o estado.
- Rechazar cuerpos excesivos antes de parsearlos por completo y limitar intentos fallidos. Las peticiones inválidas también tienen coste: el control temprano complementa la cuota autenticada sin depender de una prestación de pago no confirmada.
- Registro acotado: actividad detallada de conexiones hasta 30 días como propuesta inicial; contadores agregados diarios; recibos de escritura al menos durante la ventana de reintento documentada.
- Limpieza programada de metadatos operativos, sin eliminar la auditoría contable ya exigida por el dominio.

## 9. Autorización y persistencia

Proponer tablas privadas, con nombre definitivo decidido al implementar:

| Registro | Datos mínimos |
| --- | --- |
| Conexiones | Propietario, nombre, nivel, prefijo público, huella, creación, vencimiento, revocación, generación de reinicio y uso aproximado |
| Uso agregado | Conexión/usuario, ventana de cuota, trabajo y bytes; actualización atómica |
| Recibos de integración | Propietario, conexión, ID de operación, huella del cuerpo y resultado; integrados con recibos financieros canónicos |
| Revisión financiera | Marcador monotónico por usuario, distinto de la generación de reinicio |

- Secretos aleatorios de al menos 256 bits de entropía. Conservar únicamente su huella criptográfica y un prefijo público identificable.
- Validez calculada contra el reloj del servidor en cada operación. No requiere un cron para caducar.
- Verificar propietario, allowlist vigente, revocación, vencimiento, generación y acción permitida en el punto de ejecución. No cachear decisiones de permiso indefinidamente.
- Gestión propia por sesión web. No conceder SELECT de hashes al navegador ni publicación Realtime de secretos.
- El gateway usa una credencial exclusivamente de servidor. La entrada a la base de datos es una función cerrada, ejecutable únicamente por el rol backend, que verifica la conexión y despacha acciones de un catálogo fijo.
- Si se usa un wrapper en el esquema público para PostgREST, revocar EXECUTE a PUBLIC, anon y authenticated. La lógica privilegiada vive en private con search_path vacío y checks explícitos de propietario/permiso en cada acción.
- No emitir a un agente un JWT de sesión con los permisos generales de authenticated para representar el token opaco. No aceptar un hash o una identidad del cliente como autoridad.
- Adaptar funciones de dominio para un actor verificado y preservar RLS para clientes normales. No confiar en que una clave backend privilegiada vaya a imponer RLS automáticamente.
- No ejecutar SQL financiero arbitrario desde los Route Handlers ni abrir una ruta genérica de Supabase.
- Revocación y escrituras se coordinan transaccionalmente. Probar la carrera entre un lote y la revocación.
- No registrar Authorization ni cuerpos completos de solicitudes; auditoría con IDs, tipo de acción, conexión, hora, resultado y cantidad. Los errores no exponen SQL ni credenciales.

La integración no puede cambiar su permiso ni consultar/crear otros tokens. Un usuario inhabilitado pierde acceso API aunque su token aún no haya caducado.

## 10. Concurrencia, borrados y sincronización

1. Cada mutación requiere `operationId`/clave idempotente estable. Repetir el mismo contenido devuelve el recibo previo; reutilizar el ID con contenido distinto responde 409.
2. Cada edición/baja incluye la versión esperada. No sustituir una versión antigua por la actual silenciosamente ni reintentar sobrescribiendo al otro actor.
3. Actualizar también las mutaciones de la app que puedan reponer una copia antigua. Proteger únicamente la API no resuelve una cola web anterior que se publique después.
4. Incorporar borrados/tombstones o deltas suficientes para que la caché no resucite filas eliminadas.
5. Incrementar revisión financiera en todos los caminos pertinentes: web, API, imports, cron y operaciones administrativas, con consolidación por transacción cuando proceda.
6. Al recuperar foco/visibilidad y al reconectar, comprobar revisión con deduplicación y cooldown. Si no cambió, evitar la recarga completa; si cambió, reconciliar respetando la cola durable.
7. Una revisión nueva invalida los rangos afectados de historial, reportes y calendarios; no actualiza solo el resumen del inicio.
8. Si hay conflicto local/remoto, conservar el trabajo y comunicar qué elemento cambió. No descartar la cola ni mostrar sincronizado falsamente.
9. Realtime puede añadirse más adelante si el coste lo justifica; el primer flujo no depende de sockets ni polling constante.
10. Un reinicio financiero revoca conexiones previas e invalida operaciones pendientes/cursores. El script cubre expresamente las nuevas tablas privadas y conserva su garantía de transacción completa.

## 11. Reglas que todos los clientes comparten

- COP y USD mantienen importes nativos; equivalentes históricos conservan tasa/fecha/fuente. Un cálculo aproximado se identifica como tal.
- Las entidades agrupan; solo las cuentas reciben apuntes.
- Transferencias: ambas partes forman una sola unidad financiera, incluso al editar/eliminar; comisión como gasto separado.
- Categorías y cuentas archivadas sirven para historial, no como destino nuevo de captura.
- Distribución y presupuesto son opcionales. No inventar ni activar un plan porque un usuario nuevo todavía no tenga uno.
- Una compra con tarjeta crea el gasto una vez. Pago de capital y cuotas previstas no duplican ese gasto.
- Conciliaciones y nuevas tasas afectan lo permitido por el motor; no reescriben evidencia histórica bloqueada.
- Programaciones distinguen día de registro, fecha del movimiento, repetición y zona horaria; conservan la opción de registrar al inicio del mes con la fecha asignada.
- Cron y API no generan dos veces una misma ocurrencia. Usar la misma clave y bloqueo de dominio.
- Simulaciones no crean datos financieros. Proyecciones identifican confirmado, calculado, aproximado o manual.
- Ninguna llamada HTTP ejecuta inferencia. Los comandos reciben datos estructurados y errores identificables.

## 12. API y MCP

La API con token es la primera entrega funcional. OpenAPI describe acciones y errores para clientes que conozcan HTTP. El cliente local es una comodidad, no una dependencia obligatoria.

MCP local por stdio puede envolver el cliente existente usando la credencial privada, sin un nuevo puerto ni otra política financiera. Se añade después de estabilizar el contrato.

MCP remoto con OAuth requiere autorización/discovery compatibles, validación de audiencia y revocación; no se presenta el token personal opaco como un servidor OAuth completo. Reutiliza el mismo catálogo y permisos. La autenticación OAuth de Supabase no restringe por sí sola las tablas mediante openid/profile/email: deben aplicarse controles de acceso reales.

Una herramienta necesita capacidad para invocar HTTP, terminal o MCP. No prometer que cualquier chat o cualquier plan comercial tendrá conexión. La API permanece independiente del proveedor del modelo y de su suscripción.

## 13. Implementación por etapas y entregables

1. **Contrato y seguridad:** esquema OpenAPI compatible con clientes objetivo, registro de acciones, permisos, modelos monetarios, tablas privadas, token gateway y pruebas de aislamiento/revocación.
2. **Lecturas eficientes:** contexto, capacidades, consultas agrupadas, filtros, cursores, reportes y simulación; medir coste real con datos grandes.
3. **Comandos:** adaptar los dominios del catálogo, versiones, recibos, lotes atómicos y manejo de bajas; cubrir también los caminos web/offline.
4. **Conexiones y entrega:** sección Ajustes, creación, resultado de única visualización, guía generada, credencial privada, cliente local y actividad.
5. **Sincronización y reset:** revisión/deltas, conflictos, actualización de pantallas, reset script y pruebas multiusuario/dispositivo.
6. **Validación y publicación:** migraciones ensayadas localmente, build/tests, verificación visual, despliegue y smoke de producción acotado sin modificar finanzas reales de usuarios.
7. **Adaptadores opcionales:** MCP stdio y después OAuth remoto, sin duplicar comandos ni cambiar el API estable.

Documentos finales: guía de integración para agentes, OpenAPI generado, contrato de API/seguridad, operación de cuotas/retención/revocación, arquitectura actualizada y script de reinicio actualizado. Añadir al sistema de formularios solo patrones nuevos realmente necesarios.

## 14. Matriz de aceptación

### Autorización

- Propietarios A/B, miembro/admin, allowlist habilitada/deshabilitada, token válido/caducado/revocado/manipulado/generación antigua.
- Las tres modalidades contra cada operación, incluidas consultas POST, lotes mixtos y parámetros con IDs de otro usuario.
- Probar accesos directos a wrappers de base de datos como anon/authenticated; no deben saltarse el gateway.
- Ningún secreto en HTML persistido, service worker, logs, errores, documentación, capturas, clipboard automático o historial de terminal.
- Rechazar elevación de permisos, cambios de rol, gestión de tokens y comandos desconocidos incluso en acceso total.
- Probar datos con instrucciones hostiles: una descripción financiera es contenido, no código, URL ejecutable ni autorización para el cliente.

### Integridad

- COP/COP, USD/USD, COP/USD y USD/COP; edición/baja de una transferencia completa; tasa/fechas inválidas, redondeo y cifras grandes.
- Reintentos simultáneos, misma clave/otro cuerpo, respuesta perdida y consulta de recibo, rollback completo ante fallo intermedio.
- Plan desactivado y activo; suma cero o 100%; presupuestos independientes y avisos coherentes.
- Metas con aportes manuales/vinculados; compras de tarjeta, cuotas, pagos, conciliaciones y deudas con historial inmutable.
- Programaciones en inicio de mes, días 29–31, febrero/bisiesto, diferentes zonas, moneda y carreras con cron.
- Dos agentes más una pestaña offline editando el mismo objeto; no hay pérdida silenciosa ni resurrección tras baja.
- Reset antes/durante/después de un comando; no se reutilizan tokens, IDs o colas de la generación anterior.

### Consumo y rendimiento

- Datos vacíos, pocos datos y 10.000 movimientos, múltiples entidades/monedas, pasivos y textos largos.
- Medir peticiones HTTP, viajes a Supabase, tiempo SQL, filas examinadas, escrituras operativas y bytes de respuesta.
- Una lectura de contexto y un lote no deben producir un viaje por elemento. Las páginas mantienen memoria y tamaño acotados.
- Pruebas de cuota por conexión/usuario y concurrencia; un lote no evita el límite; 429 produce reintento acotado.
- Limpieza de metadatos, ausencia de polling innecesario y aislamiento de caché privada.
- Objetivos de latencia se fijan después del benchmark con región/datos reales; no publicar promesas sin medición.

### Interfaz y cliente local

- 320 px y teléfono grande, iPhone/WebKit y Pixel/Chromium, tablet pequeña/grande, escritorio 1440/1080/2K.
- Claro, oscuro y Crimson; teclado, zoom 200%, foco, safe areas, scroll único, Atrás/Adelante, motion reducido y axe.
- Crear/cancelar/fallar/reintentar, copia denegada, token perdido al cerrar, descarga privada, caducidad y revocación concurrente.
- Cliente local probado en Windows/macOS/Linux con credencial protegida; timeout, desconexión, límite, respuesta perdida y origen incorrecto.
- No necesita la PWA abierta ni un modelo/proveedor concreto. Verificar una interacción HTTP real contra un backend de prueba.
- Test, typecheck, lint y build; SQL de seguridad/regresión y smoke del contrato desplegado. Cargas masivas y datos sintéticos se mantienen locales.

## 15. Fuentes y contratos

- Contratos del proyecto: `.interface-design/system.md`, `docs/form-system.md`, `docs/motion-system.md`, `docs/money-system.md` y `docs/architecture.md`.
- Next.js instalado: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- [OpenAPI](https://spec.openapis.org/oas/latest.html): contrato HTTP independiente del proveedor.
- [MCP: autorización](https://modelcontextprotocol.io/specification/latest/basic/authorization): transporte HTTP/OAuth y credenciales en stdio.
- [Supabase: Token Security & RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security): los scopes OIDC no limitan tablas ni endpoints financieros.
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html): mínimo privilegio, caducidad, revocación y no registrar secretos.

Las expiraciones, límites de lote, páginas, cuotas y retención de este documento son propuestas de Moneva y se ajustan con medición; no representan garantías o precios de Supabase/Vercel.
