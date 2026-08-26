# Moneva — sistema de interfaz

## Dirección

Moneva se comporta como un libro financiero sereno: información densa pero respirable, superficies continuas, filas y divisores antes que una colección de tarjetas. La personalidad viene de la tipografía, el color elegido por el usuario y una iconografía consistente; no de adornos ni efectos gratuitos.

## Principios

- Mobile first: cualquier flujo principal debe poder completarse cómodamente con una mano desde 320 px.
- Una acción primaria visible por contexto. En móvil, `Nuevo` vive en la navegación; no se duplica dentro del contenido.
- Los datos nunca aparentan estar sincronizados si solo están guardados localmente o en cola.
- El color comunica selección o estado, pero nunca es la única señal.
- Las cifras mantienen jerarquía: saldo principal, métricas secundarias, contexto y ayuda.
- Preferir filas, grupos y divisores. Usar una superficie elevada solo para overlays, confirmaciones o un control realmente agrupado.

## Identidad de marca

- El símbolo canónico vive en `config/brand-symbol.json`; componentes, favicon, PWA, pantallas públicas, estados de carga/error e imagen social deben consumir esas mismas coordenadas.
- Puede cambiar el color por tema y escalarse de forma uniforme, pero nunca se reconstruye con CSS, texto, otras proporciones ni se omite su travesaño.
- `BrandMark` es la representación sin fondo para la interfaz y `BrandAppIcon` añade únicamente el contenedor del icono instalable.

## Geometría y espaciado

- Base espacial: 4 px; ritmos frecuentes de 8, 12, 16, 20, 24, 32 y 40 px.
- Controles táctiles: mínimo 44 × 44 px; formularios móviles normalmente 48–52 px.
- Radios: 12–16 px en controles, 20–28 px en dialogs/sheets; píldoras solo para acciones o filtros compactos.
- El contenido de escritorio se centra y limita a 1536 px; no se estira indefinidamente en 2K.
- Respetar `safe-area-inset-*` en navegación, overlays y acciones pegadas.

## Tipografía y datos

- Títulos con tracking ligeramente cerrado; texto funcional sin mayúsculas decorativas prolongadas.
- Cifras con `tabular-nums` y formato regional `es-CO`.
- No ocultar contexto esencial en móvil: fecha, cuenta, categoría y tipo deben seguir disponibles.
- Evitar texto menor de 11 px; 12–16 px para información operativa.

## Color y contraste

- Todas las paletas y ambos modos deben cumplir WCAG 2.2 AA.
- Texto normal: mínimo 4.5:1. Bordes, foco y componentes: mínimo 3:1.
- Usar tokens semánticos (`positive`, `warning`, `info`, `destructive`), no colores Tailwind directos.
- El foco debe ser visible además del hover y funcionar en forced colors.

## Movimiento

- Animar solo para explicar continuidad, cambio de estado o relación espacial.
- Navegación frecuente: 100–180 ms, `transform`/`opacity`, sin rebotes.
- Dialogs y sheets: hasta 250 ms; entrada y salida coherentes con su origen.
- La interacción responde al toque de inmediato; la confirmación remota llega como estado posterior.
- Respetar `prefers-reduced-motion` y evitar animaciones de layout costosas.

## Accesibilidad e interacción

- HTML semántico primero; landmarks, encabezados en orden y skip link al contenido.
- Controles seleccionables exponen `aria-pressed` o patrón de tabs completo.
- Errores se asocian al campo, mueven el foco cuando corresponde y se anuncian.
- Gráficas siempre incluyen una alternativa tabular con valores exactos.
- Atrás/Adelante del navegador debe restaurar ruta, pestaña y overlay visibles.
- Destructivos requieren confirmación y explican qué se conserva.

## Componentes canónicos

- Usar `FormControl` para campos compuestos con iconos o adornos; no recrear wrappers manuales.
- Usar `Progress` con nombre y valores accesibles.
- Usar `FinanceIconPicker` para iconos generales, marcas y bancos.
- Usar `announceMutation` para diferenciar guardado remoto, local y en cola.
- Usar `PaginationControls` para colecciones que puedan crecer.
- Calendario financiero: en móvil prioriza semana + libro diario; en tablet/escritorio muestra el mes y el detalle del día. Las celdas resumen ingresos, gastos y estados previstos sin chips de eventos ni puntos ambiguos. Debe conservar botones nativos, navegación por teclado y transiciones de estado de 120–150 ms.
- Simulador financiero: presenta el modelo mental `ingreso → distribución → presupuesto/gasto → resultado`. En móvil, cada importe conserva su etiqueta visible; las cabeceras de columnas solo sustituyen esas etiquetas desde 1024 px. El resultado en vivo aparece antes de la edición detallada en pantallas estrechas y como panel de apoyo fijo en escritorio.

## Verificación mínima

- Viewports: 320 px, iPhone 15 Pro, Pixel 7, iPad Mini, 1440 × 900 y 2560 × 1440.
- Probar claro/oscuro y al menos una paleta de alto carácter como Crimson.
- Revisar scroll, safe areas, teclado, foco, Back/Forward, overlays, icon picker y formularios.
- Ejecutar typecheck, lint, pruebas unitarias, build y Playwright antes de publicar.
