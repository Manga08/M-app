# Moneva — sistema de movimiento

Este documento es el contrato de animación de Moneva. Toda interfaz nueva o modificada debe respetarlo junto con [`.interface-design/system.md`](../.interface-design/system.md).

La intención es que Moneva se sienta directa, estable y confiable. El movimiento confirma una acción, conserva contexto o explica una relación espacial; nunca compite con cifras, formularios ni lectura financiera.

## Principios obligatorios

1. **Respuesta inmediata.** El control confirma el toque desde `pointerdown`/`:active`; la navegación o mutación no espera a que termine una animación.
2. **Continuidad.** Un elemento aparece desde el control o borde que lo origina y sale por el mismo trayecto.
3. **Interrupción.** Una interacción repetida puede retomar o invertir el movimiento desde su posición visible. No bloquear input durante una transición.
4. **Estabilidad de datos.** No animar importes, texto que se escribe, tablas completas ni todas las gráficas al aplicar cada filtro.
5. **Frecuencia antes que espectáculo.** Cuanto más frecuente es una acción, menor movimiento recibe.
6. **Propósito nombrable.** Cada animación debe servir a `feedback`, `continuidad espacial`, `indicación de estado` o `evitar un salto`. Si no cumple una, no se anima.
7. **Accesibilidad equivalente.** Todo gesto tiene alternativa de toque/teclado y toda animación espacial tiene variante reducida.

## Herramientas

Usar la opción menos costosa que resuelva la interacción:

| Necesidad | Herramienta |
| --- | --- |
| Hover, presión, color, opacidad, toggle | CSS transition |
| Entrada predeterminada que debe resistir carga | CSS animation / `@starting-style` |
| Secuencia imperativa puntual | WAAPI |
| Salidas, layout, reordenamiento, drag y springs | Motion |
| Gráficas | Recharts con este mismo contrato |
| Continuidad selectiva entre rutas | React/Next `ViewTransition`, con fallback |

No instalar otra librería de animación sin justificar una capacidad que Motion 13, CSS o WAAPI no cubran.

### Carga de Motion

- `MotionProvider` base del área autenticada carga únicamente `domAnimation`.
- `MotionGesturesProvider` carga `domMax` localmente solo donde se usan `drag`, layout projection o reordenamiento declarativo.
- Un gesto simple puede permanecer en `domAnimation` si usa una única capa de Pointer Events + `MotionValue`; el calendario financiero sigue este patrón para que el primer gesto no dependa de cargar `domMax`.
- En componentes cliente usar `m.*` desde `motion/react`, no `motion.*` directo.
- No envolver páginas públicas en features de gesto.
- No establecer un tween global universal: cada familia de movimiento usa su token semántico.

## Tokens canónicos

Los tokens viven en `src/app/globals.css` y su espejo tipado en `src/lib/motion.ts`.

```css
--motion-duration-press: 100ms;
--motion-duration-tooltip: 125ms;
--motion-duration-menu: 160ms;
--motion-duration-state: 180ms;
--motion-duration-overlay: 200ms;
--motion-duration-spatial: 240ms;
--motion-duration-settle: 240ms;
--motion-duration-settle-gesture: 280ms;
--motion-duration-reduced: 100ms;
--motion-duration-activity: 1350ms;

--motion-ease-out: cubic-bezier(.23, 1, .32, 1);
--motion-ease-move: cubic-bezier(.77, 0, .175, 1);
--motion-ease-sheet: cubic-bezier(.32, .72, 0, 1);
--motion-press-scale: .98;
```

El API TypeScript expone `motionDurations`, `motionEasings` y `motionSprings`:

- `motionDurations.activity`: ciclo exclusivo para un indicador de actividad indeterminado; nunca se usa en entradas, salidas o feedback y se elimina por completo con movimiento reducido.
- `motionSprings.direct`: settle directo en `0.24s`, `bounce: 0`; vuelve al destino sin overshoot.
- `motionSprings.gesture`: settle de gesto en `0.28s`, `bounce: 0`; conserva la velocidad de entrada sin rebasar el destino y solo se usa después de un gesto con momentum.

No introducir nuevas duraciones, curvas o escalas inline. Si aparece una necesidad real, ampliar primero estos tokens y documentarla aquí.

## Mapa de implementación

| Responsabilidad | Fuente de verdad |
| --- | --- |
| Variables CSS y preferencias del sistema | `src/app/globals.css` |
| Tokens tipados y springs | `src/lib/motion.ts` |
| Features base `domAnimation` | `src/lib/motion-features.ts` |
| Features locales `domMax` | `src/lib/motion-gestures-features.ts` |
| Provider base del layout autenticado y provider local de gestos | `src/components/motion-provider.tsx` y `src/app/(app)/layout.tsx` |
| Indicador y paneles de subpestañas por URL | `src/components/route-view-tabs.tsx` |
| Primitivas de overlays y controles | `src/components/ui/` |
| Contrato automatizado | `src/lib/motion.test.ts` |
| Comportamiento temporal E2E | `tests/e2e/motion-system.spec.ts` y `tests/e2e/movements-v2.spec.ts` |

Una feature nueva debe componer estas piezas. No debe duplicar providers, reconstruir un sistema paralelo de pestañas ni mantener estado de salida con temporizadores.

`MotionProvider` pertenece exclusivamente al layout autenticado `(app)`. El layout raíz conserva los providers transversales de tema y PWA, pero no debe importar Motion: `/login`, `/acceso-denegado` y `/offline` no usan componentes `m.*` ni solicitan el feature chunk `domAnimation`. La frontera de bundle se verifica en producción con `tests/e2e/motion-bundle.spec.ts`.

## Matriz por frecuencia

| Frecuencia | Tratamiento |
| --- | --- |
| Cientos de veces al día o acción de teclado | Instantáneo; como máximo color/opacity |
| Decenas de veces al día | Presión y cambio de estado casi imperceptibles |
| Ocasional: dialog, sheet, toast | Movimiento estándar, hasta 240 ms |
| Raro: completar meta, primera carga | Detalle expresivo discreto, una sola vez |

## Propiedades y rendimiento

- Animar `transform` y `opacity`.
- `height` solo se admite en acordeones cortos, medidos con CPU limitada.
- Nunca `transition: all`.
- Nunca entrada desde `scale(0)`; usar como mínimo `.95` y opacidad.
- En Motion preferir el string completo de `transform` cuando la animación sea predeterminada.
- No dejar `will-change` permanente; activarlo solo mientras haga falta.
- Evitar `filter` y `backdrop-filter` durante scroll o drag sin medición de paint.
- Las listas grandes solo animan las filas visibles que se insertan, eliminan o reordenan.

## Patrones canónicos

### Botón y control frecuente

- Feedback: `scale(var(--motion-press-scale))`.
- Presión: `--motion-duration-press`.
- Sin rebote.
- Hover únicamente con `(hover: hover) and (pointer: fine)`.

### Tabs y navegación

- Indicador activo compartido: `--motion-duration-menu` + `--motion-ease-move`.
- Contenido: crossfade o traslado de 8–12 px como máximo.
- No usar `mode="wait"`; un segundo toque debe interrumpir el primero.
- Atrás/Adelante debe terminar en el mismo estado visual que un toque.
- No desplazar páginas financieras completas en cada cambio de menú.

### Popover, dropdown, select y tooltip

- Originar desde el trigger suministrado por Radix.
- Tooltip: `--motion-duration-tooltip`, con demora inicial breve; vecinos pueden abrir instantáneamente.
- Menú: `--motion-duration-menu`, escala inicial cercana a `.98`.
- Usar transiciones retargetables para controles que pueden abrirse repetidamente.

### Dialog

- Centro estable en escritorio; superficie desde abajo en móvil cuando el patrón sea un sheet.
- Fondo y contenido coordinados con `--motion-duration-overlay`.
- El contenido permanece montado hasta `onExitComplete`; limpiar formulario, URL o estado después de ese evento, nunca con `setTimeout` sincronizado a una duración.
- La interacción destructiva conserva el foco y su confirmación.

### Sheet y gesto de arrastre

- Entrada y salida por el mismo borde.
- Seguimiento 1:1, pointer capture y umbral de intención.
- Al soltar, decidir por distancia más velocidad proyectada.
- Usar `motionSprings.direct` al cancelar y `motionSprings.gesture` cuando exista un flick real. Ambos settles terminan en 300 ms o menos y no tienen overshoot.
- Nunca depender exclusivamente del drag: conservar botón, teclado y Escape.

### Calendario

- Una sola fuente de gesto; no mezclar Touch Events manuales con otro recognizer.
- Panel anterior, actual y siguiente conservan dirección espacial.
- Flechas, teclado y swipe comparten la misma transición.
- No cambiar periodo durante `pointermove`; decidir al finalizar.
- En movimiento reducido, reemplazar traslado por crossfade corto.

### Datos, filtros y carga

- Mantener el resultado anterior visible y marcado `aria-busy` mientras llega el nuevo.
- Atenuarlo levemente y bloquear edición transitoria si mezclar periodos sería peligroso.
- Mostrar un estado textual discreto cerca del control que produjo la actualización.
- No reemplazar una página llena de datos por un spinner durante cada filtro.

### Gráficas y progreso

- Recharts anima solo la primera revelación significativa.
- Cambios de filtro cruzan datasets sin reconstruir todas las series desde cero.
- Las barras usan `scaleX` con origen izquierdo.
- Los números permanecen estáticos y con `tabular-nums`.

### Tema personalizado

- Durante el arrastre del selector, `html[data-motion-scrubbing="true"]` suspende las transiciones del documento y de sus descendientes, incluidos pseudoelementos, para seguir el dedo sin rezago.
- Al confirmar o cancelar se elimina el atributo. Si el diálogo se desmonta con una vista previa sin guardar, restaura primero la apariencia confirmada y después limpia el estado de scrubbing.
- No animar cada muestra intermedia del color.

### Startup y páginas públicas

- Una revelación única corta está permitida.
- Cuando los datos quedan listos, la pantalla de carga sale mientras el contenido real ya está montado detrás.
- Nunca retrasar OAuth, Reintentar, Atrás ni contenido listo por una animación.
- No simular porcentajes de carga inexistentes.

## Movimiento reducido, transparencia y contraste

`prefers-reduced-motion: reduce` no significa eliminar feedback:

- Quitar slides, springs, escalas, parallax, rubber-band y loops.
- Conservar opacity/color durante `--motion-duration-reduced`.
- Las gráficas no interpolan geometría.
- Los gestos siguen teniendo botones equivalentes.

Además:

- `prefers-reduced-transparency: reduce`: convertir chrome difuminado en superficie casi sólida y eliminar blur.
- `prefers-contrast: more`: reforzar borde y fondo sin introducir movimiento adicional.
- `forced-colors`: conservar foco, selección y estado con propiedades del sistema.

## Presupuestos de aceptación

- Feedback de presión visible en el siguiente frame.
- Ninguna animación funcional supera 300 ms; `activity` es la única excepción por ser un loop indeterminado que no retrasa interacción ni contenido.
- Ninguna tarea de más de 50 ms durante un gesto crítico bajo CPU 4×.
- Sin layout shift causado por motion.
- Objetivo de 60 FPS; aprovechar 120 Hz donde el navegador lo permita.
- Ninguna feature Motion innecesaria en rutas públicas.
- Sin errores de consola en Chromium ni WebKit.

## Matriz mínima de pruebas

- 320 × 720.
- iPhone 15 Pro / WebKit.
- Pixel 7 / Chromium.
- iPad Mini y tablet grande / WebKit.
- 1440 × 900, 1920 × 1080 y 2560 × 1440.
- Claro, oscuro y Crimson.
- Movimiento normal y reducido.
- Teclado, foco, Atrás/Adelante y touch.
- Abrir/cerrar cinco veces, invertir pestañas rápidamente e interrumpir un swipe.
- Datos vacíos, normales y 10.000 movimientos con cifras extremas.

Las capturas estáticas con animaciones deshabilitadas siguen siendo necesarias, pero no sustituyen las pruebas temporales con movimiento activo.

## Lista de revisión para cambios futuros

Antes de aprobar una interfaz nueva:

- [ ] La animación tiene propósito explícito y frecuencia adecuada.
- [ ] Usa tokens existentes y la herramienta menos costosa.
- [ ] Entrada y salida son simétricas.
- [ ] Puede interrumpirse o la interacción no necesita serlo.
- [ ] No mueve cifras ni datos solo por decoración.
- [ ] Incluye variante de movimiento reducido.
- [ ] Hover está limitado a puntero fino.
- [ ] Todo drag tiene alternativa de un solo toque y teclado.
- [ ] Funciona con Atrás/Adelante y no deja URL/overlay desincronizados.
- [ ] Fue comprobada con animaciones activas en Chromium y WebKit.
- [ ] No aumentó el JavaScript inicial de rutas que no usan el efecto.

## Referencias de producto

Estas fuentes orientan el comportamiento, no la apariencia literal de Moneva:

- Apple, *Design interactive snippets*: respuesta inmediata, continuidad desde el control y transiciones que conservan contexto. <https://developer.apple.com/videos/play/wwdc2025/219/>
- Apple, *Get to know the new design system*: adaptabilidad, jerarquía y movimiento coherente entre tamaños. <https://developer.apple.com/videos/play/wwdc2025/356/>
- Android, Material 3: esquemas de movimiento estándar y expresivo, con springs interrumpibles. <https://developer.android.com/develop/ui/compose/designsystems/material3>
- Android, `MotionScheme`: contratos compartidos para no inventar movimiento por componente. <https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme>

Moneva adopta esos principios de respuesta, continuidad y accesibilidad, pero conserva su identidad sobria: no replica Liquid Glass, rebotes decorativos ni efectos que compitan con información financiera.
