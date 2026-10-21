# Guía para conectar un agente a Moneva

La guía técnica completa se genera desde las operaciones realmente instaladas:

- [Instrucciones Markdown sin credenciales](https://moneva-three.vercel.app/api/v1/guide)
- [OpenAPI](https://moneva-three.vercel.app/api/v1/openapi.json)
- [Cliente local sin dependencias](https://moneva-three.vercel.app/integrations/moneva-client.mjs)

En Moneva: **Ajustes → Conexiones → Crear conexión**. Empieza con solo lectura y una duración corta. Elige escritura únicamente si quieres que el agente guarde cambios reales; acceso total añade bajas/archivos, nunca administración.

Descarga la credencial privada e instálala fuera del repositorio y de carpetas compartidas:

```text
node moneva-client.mjs install RUTA_DEL_ARCHIVO_DESCARGADO
node moneva-client.mjs context
node moneva-client.mjs query CONSULTAS.json
node moneva-client.mjs commands LOTE.json
node moneva-client.mjs operation UUID_DEL_LOTE
```

Node.js 22 o posterior. La ruta privada también puede indicarse mediante `--credentials RUTA` antes de la acción. Verifica el origen del cliente antes de ejecutarlo. Instalar restringe permisos, no cifra el archivo. Elimina manualmente la copia de Descargas. Nunca pegues el token en chats, URLs o argumentos.

Entrega al agente la guía y la ruta de configuración, no la credencial adjunta. La herramienta externa debe tener HTTP o terminal y autorización para usar esa ruta; no basta con que un chat pueda leer Markdown. Un agente con acceso a archivos podría leer el secreto: úsalo solo con herramientas de confianza. Tu proveedor podría procesar los datos financieros que permitas consultar.

Revoca el acceso desde Conexiones si ya no lo necesitas o sospechas que se expuso. Si pierdes el token, no se recupera: revoca esa conexión y crea otra. La PWA no necesita permanecer abierta.

Reglas de implementación, cuotas y recuperación: `assistant-connections.md`. No hay inferencia ni un modelo de pago añadido en Moneva; la infraestructura conserva sus límites normales.
