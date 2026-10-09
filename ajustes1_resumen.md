# Ajustes1: qué se aplicó y qué no

> Ajustes pedidos por el dueño del sitio en el PDF *Ajustes1* (28-sep-2026). Se aplicaron el 3-oct-2026 en la rama `ui-panel-ajustes`.
> Cuando el pedido era ambiguo, decidí con criterio propio; cada decisión está explicada abajo y las que conviene confirmar con el dueño están al final.

## Resumen

| # | Pedido | Estado |
|---|---|---|
| 1 | Cambiar "Solicite o consulte sus citas" por "Portal de gestión de citas" | ✅ Aplicado |
| 2 | Que el intérprete Mujer/Hombre se vea sin abrir la tuerca ⚙ | ✅ Aplicado, con un ajuste de criterio |
| 3 | Con la tablet conectada, dejar solo la barra de progreso y las indicaciones; organizar mejor especialidades y fechas; cambiar "Guion de la demo" por "Servicios básicos de salud" | ✅ Aplicado. Los botones "Simular…" y la franja MODO DEMO se mantienen (ver el porqué) |
| 4 | Tablet: que funcione en celular, sin cámara en las elecciones, opciones más grandes y con forma de botón | ✅ Aplicado. Falta probarlo en equipos reales |
| 5 | Sin disponibilidad: texto "No hay disponibilidad, intente otro día" sobre el lado izquierdo del video | ✅ Aplicado |

## 1. "Portal de gestión de citas"

- **Aplicado.** Es el primer botón del portal simulado de la IPS ([AdminApp.tsx](app/src/admin/AdminApp.tsx)).
- El PDF dice "Gestión decitas". Usé "Portal de gestión de citas" para que vaya con los otros dos botones ("Información de servicios", "Canales de atención").
- Es solo un texto del fondo simulado. No es un enlace y no abre nada.

## 2. Intérprete visible sin ⚙

**Aplicado:**
- Mientras no hay una atención en curso, el panel muestra a la vista **Intérprete de los videos (Mujer / Hombre)** y **Posición del panel**, igual que en la captura del dueño.
- La ventanita (el lanzador) también tiene el selector de intérprete. Desde ahí *Iniciar atención* arranca directamente, sin pasar por el panel, así que sin este selector el funcionario nunca lo vería.
- **Se quitó el botón ⚙.** Todo lo que tenía ahora se ve cuando hace falta:
  - El QR aparece en el aviso *Tablet desconectada*.
  - Con la tablet conectada, la sesión y el botón *Nueva sesión* aparecen antes de iniciar.

**Decisión de criterio:** las preferencias se ocultan **al iniciar la atención** y no al conectar la tablet.
- El ajuste 3 dice "cuando se conecte la tablet". Pero lo primero que hace el funcionario es escanear el QR, así que con esa regla el selector desaparecería antes de que pudiera usarlo.
- En las capturas tachadas del ajuste 3 hay una atención en curso, así que esta regla cumple lo que el dueño mostró.

**No aplicado (a propósito):** no se puede cambiar el intérprete ni la posición *durante* una atención.
- **Por qué:** cambiar de intérprete a mitad de la conversación confunde al señante.
- Si hace falta cambiarlo, se cancela y se vuelve a iniciar. La posición se puede cambiar entre atenciones.

## 3. Panel limpio durante la atención

**Aplicado: durante la atención solo se ve**
- la barra de progreso;
- la pantalla del señante;
- las indicaciones y los controles del paso.

No aparecen el selector de intérprete, la posición ni el QR. Si la tablet se desconecta, el aviso rojo con el QR vuelve a salir solo, como antes.

**Vista previa "Pantalla del señante".** No estaba tachada, así que se mantiene, pero ahora se puede ocultar (*Ocultar / Mostrar*).
- **Mientras se arman especialidades u horarios se oculta sola**, para dejarle espacio a la lista. Al enviarlos vuelve a aparecer y muestra la infografía tal como la ve el señante.
- Es la forma en que entendí "mejor vista para agregar especialidades y fechas".

**Especialidades (panel):**
- El buscador encuentra por especialidad **o por servicio** y no distingue tildes: "pediatria" encuentra Pediatría; "control prenatal" encuentra Obstetricia.
- Los servicios se eligen con botones conmutables (✓) en vez de casillas.
- La lista es más alta: antes medía 240 px; ahora llega a casi media pantalla.
- La lista de elegidas se titula *Así se verán en la tablet*, numerada en el mismo orden que verá el señante.
- El botón *Enviar a la tablet* queda siempre visible al fondo del panel.

**Fechas y horarios (panel):**
- Se elige la fecha (no deja elegir días pasados) y se tocan las **horas frecuentes**: 7, 8, 9, 10 y 11 a. m., y 2, 3, 4 y 5 p. m. Se activan y desactivan con un toque. La hora libre + *Agregar* sigue disponible.
- Los horarios elegidos se agrupan por fecha y llevan el número que verá el señante. Ya no se puede repetir el mismo horario.
- *Usar horarios de ejemplo* ahora usa los próximos días hábiles. Antes ofrecía fechas fijas, y algunas ya habían pasado (1-oct).

**"Guion de la demo" → "Servicios básicos de salud":**
- Aplicado: cambian el título de la caja, el ícono y la etiqueta del campo, que ahora dice *Servicio que solicita el señante*.

**No aplicado (a propósito):**
- Los botones siguen diciendo *Simular reconocimiento* y *Simular confianza baja*.
- Se mantiene la franja **MODO DEMO · reconocimiento de señas simulado**.
- **Por qué:** la detección de la seña todavía es simulada. Si se borran todas las señales de simulación, quien vea la demo (por ejemplo, la IPS) puede creer que la IA ya reconoce las señas. El dueño solo pidió quitar el texto "Guion de la demo".

**No aplicado:** el calendario mensual con selectores de hora, minuto y AM/PM del mockup de Figma.
- **Por qué:** la fecha más las horas rápidas cubren el mismo caso con menos pasos. Si el dueño quiere exactamente el mockup, se puede hacer después.

## 4. Pantalla del señante (tablet y celular)

**Sin cámara en las elecciones: aplicado.**
- La cámara solo aparece en la detección de la seña del trámite.
- En especialidades, citas y horarios el señante **solo toca la pantalla**.
- Por eso también se quitó la elección *simulada* con la **seña del número**: la caja *Simular seña de número*, el texto "…o seña del número" y la lógica asociada.
- *Actualización (PR #6, ya en `main`):* la seña del número volvió como reconocimiento **real** (beta), pero como preferencia del panel **apagada por defecto**. Con la configuración por defecto se cumple este pedido: solo toque y sin cámara en las elecciones.

**Opciones más grandes y con forma de botón: aplicado.**
- **Letra:**
  - Especialidades: 24 px en el servicio y 20 px en la pestaña (antes 19 px).
  - Horarios: 24 px, y 36 px el número del día.
- **Aspecto de botón:** borde y sombra inferior que "se hunde" al tocar. La opción elegida lleva contorno verde **y una ✓**, así que no depende solo del color.
- **Organización:** con 4 opciones o menos van en 2 columnas, más anchas; con más, en 3.
- En las elecciones, la columna del video baja de 360 a ~300 px para dejarles más ancho a las opciones.
- **Palabras enteras:** se quitó la partición automática con guion, que dejaba "dermato-lógica" o "Endosco-pia".
  - Revisé las 78 combinaciones de especialidad y servicio del catálogo: ninguna palabra se corta.
  - Las tres palabras más largas ("gastroenterológica", "otorrinolaringológica", "fonoaudiología") se parten solo por puntos naturales ("gastroentero-lógica") y solo si no caben.

**Error corregido en los horarios de la tablet:**
- Todos los horarios de un mismo mes iban en **una sola fila**.
- Desde el 3.er horario del mismo mes, la columna del video se salía de la pantalla, y desde el 4.º desaparecía. Con los horarios de ejemplo no se notaba porque había 2 por mes.
- Ahora es una cuadrícula que baja de fila.

**Celular: aplicado.** La pantalla se adapta a su propio tamaño, sin afectar la vista previa del panel.
- **Vertical:** una columna con scroll. Arriba van la instrucción y el video LSC, completo y sin recortes; debajo, las opciones en una columna y los horarios en dos.
- **Horizontal:** encabezado y barra compactos. El video ya no queda como una franja: en 812×375 mide 475×267 px.
- La barra de progreso muestra "Paso 7 · Disponibilidad" cuando las etiquetas no caben.
- El indicador *Conectada a recepción* pasó al encabezado. Antes tapaba las etiquetas de la barra de progreso, también en la tablet.
- La tablet en vertical también funciona.

**Pendiente:**
- **Probar en equipos reales.** Lo probé con tamaños simulados en el navegador: 1180×820 y 820×1180 (tablet), 375×812 y 812×375 (celular). Faltan la tablet real y celulares Android y iPhone.
- **La cámara sigue encendida aunque no se muestre** (no graba ni envía nada). Apagarla y volver a pedirla en cada paso puede hacer que algunas tablets pidan el permiso otra vez. Es una decisión aparte, relacionada con la privacidad.

## 5. Aviso "No hay disponibilidad. Intente otro día."

**Aplicado:**
- Al marcar *Sin disponibilidad*, la tablet muestra el video de negación con el aviso escrito sobre el lado izquierdo.
- **Comprobado cuadro por cuadro** (43 cuadros, uno cada 0,1 s): la intérprete nunca pasa del 45,6 % del ancho hacia la izquierda y el aviso termina como máximo en el 43 %. No tapa sus manos en ningún tamaño de pantalla.
- La letra crece con el tamaño del video: se lee igual en la tablet, en el celular y en la vista previa.
- Con el aviso no se repite el subtítulo de abajo ("Lo sentimos, no hay disponibilidad."): queda un solo texto.

**Decisión de criterio:**
- Después de la negación, la acción principal del panel es *Finalizar atención*.
- El antiguo *Ofrecer otros horarios* ahora se llama *Volver a los horarios* y queda solo para corregir un clic por error.
- **Por qué:** si la tablet le dice al señante "intente otro día", ofrecerle otras fechas en la misma atención contradice el mensaje.

**Pendiente:** solo existe el video de negación de **mujer**. Si llega la versión de hombre con otro encuadre, hay que revisar la posición del aviso.

## Para confirmar con el dueño

1. ¿Está bien que el selector de intérprete se oculte al **iniciar la atención** y no al conectar la tablet?
2. ¿Se mantiene la vista previa "Pantalla del señante" (que se puede ocultar y se oculta sola al armar opciones)?
3. ¿Basta con cambiar el título a "Servicios básicos de salud", manteniendo los botones "Simular…" y la franja MODO DEMO?
4. ¿Se descarta definitivamente elegir con la **seña del número**?
   - El plan [plan_reconocimiento_LSC.md](plan_reconocimiento_LSC.md) la propone como primera función de la IA, y ya está publicada (PR #6) como preferencia del panel ("Solo toque" / "Toque o seña del número"), **apagada por defecto**.
   - Si nadie la activa, se mantiene lo de Ajustes1: solo toque y sin cámara en las elecciones. Falta que el dueño decida si se activa.
   - Falta decidir si se ofrece esa opción o se descarta.
5. ¿Tras "Intente otro día" la atención siempre termina?
6. El celular, ¿es solo para demos o podría reemplazar a la tablet en el mostrador? En vertical el video LSC queda pequeño para leer las señas.

## Cómo se verificó

- `tsc` sin errores y compilación de producción correcta. El aviso de tamaño del paquete ya existía.
- Flujo completo en el navegador, con el panel y la tablet en dos pestañas sincronizadas:
  - intérprete visible en el panel y en la ventanita;
  - panel limpio durante la atención;
  - detección con "Servicios básicos de salud";
  - especialidades con el buscador, elegidas tocando la tablet;
  - horarios con horas rápidas y de ejemplo;
  - sin disponibilidad con el aviso;
  - cita asignada y despedida.
- Sin errores en la consola. Sin desborde horizontal en ningún tamaño.
- **No verificado:**
  - la cámara real (el navegador de prueba la bloquea);
  - equipos reales;
  - el modo relé por internet (no cambié nada de la sincronización).

## Archivos tocados

- Panel:
  - [AdminApp.tsx](app/src/admin/AdminApp.tsx)
  - [StepControls.tsx](app/src/admin/StepControls.tsx)
  - [pickers.tsx](app/src/admin/pickers.tsx)
  - [session.ts](app/src/admin/session.ts)
- Tablet:
  - [TabletScreen.tsx](app/src/tablet/TabletScreen.tsx)
  - [TabletApp.tsx](app/src/tablet/TabletApp.tsx)
- Compartidos:
  - [types.ts](app/src/shared/types.ts)
  - [Icon.tsx](app/src/shared/Icon.tsx)
  - [styles.css](app/src/styles.css)
- Documentación:
  - [app/README.md](app/README.md) (sin ⚙; guion de demo actualizado; la seña del número se documenta como opción apagada por defecto)
  - [context.md](context.md) (notas del cambio a "solo toque")

**Estado en git:**
- La mayor parte de estos cambios entró en `ca2d063` (PR #5), junto con `plan_reconocimiento_LSC.md`.
- Los ajustes posteriores (tarjetas, cortes de palabra, botón fijo de enviar, celular en horizontal, aviso y documentación) van en el PR `ajustes1-pendientes`.
