# Conexiones personales — contrato operativo

Implementación del plan `assistant-connections-plan.md`. La fuente de rutas y campos vigentes es `/api/v1/openapi.json`; la guía generada y libre de credenciales vive en `/api/v1/guide`.

## Producto

Ajustes → Conexiones. No hay un nuevo destino principal ni hace falta mantener la PWA abierta. Cada persona autorizada puede crear hasta diez accesos activos, con nombre, permiso y vencimiento. Por defecto: solo lectura durante siete días; opciones de una hora, un día, siete, treinta, noventa y fecha personalizada en su zona horaria. Crear exige autenticación Google de los últimos treinta minutos. Renombrar, consultar actividad y revocar no solicitan una nueva credencial.

| Nivel | Autoriza | Nunca autoriza |
| --- | --- | --- |
| `read` | Contexto, consultas, reportes y simulación sin guardar | Mutaciones reales |
| `write` | Además, crear/editar finanzas y registrar movimientos reales | Borrar movimientos o archivar información |
| `full` | Además, bajas y archivos que admita el dominio | Usuarios, roles, allowlist, seguridad, tokens de otros o administración |

Un permiso financiero no permite saltar reglas contables ni acceder a otro propietario. Captura OCR y la orden explícita a un agente con escritura son flujos distintos: la captura conserva confirmación humana; el agente puede cumplir una orden clara sin otra confirmación en la web.

## Credenciales

- Token opaco con prefijo identificador y 256 bits aleatorios. Se entrega una sola vez. Solo SHA-256 se almacena en PostgreSQL y solo el digest viaja desde Next.js hacia la pasarela SQL.
- El estado React conserva temporalmente el resultado; al cerrar termina su ciclo de vida. No se guarda en IndexedDB, localStorage, cookies, service worker, URL ni documentación.
- La guía `.md` no contiene secretos. La credencial `.private.json` sí contiene el token: descargarla no la cifra.
- El cliente `public/integrations/moneva-client.mjs` instala la credencial fuera del repositorio/OneDrive, con ACL de usuario en Windows y 700/600 en POSIX. No sobrescribe una instalación existente. El usuario elimina la copia de Descargas; el cliente no borra archivos por su cuenta.
- El cliente nunca imprime el token, no acepta tokens como argumentos, restringe recursos, acota cuerpos/respuestas y no sigue redirecciones autenticadas. Sí requiere confiar en el agente que tiene acceso al archivo.
- Caducidad, revocación, allowlist deshabilitada y generación de reset se verifican en cada solicitud. La revocación se serializa con las llamadas en curso; no revierte cambios ya confirmados.

## Frontera del backend

El servidor Next.js usa la clave publicable de Supabase más `MONEVA_INTEGRATION_GATEWAY_KEY`, exclusiva del entorno. No usa service-role. En `private.integration_gateway_keys` se registra únicamente el hash de esta clave. El navegador y el agente no la reciben.

Las RPC públicas de pasarela solo tienen entrada anon con ambas pruebas: secreto del backend y digest personal vigente. El esquema privado no se publica en PostgREST; tablas con RLS sin políticas y privilegios revocados para PUBLIC/anon/authenticated/service_role. Gestión de conexiones usa otra RPC ligada a una sesión Google verificada y al propietario, nunca el token de integración. Funciones privilegiadas: `SECURITY DEFINER`, `search_path=''`, sin SQL elegido por el cliente. El catálogo cerrado resuelve firmas registradas; los valores son parámetros tipados, no SQL interpolado.

Next devuelve JSON, no redirecciones a login. La gestión con cookie comprueba Origin en escrituras. La API financiera usa exclusivamente Bearer. No se habilita CORS indiscriminado, uploads, inferencia ni ejecución de instrucciones de contenido financiero.

## Rutas

| Ruta | Uso |
| --- | --- |
| `GET /api/v1/openapi.json` | Contrato público generado desde el registro, sin credenciales |
| `GET /api/v1/guide` | Instrucciones Markdown para el agente |
| `GET /api/v1/capabilities` | Permiso actual, acciones, revisión y límites |
| `POST /api/v1/context` | Hasta once bloques elegidos en una sola RPC |
| `POST /api/v1/query` | Hasta diez consultas identificadas en un lote |
| `POST /api/v1/commands` | Lote financiero atómico con revisión y UUID idempotente |
| `POST /api/v1/preview` | Validación real del lote, revertida sin persistencia financiera |
| `GET /api/v1/operations/:uuid` | Recibo de esa conexión tras una respuesta perdida |
| `POST /api/v1/simulation` | Motor puro del simulador, read permitido y `persisted:false` |
| `GET/POST /api/connections` | Gestión con sesión, no con token externo |

Las consultas incluyen cuentas/entidades/categorías/distribución/metas, programados, tarjetas, pasivos, calendario, presupuesto, semilla de simulación, resumen e informe agregado con filtros. Los nombres y argumentos concretos se generan desde las funciones instaladas. `scheduled.rules` y `scheduled.occurrences` permiten paginar independientemente las dos colecciones.

Colecciones directas: `{items,hasMore,nextCursor}` con orden UUID estable, `limit` y `after_id`. Programados contiene dos páginas (`rules`, `occurrences`). El historial usa el cursor compuesto de `get_transactions_page`; `end_date` es exclusivo. Las ocurrencias usan `start_date`/`end_date` inclusivos y una ventana predeterminada de hoy a 31 días. No confundir los límites de fechas de acciones distintas. Antes de juntar páginas, comprobar que la revisión no cambió. Los agregados de informe no requieren descargar todo el historial. La API devuelve datos de reporte estructurados; no almacena archivos de exportación.

## Escrituras y dinero

- `operationId` estable por lote; UUID distinto por comando. Misma clave y cuerpo devuelve recibo; otra huella o un comando ya utilizado en otro lote devuelve 409. Los IDs pueden reutilizarse como referencias de entidades creadas previamente en el mismo lote.
- La revisión global esperada se bloquea por propietario antes de mutar. Las versiones especializadas se validan además cuando lo exige el dominio. Nunca renovar una versión silenciosamente para forzar un cambio.
- Al fallar un comando se revierten todos los cambios financieros del lote. El contador de uso queda fuera de esa subtransacción: fallos y vistas previas no son cálculo gratuito ilimitado.
- Los comandos resuelven las mismas operaciones canónicas de cuentas, entidades, categorías, plan, metas, compras, obligaciones y pagos. La integración no implementa otro libro mayor.
- `movement.record` simplifica altas normales. Conserva ambos lados de transferencias, moneda nativa y una misma valoración COP. La tasa y el recibido deben concordar; comisión como otro gasto. Las tasas y fechas desconocidas no se inventan.
- Montos y tasas deben enviarse como cadenas decimales. El parser conserva el lexema original antes de que JavaScript redondee cifras grandes. PostgreSQL serializa hojas numéricas como texto; no convierte importes a IEEE-754 al responder. Los contadores que también se entregan como texto se pueden convertir solo cuando su rango sea seguro.
- Simulación: equivalentes COP explícitos, hasta 100 categorías principales, 1.000 subcategorías y un ingreso de 1 billón COP. Usa el motor existente y no persiste escenarios.
- Un 503 tras una escritura puede significar respuesta perdida. No afirmar `committed:false` por falta de respuesta: consultar recibo o repetir exactamente el lote original.

## Sincronización y conflictos

`private.finance_revisions` sigue las tablas financieras en web, API, cron e importación. `external_revision` cambia solo cuando la integración confirma un lote. La cola durable toma la revisión externa del estado realmente almacenado, incluso si la pestaña tiene un fallback más antiguo. Un cliente independiente por operación envía `X-Moneva-External-Revision`; el cliente de sesión compartido no cambia sus headers.

Una edición local anterior a una mutación externa queda pendiente con explicación; no sobrescribe ni resucita un borrado. Al recuperar foco/visibilidad, se comprueba revisión con deduplicación y cooldown de treinta segundos, sin polling. Si hay cambios, se recarga la instantánea completa solo cuando la cola lo permite, retirando las filas borradas e invalidando efectos de consulta de historial/reportes/calendario.

En conflicto, Ajustes ofrece revisar los pendientes, descargar una copia privada y confirmar conservar la nube. Antes de descartar se comparan los IDs revisados con el WAL actual dentro de la transacción IndexedDB. Si llegó otro cambio, no se descarta ninguno. No existe rebase automático a ciegas; la copia sirve de consulta para volver a registrar lo que el propietario decida conservar.

`supabase/operations/reset_financial_user.sql` elimina capacidades y sus recibos/actividad/IDs de comando por cascada, además del uso y las finanzas. Conserva Google, allowlist/rol, perfil/tema y marcadores monotónicos de recuperación. La prueba ejecuta el script real, valida al otro usuario y verifica que los tokens anteriores no funcionan. Un operador debe actualizar también cualquier copia personal que haya guardado en el SQL Editor; el repositorio no puede modificar esas copias automáticamente.

## Consumo y retención

| Límite compartido por propietario | Valor inicial |
| --- | --- |
| Conexiones activas / duración | 10 / máximo 90 días |
| Consultas / comandos por petición | 10 / 50 |
| Página | 100 elementos |
| Cuerpo / respuesta | 256 KiB / 1 MiB |
| Recibo de escritura | 64 KiB |
| Peticiones por minuto / día UTC | 120 / 2.000 |
| Unidades por minuto / día UTC | 600 / 10.000 |
| Respuestas por minuto / día UTC | 5 MiB / 20 MiB |
| Recibos / actividad / uso | 90 días / 30 días / 2 días |

Un contexto cuesta doce unidades; una consulta dos y un comando cinco, más una unidad por KiB de cuerpo. Reintentos también cuentan. El bloqueo por usuario impide multiplicar cuotas creando tokens. 429 incluye Retry-After; no hacer polling ni reintentar indefinidamente. El job diario `moneva-integration-retention` limpia metadatos, no la auditoría contable.

No se agrega un servicio/modelo de IA de pago. Sí hay consumo normal de Supabase/Vercel y del proveedor del agente elegido por el usuario. Los límites no garantizan que toda la infraestructura sea gratis ni sustituyen sus métricas/cupos.

## Operación y despliegue

1. Ensayar todas las migraciones y el reset con PostgreSQL local. Usar una base no productiva para desarrollo.
2. Aplicar la migración de conexiones antes del frontend que consulta revisiones.
3. Generar una clave aleatoria de pasarela de al menos 32 bytes; registrar su hash en `private.integration_gateway_keys` y su valor como secreto **solo producción** en Vercel. No copiarla a previews ni a `.env.local` contra producción.
4. Desplegar el commit probado. Mantener la URL canónica. Comprobar 401 JSON sin sesión, guía/OpenAPI y cliente público, gestión sin sesión, Advisors y errores de runtime.
5. Para rotar, añadir otro hash, cambiar el secreto y redesplegar; tras verificar, retirar el hash anterior. Un rollback frontend no borra las tablas ni revoca por sí solo los tokens; mantener la API compatible y su pasarela hasta cerrar el incidente.
6. Ante incidente, revocar conexiones afectadas; nunca añadir grants generales al rol de Auth ni desactivar RLS para arreglar acceso.

## Validación

`pnpm test` incluye PostgreSQL en memoria con **todas** las migraciones reales (solo se simulan las envolturas gestionadas Auth/Storage/Cron). Prueba HTTP → pasarela → dominio, aislamiento, permisos, caducidad/revocación/reset, COP/COP/USD/USD y conversión cruzada, recibos, rollback, cuotas, precisión decimal, presupuesto opcional, metas/aportes, tarjeta/compra, deuda, programaciones, reset y 10.000 movimientos locales. Los tests de IndexedDB cubren revisión y descarte atómico. El cliente se prueba con HTTP real y ACL Windows en la máquina de desarrollo; POSIX conserva un camino de permisos específico, sin afirmar prueba en macOS/Linux si no se ejecutó allí.

`tests/e2e/connections.spec.ts` cubre permisos, creación, token de única visualización, descarga privada, renombrar/revocar, axe y tamaños de teléfono/tablet/escritorio. Las capturas se inspeccionan visualmente; los datos masivos y credenciales sintéticas nunca se suben a producción. No se cambia el sistema de diseño, formularios o animación: se reutilizan sus primitivas.

## Límite intencional

### Revisión de Advisors

Se corrigió el aviso [unsupported reg types](https://supabase.com/docs/guides/database/database-linter?lint=unsupported_reg_types): el registro guarda firmas estables como texto, no columnas regprocedure que dificulten pg_upgrade.

Los avisos [funciones definer anónimas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [funciones definer autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) requieren revisión, no eliminación automática: la pasarela exige secreto del backend + digest de capacidad; gestión/revisión exigen propietario y allowlist. Las ocho tablas privadas con [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) están cerradas intencionalmente, no pendientes de una política permisiva. Se comprobó el rol anon real mediante un smoke transaccional revertido: capacidad, contexto mínimo, rechazo de escritura y revocación.

El aviso de [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) ya corresponde a la configuración de Auth; la aplicación usa Google. Esta entrega no habilita login por contraseña ni cambia la contratación/configuración de ese servicio. No presentar todos los avisos de Advisors como resueltos.

No se incluye MCP remoto ni OAuth para terceros, conexiones bancarias, lectura automática de archivos del usuario, modelos hospedados o inferencia. La API HTTP y el cliente local ya permiten trabajar a un agente con esas herramientas. MCP puede añadirse después como adaptador del mismo catálogo, sin duplicar permisos ni finanzas.
