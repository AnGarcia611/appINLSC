# InLSC: contexto del proyecto

> Documento armado a partir de los materiales del repositorio (26-sep-2026). Todavía **no hay código propio en el repo**. Lo que hay son especificaciones, recursos gráficos, videos y un prototipo exportado de Figma Make.
>
> **Nota (10-oct-2026):** este documento describe el proyecto **antes** de escribir la app. Hoy el código está en `app/` (ver `app/README.md`) y el servicio de correo en `captura-mail/`. Las menciones a `src/App.tsx`, `CITAS_MOCK` o la detección simulada de las secciones 5 y 6 se refieren al prototipo de Figma (`figma/App Builder.zip`), no a la app actual: en la app el reconocimiento del trámite y de los números es real (en prueba).

## 1. ¿Qué es?

**InLSC** ("Asistente en LSC salud") es un asistente para la **atención administrativa de personas sordas** que se comunican en **Lengua de Señas Colombiana (LSC)** en la recepción de una IPS. El cliente o piloto es **IPS Virrey Solís, sede Olaya** (aliada con Salud Total EPS).

No es una herramienta médica ni de diagnóstico. Solo cubre **trámites administrativos**:

1. **Asignación de cita**
2. **Cancelación de cita**
3. **Facturación de cita**

En los materiales el usuario sordo se llama **"señante"** y el funcionario de recepción se llama **"admon"** (administrador).

## 2. Cómo funciona físicamente

(ver `como funcionaria.png` y `ejemplo de vistas.jpg`)

- **PC del funcionario (admon):** InLSC corre como un **chat o panel lateral flotante** (a la derecha o a la izquierda, y se puede minimizar o maximizar) encima del sistema interno de la IPS, que sigue usable en el resto de la pantalla. El funcionario **controla el flujo**: decide qué respuesta enviar y cuándo.
- **Tablet del señante:** está sobre el mostrador, en **formato horizontal**, con cámara. Muestra videos en LSC, infografías de selección y una barra de progreso. Su cámara capta las señas del usuario.
- **Conexión:** es **por red local (IP), sin internet**. La PC sirve la app y la tablet abre `http://<ip-pc>:<puerto>?signer`.

## 3. Flujo paso a paso

(según `indicaciones inlsc.pdf`)

En la columna **Dispositivo**, 🟪 significa PC admon y 🟩 significa tablet señante.

| # | Dispositivo | Paso |
|---|---|---|
| 1 | 🟪🟩 | Conectar PC y tablet por red local (idealmente ya conectadas por defecto) |
| 2 | 🟪 | En la web de la IPS aparece una "ventanita" flotante *"¿Necesita ayuda? → Iniciar atención"*. Al maximizarla se inicia la atención |
| 3 | 🟩 | Video de **saludo** ("Buen día") |
| 4 | 🟩 | Video de **pregunta de solicitud** ("¿Cuál es su solicitud?") |
| 5 | 🟩🟪 | **Detección de la seña** (IA). El señante hace la seña libre del trámite. En la PC se muestra el trámite detectado con una **barra de % de precisión** (p. ej. 91 %) |
| 6 | 🟪 | El funcionario **confirma** el trámite detectado, lo corrige o pide **"repetir seña"** si duda |
| 7 | 🟩 | Siempre visible: **barra de progreso** del trámite |

### 3a. Asignación de cita

| # | Disp. | Paso |
|---|---|---|
| 8 | 🟩 | Video "solicitud de documento" |
| 9 | 🟪 | El funcionario elige qué **especialidades o servicios** mostrar |
| 10 | 🟩 | **Infografía** con las opciones elegidas (sobre una plantilla fija) + video "seleccione su cita". El señante responde con la **seña del número** o tocando la pantalla. *Ajustes1 (28-sep): el dueño pidió que en las elecciones el señante solo toque la pantalla, sin cámara. Por eso la seña del número existe, pero viene apagada por defecto (preferencia del panel).* |
| 11 | 🟩 | Video "orden médica" |
| 12 | 🟪 | Botón de verificación para continuar |
| 13 | 🟪→🟩 | El funcionario configura **fechas y horarios** disponibles. La tablet los muestra en una infografía + video. Si no hay disponibilidad, se muestra el **video de negación** |
| 14 | 🟩 | Pantalla **"Cita asignada ✓"** con especialidad, fecha y hora |
| 15 | 🟩 | Video "que tenga un buen día" |

### 3b. Cancelación de cita

Video "solicitar documento" → infografía "seleccione la cita" → video e imagen "su cita ha sido cancelada" → imagen de confirmación de la cancelación.

### 3c. Facturación de cita

Video "solicitud de documento" → video "orden médica" → video "pago en efectivo" → **imagen del monto ($) + video "valor"** (el funcionario escribe el valor en un campo) → video "su recibo" → video "espere en sala" → video "con gusto".

## 4. Reglas adicionales

(tabla de "Indicaciones extra" del PDF)

| Tema | Regla |
|---|---|
| **Género del admon** | Si el perfil del funcionario es hombre, se envían solo videos del intérprete hombre (`video_h_*`). Si no, los de mujer (`video_m_*`). Si faltan videos de hombre, se usan los de mujer como respaldo |
| Disponibilidad | Si no hay fecha u horario disponible, se muestra el video de **negación** |
| Especialidades y servicios | El funcionario selecciona cuáles mostrar |
| Fechas y horarios | El funcionario configura las opciones disponibles |
| Infografía | Las opciones elegidas se pintan dentro de la **plantilla existente** |
| Botones | Especialidades, servicios, fechas y horas se muestran como botones |
| Repetir seña | Opción disponible si el funcionario duda de la precisión |
| Chat administrador | Toda la app se ve como un chat lateral que se puede minimizar o maximizar |
| Tablet | Vista completa horizontal para el señante |
| Respuestas | El funcionario decide cuándo se envía cada respuesta |
| Saludo / despedida | Pueden reproducirse automáticamente |
| Facturación | Campo para el valor ($), que se muestra en la tablet junto con el video "valor" |
| Entrenamiento IA | Videos para entrenar a la "IA Visor" que detecta el servicio |
| Registro de información | Es opcional: el funcionario puede guardar la info del servicio (p. ej. "usuario 1 + su solicitud") por **una semana** como máximo |

## 5. Inventario del repositorio

```
appINLSC/
├── indicaciones inlsc.pdf          ← ESPECIFICACIÓN PRINCIPAL (6 págs., flujo + reglas)
├── como funcionaria.png            ← render conceptual del mostrador (funcionario + tablet)
├── ejemplo de vistas.jpg           ← storyboard de 4 pasos en la tablet
├── figma/App Builder.zip           ← prototipo React exportado de Figma Make (ver §6)
├── infografias/Untitled (1).pdf    ← plantillas infográficas de la tablet (especialidades y fechas), llenas y vacías
├── servicios_especialidades/especialidades_tarjetas.pdf
│                                   ← catálogo: ~27 especialidades × 3 servicios c/u, con color e icono
└── Videos_señantes/                ← banco de videos LSC (ver §7)
```

- **Enlace de Figma Make** (del PDF): https://www.figma.com/make/TTF62hc7YvHiLMC09tM3kj/App-Builder?p=f&t=WT4EfqtSAnTZbJCT-0
- **Branding de la tablet:** banner azul "InLSC | Bienvenido/a a IPS Virrey Solis. Estamos listos para atenderte." Tarjetas de color con la especialidad en la pestaña, un icono y el servicio. A la derecha va el intérprete con la instrucción "seleccione su cita/horario en la pantalla".

## 6. El prototipo de Figma Make (`figma/App Builder.zip`)

**Stack:** React 19, Vite 8, Tailwind v4 y TypeScript. Node 22 y pnpm (`.mise.toml`). Única dependencia extra: `qrcode.react`, que no se usa en el flujo actual. Casi todo el código está en un solo archivo, `src/App.tsx` (~1170 líneas), junto con `src/index.css` (~53 KB).

**Sincronización PC↔tablet:** es un plugin propio de Vite (`inlscSyncPlugin` en `vite.config.ts`) que usa **Server-Sent Events** en la red local:

- `GET /inlsc-host` devuelve las IPs locales y el puerto (8443 por defecto).
- `GET /inlsc-events` es el stream SSE al que se suscribe la tablet.
- `POST /inlsc-state` es donde el admin publica el estado de la vista del señante. El servidor guarda el último estado y lo reenvía a todos los clientes.
- ⚠️ Solo funciona con `vite dev` (`apply: 'serve'`). **No existe en un build de producción**, así que habrá que hacer un backend real.

**Enrutamiento:** si la URL tiene `?signer`, se abre `SignerTabletView`. Si no, se abre `AdminApp`.

**Flujo del admin (`AdminApp`):** `FloatingLauncher` (la "ventanita") → `IntakeSession` (espera simulada de 3 s) → `AdminDock`, que es el panel lateral real con estas fases:
`qr` (pantalla para emparejar la tablet) → `greeting` → `detecting` → `confirmed` (se elige o corrige el trámite) → `flow` → `farewell`.

- `FLOW_PATHS` define los 3 trámites y sus pasos: `video`, `specialty`, `date` y `cita`.
- `SpecialtyTable`, `DateTimePicker` y `CitaTable` sirven para que el funcionario arme la infografía y la envíe a la tablet.
- `ConfidenceBar` pinta verde a partir de 80 %, amarillo a partir de 55 % y rojo por debajo.
- **Todo lo "inteligente" está simulado.** La detección de la seña es un `setTimeout` que siempre devuelve "Asignación" con 91 %, y el número detectado es siempre el 1 con 94 %. Las citas son mock (`CITAS_MOCK`).
- `VideoCard` es un **placeholder en CSS**. **No reproduce los `.mp4` reales.**
- La vista `SignerTabletView` tiene las fases `waiting`, `video`, `infographic`, `confirmed` y `farewell`, más la barra de progreso.
- Todavía **no están implementados:** el flujo de facturación con campo de valor ($), la selección de videos por género, el video de negación, la persistencia de una semana y la detección real por cámara.
- Hay código legado sin alcanzar: la vista de escritorio de 3 paneles de "Señas Salud" (menú, calendario, sedes, etc.) que viene del brief de diseño original. Está después de `if (recognitionReady) return <AdminDock />` y nunca se ejecuta.
- `src/imports/pasted_text/senas-salud-app-design.md` es el **prompt original de diseño** ("Señas Salud"). Es más amplio que el alcance actual (sedes, consultar cita, panel de varias atenciones) y ya lo **reemplaza el PDF de indicaciones**.

## 7. Banco de videos (`Videos_señantes/`)

Cada intención tiene un ID `INTxx`. Los `LEEME.txt` indican:

- **Canal Sistema→Usuario ("Banco de respuestas"):** videos que la tablet le muestra al señante. Basta con 1 o 2 tomas limpias.
- **Canal Usuario→Sistema ("Reconocimiento ML — entrada"):** videos para **entrenar el reconocimiento**. Se recomiendan al menos 3 señantes distintos × 2 o 3 tomas.
- Nombre sugerido para cada archivo: `INTxx_nombre_S<idSeñante>_T<numToma>.mp4`.
- Los videos se registran en la hoja `05_Dataset_Expresiones` de **`InLSC_Dataset_GuionReal_corregido.xlsx`**. ⚠️ **Ese archivo no está en el repo.**

**Tipos de archivo encontrados:**

- `INTxx_…` / `INTOxx_…` / `03INTxx_…` son **grabaciones reales de señantes**, hechas en casa con fondo doméstico. Sirven de referencia o fuente.
- `video_h_…` / `video_m_…` son las **versiones "de producción"**: intérprete **hombre o mujer** con uniforme de la IPS y fondo neutro. Parecen generadas o avatarizadas a partir de la grabación real. **Son las que se muestran en la tablet** según el género del funcionario.
- Las carpetas sueltas `01 agendar_cita_por favor/`, `02 cancelacion cita/` y `03INT_facturar_cita/` tienen la **seña del usuario pidiendo el trámite** (entrada para entrenar la detección).

| Trámite | Intención (ID LEEME) | Real | h | m |
|---|---|---|---|---|
| Asignación | INT01 saludo "Buen día" | ✅ | ✅ | ✅ |
| | INT02 pregunta de solicitud | ✅ | ✅ | ✅ |
| | INT03 solicitar documento | ✅ | ✅ | ✅ |
| | INT04 pregunta de especialidad | ✅ | ✅ | ✅ |
| | INT07 aceptación (*Usuario→Sistema, ML*) | ✅ | ❌ | ✅ |
| | INT09 despedida | ❌ carpeta vacía | ❌ | ❌ |
| | negación (INTO10) | ✅ | ❌ | ✅ |
| | deseo buen día (INTO11) | ✅ | ✅ | ✅ |
| | selección de cita (INTO12) | ✅ | ✅ | ✅ |
| | *seña "agendar cita"* (entrada ML) | ✅ 1 toma | — | — |
| Cancelación | solicitar documento | ❌ | ✅ | ✅ |
| | selección de cita | ✅ | ✅ | ✅ |
| | "ha sido cancelada" | ✅ | ✅ | ✅ |
| | INT12 confirma cancelada | ❌ carpeta vacía | ❌ | ❌ |
| | *seña "cancelación cita"* (entrada ML) | ✅ 1 toma | — | — |
| Facturación | orden médica | ✅ | ❌ | ✅ |
| | pago en efectivo | ✅ | ❌ | ✅ |
| | INT15 valor | ✅ (`Video Project 23`) | ❌ | ❌ |
| | INT17 su recibo | ✅ | ❌ | ✅ |
| | INT18 espere en sala | ✅ | ❌ | ✅ |
| | INT19 con gusto | ✅ | ❌ | ✅ |
| | *seña "facturar cita"* (entrada ML) | ✅ 1 toma | — | — |

Los videos duran entre 2 y 8 s. **Faltan casi todos los videos de hombre para facturación**, lo que concuerda con la regla de usar los de mujer como respaldo.

**Inconsistencias en los nombres:**

- Se mezclan `INT` e `INTO`.
- Los números de las carpetas no coinciden con los IDs de los LEEME. Por ejemplo, la carpeta `03INT04_su_recibo` corresponde al ID `INT17_recibo`.
- Algunas **carpetas** terminan en `.mp4`.
- Hay nombres genéricos como `Video Project 13.mp4` y espacios o tildes en las rutas.

Conviene normalizar todo esto antes de consumir los videos desde código.

## 8. Qué falta o qué hay que construir

1. **App real (PC + tablet)** a partir del prototipo: separar componentes, agregar un backend de sincronización para producción (WebSocket o SSE en un servidor Node local) y reproducir los `.mp4` reales.
2. **Motor de reconocimiento LSC ("IA Visor"):**
   - Clasificar la intención entre 3 clases (asignación, cancelación, facturación).
   - Reconocer las **señas de números** para elegir opciones en las infografías. *Implementado como beta (1–9), apagado por defecto porque Ajustes1 (28-sep) pide solo toque en las elecciones. Falta que el dueño decida si se activa (ver [ajustes1_resumen.md](ajustes1_resumen.md)).*
   - Reconocer aceptación y negación.
   - El PDF dice "Detección señas (claude)". Hay que definir si se usa un modelo de visión o LLM, o un modelo propio entrenado con el dataset. **Con el dataset actual (1 toma por intención) no alcanza para entrenar un modelo propio.** Ver [investigacion_reconocimiento_LSC.md](investigacion_reconocimiento_LSC.md).
3. **Generador de infografías** sobre la plantilla (especialidades, servicios, fechas y citas) usando el catálogo de `especialidades_tarjetas.pdf`.
4. **Panel del funcionario:** perfil con género, selección de especialidades y servicios, configuración de fechas y horarios, campo de valor de factura, repetir seña y confirmaciones.
5. **Persistencia opcional** con expiración a 7 días (hay que definir qué datos se guardan; son datos de salud, así que se aplica la Ley 1581 de habeas data).
6. **Videos pendientes:** INT09 despedida, INT12 confirma cancelada, las versiones h de facturación, el valor en versiones h/m y más tomas de entrada para ML.

## 9. Preguntas abiertas para el cliente

- ¿Hay que integrarse con el sistema de agendamiento real de la IPS o las citas y horarios los ingresa siempre a mano el funcionario?
- ¿Qué se espera exactamente de "Detección señas (claude)"? ¿Usar un modelo multimodal por API, cuando la especificación exige operar **sin internet**?
- ¿Dónde está `InLSC_Dataset_GuionReal_corregido.xlsx`?
- ¿Los videos `video_h` / `video_m` son definitivos o se van a regenerar?
- ¿Cómo se inyecta la "ventanita" en el sistema de la IPS: extensión de navegador, overlay de escritorio o widget web?
- ¿Qué hardware hay (modelo de tablet, cámara externa como en el render)?
- ¿Qué datos exactos guarda el "registro de información" de una semana y quién puede verlos?
