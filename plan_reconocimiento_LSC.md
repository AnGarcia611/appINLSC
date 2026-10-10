# Plan: reconocimiento de señas LSC en InLSC

> Plan del 3-oct-2026. Complementa [investigacion_reconocimiento_LSC.md](investigacion_reconocimiento_LSC.md) (26-sep), con versiones y licencias verificadas de nuevo.

## 0. Resumen

- **Primera función completa: elegir una opción de la infografía con la seña del número (1–9).** Hoy esto lo simula `simulateNumberSign` en `app/src/admin/session.ts`.
- **Cómo funciona:**
  1. La tablet extrae puntos de mano y cuerpo con **MediaPipe Tasks Vision**, en el navegador y sin internet.
  2. Un **clasificador en TypeScript** (sin dependencias) reconoce el número.
  3. Solo se envía al panel el resultado (número + % de confianza). **El video nunca sale de la tablet.**
  4. El funcionario confirma como hoy. El toque en pantalla sigue disponible.
- **Por qué los números primero y no la intención del trámite:**
  - Los números se usan en 3 pasos del flujo (especialidad, cita, horario).
  - Hay datos abiertos de números en LSC: LSC70, con licencia CC BY 4.0 verificada.
  - Su forma está documentada en el diccionario INSOR/ICC.
  - Para las intenciones (*cita*, *cancelar*, *facturar*) **no existe ningún dataset**, y hoy hay 1 sola toma por intención.
  - Lo que se construye para los números (cámara → puntos → normalización → segmentación → clasificador → evento → panel) **se reutiliza tal cual** para intenciones y sí/no en las fases siguientes.

## Estado de la implementación (3-oct-2026, rama `reconocimiento-lsc`)

| Pieza | Estado | Dónde |
|---|---|---|
| MediaPipe 0.10.35 (manos + cuerpo), GPU con respaldo a CPU, fotograma reducido a 640 px | ✅ | `app/src/vision/tracker.ts`, `scripts/prepare-vision.mjs` |
| Características de la mano, segmentación, números 1–9 (forma + flexión), k vecinos con plantillas | ✅ | `app/src/vision/features.ts`, `segmenter.ts`, `numbers.ts`, `knn.ts` |
| Sí/no con la cabeza (asentir/negar) | ✅ en el motor, en la captura y en `?lab`; **no** está en el flujo de atención (no hay paso que lo pida) | `app/src/vision/head.ts` |
| Seña del número en las infografías, con confirmación del funcionario | ✅ **apagada por defecto** (ver nota) | `session.ts`, `StepControls.tsx`, `tablet/SignPanel.tsx` |
| Página de captura y validación `/?captura`, envío por correo | ✅ | `app/src/capture/` |
| Laboratorio de diagnóstico `/?lab` (fps, GPU/CPU, dedos, resultados; `&src=videos/x.mp4` analiza un video) | ✅ (reemplaza la vista `?tablet&debug` del paso 1) | `app/src/vision/VisionLab.tsx` |
| `npm run dataset` (valida paquetes, informe, plantillas) y `npm test` (15 pruebas con manos sintéticas) | ✅ | `scripts/dataset.ts`, `app/test/` |
| Intención del trámite (paso `detect`) | ✅ con la captura de S-9BST + datos simulados (ver `plan_datos_sinteticos.md`). En la tablet también se puede tocar | `app/src/vision/signs.ts` |
| Variantes manuales de sí/no, Web Worker, modo sin conexión con service worker, modelo ONNX | ⏳ fases siguientes | — |

> **Nota (Ajustes1, 28-sep):** el dueño pidió que en las elecciones (especialidades, citas, horarios) el señante **solo toque** y que no se muestre la cámara. Por eso la seña del número queda como preferencia del panel ("Solo toque" / "Toque o seña del número"), **apagada por defecto**. Hay que decidir con el dueño si se activa.

**Verificado:**
- `npm test` pasa.
- El build de producción pasa; MediaPipe queda en un chunk aparte que solo carga la tablet.
- Con los videos de la intérprete: se detectan manos y cuerpo; el índice sostenido se reconoce como 1 (87 %) y el gesto de "negación" como 2 (75 %). Esto muestra que **cualquier forma sostenida puede disparar un número**, y por eso el funcionario siempre confirma.
- Flujo panel ↔ tablet: una seña con baja confianza queda como sugerencia, una con alta confianza marca la opción, y una seña de otro paso se descarta.

**No verificado:**
- Los fps reales en el iPad o en la tablet Android: el navegador de pruebas limita la página a 1 fps.
- Las señas de personas reales: todavía no hay datos.

Medido en un Mac: manos + cuerpo ≈ 32 ms por fotograma con GPU y ≈ 50 ms con CPU a 640 px.

## 1. Compatibilidad con el stack actual (verificada)

| Pieza | Stack actual | Decisión | Compatible |
|---|---|---|---|
| Puntos de referencia | — | `@mediapipe/tasks-vision` **0.10.35**, fijada sin `^`: `HandLandmarker` (2 manos) + `PoseLandmarker` lite | ✅ Es ESM y no necesita SharedArrayBuffer ni cabeceras COOP/COEP, así que funciona en **GitHub Pages** y en `vite preview` por la red local |
| Clasificador fase 1 | — | TypeScript puro (k vecinos sobre ángulos de los dedos + detector de movimiento) | ✅ No agrega dependencias |
| Clasificador fase 3+ | — | PyTorch → ONNX → `onnxruntime-web` 1.30 (wasm, 1 hilo) | ✅ Con 1 hilo no necesita COOP/COEP |
| Bundler | Vite 8 / Rolldown | El wasm y los modelos se copian a `public/vision/`. MediaPipe se carga con `import()` dinámico **solo en la tablet** | ✅ El panel del funcionario no carga los ~25 MB |
| TS 7 / React 19 | — | Las bibliotecas traen tipos `.d.ts` | ✅ |
| Cámara | `getUserMedia` 1280 px, HTTPS | Se reutiliza el mismo `MediaStream` de `TabletApp.tsx`, a 640×480 para procesar | ✅ |
| Sincronización | `WireMessage` por SSE (local) o MQTT (relé) | Nuevo `TabletEvent` `{ type: "sign" }`: unos 100 bytes por resultado | ✅ No cambian los transportes |
| Sin internet | Requisito de la especificación | Todo se sirve desde la propia app; no hay CDN en tiempo de ejecución | ✅ |

**⚠️ Por qué no la 1.0.1, que es la última versión:** desde la 1.0.0, la librería envía telemetría a `odml.pa.googleapis.com` cada 60 s y no se puede desactivar (lo comprobé en el bundle; [issue #6306](https://github.com/google-ai-edge/mediapipe/issues/6306)). En una IPS con datos sensibles conviene evitarlo. La 0.10.35 no tiene telemetría. Si más adelante se sube de versión, hay que bloquear la telemetría con una CSP `connect-src` en `index.html`, cuidando de permitir los brokers MQTT del relé.

**Descartado:**
- **TensorFlow.js:** sin versiones nuevas desde ene-2025.
- **MediaPipe Model Maker:** sin versiones desde 2024 y solo sirve para gestos estáticos.
- **Holistic:** tiene errores abiertos en GPU y Android; Hand + Pose es más estable.
- **LLM multimodal ("Detección señas (claude)"):** requiere internet y no reconoce LSC de forma confiable.

**Peso:** wasm SIMD + no-SIMD ≈ 23 MB (≈ 7 MB comprimido) + `hand_landmarker.task` 7.8 MB + `pose_landmarker_lite.task` 5.8 MB. Se descarga una vez y queda en la caché HTTP. El repo ya versiona 108 MB de videos, así que encaja en el modelo de despliegue actual.

## 2. Cómo se hacen los números en LSC (diccionario INSOR/ICC)

| Número | Forma | Movimiento |
|---|---|---|
| 1 | índice | estático |
| 2 | índice + medio | estático |
| 3 | índice + medio + anular | estático |
| 4 | cuatro dedos, pulgar doblado | estático |
| 5 | todos los dedos abiertos | estático |
| 6 / 7 / 8 / 9 | misma forma que 1 / 2 / 3 / 4, palma al frente | **los dedos se flexionan y extienden** |

**Consecuencia:** 1↔6, 2↔7, 3↔8 y 4↔9 son **pares mínimos**. Una sola foto no basta para distinguirlos. El clasificador se hace en dos etapas:

1. **Forma de la mano** (qué dedos están extendidos) → base 1–5. Se calcula con k vecinos sobre los ángulos de las articulaciones y la orientación de la palma.
2. **Flexión repetida** de los dedos extendidos durante la ventana (oscilación del ángulo de las articulaciones) → +5, solo para las bases 1–4.

Esto es interpretable y funciona con pocos ejemplos. **Hay que validarlo con señantes sordos de Bogotá**, porque hay variantes regionales.

## 3. Arquitectura

```
Tablet                                                          PC funcionario
┌──────────────────────────────────────────────────────┐        ┌─────────────────────────┐
│ MediaStream (ya existe)                              │        │ session.ts              │
│  └ vision/landmarks.ts  MediaPipe Hand+Pose, VIDEO,  │        │  onSign(evt) ──► pick = │
│                         GPU→CPU, rVFC ~15–30 fps     │        │   {selected, "seña",    │
│  └ vision/features.ts   normaliza (hombros, muñeca,  │ event  │    confidence}          │
│                         espejo)                      │ ─────► │ PickControls muestra    │
│  └ vision/segmenter.ts  ¿está señando? reposo →      │ "sign" │  número + % y Confirmar │
│                         seña → reposo                │        │  / Recaptar             │
│  └ vision/numbers.ts    forma (kNN) + flexión → 1–9  │ ◄───── │ TabletState.recognize = │
│  └ useSignRecognizer()  hook React; solo activo si   │ state  │  {task:"number", max:n} │
│                         state.recognize              │        │                         │
└──────────────────────────────────────────────────────┘        └─────────────────────────┘
```

**Decisiones de diseño:**
- **Se clasifica en la tablet**, porque ahí está la cámara. No se envían puntos ni video por la red; esto protege la privacidad y no carga el relé MQTT.
- **El panel decide qué se reconoce:**
  - `TabletState` gana el campo `recognize?: { task: "number"; max: number }`, que lo calcula `buildTabletState` a partir de `optionCount(s)`.
  - La tablet solo emite números entre 1 y `max`.
  - Fuera de esos pasos la cámara no procesa, lo que ahorra batería.
- **Mensaje nuevo:** `TabletEvent` gana `{ type: "sign"; task: "number"; value: number; confidence: number; alternatives: {value, confidence}[] }`. `AdminApp.tsx` lo pasa a una acción nueva, `selectBySign`, que reemplaza a la simulación. El `stepToken` existente evita que un resultado tardío afecte otro paso.
- **Confianza:** se reutilizan los umbrales de `ConfidenceBar` (≥ 80 alta, ≥ 60 media).
  - **≥ 70 %:** la tablet resalta la opción, como ya hace con `selected`.
  - **< 70 %:** el panel muestra "Validación requerida" y el botón *Recaptar*, que ya existe.
  - **El funcionario siempre confirma.**
- **Segmentación:**
  - **Inicio:** una mano visible por encima del codo y movimiento que supera un umbral.
  - **Fin:** de 300 a 500 ms de quietud o las manos en reposo.
  - **Duración:** entre 0.4 y 3 s.
  - **Histéresis:** se evita disparar dos veces la misma seña.
- **GPU con respaldo:** se intenta `delegate: "GPU"`; si falla al crearse, se usa CPU. El modo y los FPS se muestran en un indicador de diagnóstico (`?debug`).
- **Modo demo intacto:** los botones de simulación quedan detrás de un interruptor "Simular" para demos sin cámara.

## 4. Datos

| Fuente | Uso | Licencia |
|---|---|---|
| **Capturas propias** con la página `/?captura` (§5b): ≥ 10 señantes × 5 tomas × 9 números, más ejemplos de "nada/otro" | Plantillas y evaluación | Consentimiento en la propia página (§5b, §7). Se guardan fuera del repo público |
| **LSC70**: números 0–10, 70 personas, secuencias de 6 fotos | Plantillas de forma y validación inicial | **CC BY 4.0** (verificado en Mendeley); hay que citarlo |
| LSC-54: números 1–10 en puntos 3D | Solo validación e investigación | CC BY-NC, ⚠️ no comercial |
| Diccionario INSOR | Referencia para los señantes voluntarios | Sin licencia abierta: no usarlo como datos de entrenamiento sin permiso escrito |

**Formato:** solo se guardan **puntos de referencia normalizados** (JSON), no video. Las plantillas finales van en `app/public/vision/numbers.templates.json`, unos cientos de KB.

## 5. Plan de implementación de la fase 1 (números 1–9)

Cada paso se puede entregar y probar por separado.

1. **Infraestructura de visión** (≈ 2 días)
   - `npm i -E @mediapipe/tasks-vision@0.10.35`.
   - `scripts/prepare-vision.mjs`, con un comando `npm run vision`: copia `node_modules/@mediapipe/tasks-vision/wasm` a `public/vision/wasm` y descarga una vez los `.task` a `public/vision/models`. Se hace commit de esos archivos, como ya se hace con los videos.
   - Agregarlo a `deploy.yml` antes de `npm run build`.
   - `src/vision/tracker.ts` (en el plan, `landmarks.ts`): inicializa con `FilesetResolver.forVisionTasks(import.meta.env.BASE_URL + "vision/wasm")`, aplica el respaldo de GPU a CPU y recorre los fotogramas con `requestVideoFrameCallback`.
   - Vista `?tablet&debug` que dibuja el esqueleto sobre la cámara y muestra FPS y delegado. **Probarla en el iPad y la tablet Android reales antes de seguir.**
2. **Características y segmentación** (≈ 2 días)
   - `features.ts`: centra en la muñeca, escala por el tamaño de la palma, calcula los 15 ángulos de articulación y la normal de la palma, y corrige el espejo de la cámara frontal. Se identifica la mano dominante, la más alta o la que más se mueve.
   - `segmenter.ts`: máquina de estados `reposo → señando → fin`.
   - Pruebas unitarias con secuencias grabadas en JSON. Hoy no hay ejecutor de pruebas; la propuesta es agregar `vitest`, que es coherente con Vite.
3. **Clasificador de números** (≈ 2 días)
   - `numbers.ts`: k vecinos sobre la forma (base 1–5) + detector de flexión (+5).
   - Devuelve el número, la confianza y las alternativas.
   - Se restringe a `1..max`.
4. **Página de grabación y validación para señantes** (≈ 3 días; detalle en §5b)
   - Página propia `/?captura` que el señante usa solo, en la tablet o en su celular.
   - Entrega del paquete por correo.
   - Una página de laboratorio, solo en desarrollo, procesa las imágenes de LSC70 con `HandLandmarker` en modo IMAGE y produce plantillas en el mismo formato. Todo queda en TypeScript, sin Python en esta fase.
5. **Integración con el flujo** (≈ 1–2 días)
   - Ampliar los tipos (`recognize`, evento `sign`), `buildTabletState`, `selectBySign` en `session.ts` y `PickControls`, para mostrar el resultado real y el interruptor de simulación.
   - En la tablet, `useSignRecognizer`, activo solo en los pasos `menu` y `horarios`.
   - Agregar un aviso discreto en la tablet: "Haga la seña del número o toque la opción".
6. **Evaluación y ajuste** (≈ 2 días)
   - Script de evaluación **dejando señantes fuera** del entrenamiento: matriz de confusión con atención a los pares 1/6, 2/7, 3/8 y 4/9.
   - Ajuste de umbrales.
   - **Criterios de aceptación:**
     - ≥ 90 % de acierto en el top-1 con señantes nuevos.
     - < 5 % de falsos disparos en 2 minutos de "no señar".
     - Latencia < 1 s desde que termina la seña.
     - ≥ 15 FPS en la tablet del mostrador.

**Total aproximado: 2 semanas**, más el tiempo de grabación con señantes, que va en paralelo desde el día 1.

**Orden recomendado:** hacer el paso 4 justo después del paso 1. Así los señantes empiezan a grabar mientras se construyen los pasos 2 y 3, y el clasificador se ajusta con datos reales desde el principio.

## 5b. Página de grabación y validación (`/?captura`)

Página independiente del flujo de atención. No necesita sesión ni panel del funcionario. Funciona en la tablet del mostrador o en el celular del señante, porque comparte el despliegue actual en `inlscasiste.store/?captura`.

### Pantallas

1. **Bienvenida y consentimiento en LSC**
   - Video del intérprete con el texto debajo: para qué se usan los datos, que **no se graba video, solo puntos de las manos y la cara**, que es voluntario, cuánto tiempo se guardan y cómo pedir que se borren.
   - Casillas separadas para "usar para entrenar" y "usar para evaluar".
   - Sin aceptar no se puede seguir.
2. **Perfil anónimo**
   - Se genera un código de señante (p. ej. `S-7KQ2`). **No se pide el nombre.**
   - Preguntas opcionales: sordo/oyente/intérprete, mano dominante, rango de edad, región donde aprendió LSC.
   - Sirven para medir si el modelo funciona igual para todos.
3. **Grabación guiada por tareas**
   - Una lista de señas por grabar, p. ej. los números 1–9 × 5 tomas, más "nada/otro" y, en fases siguientes, sí/no y los trámites.
   - Para cada seña: video o foto de referencia, cuenta regresiva y grabación con el segmentador. La grabación se corta sola al volver al reposo.
   - **Repetición inmediata del esqueleto** dibujado: el señante decide *Guardar* o *Repetir*. Así cada toma queda validada por quien la hizo.
   - Avisos en vivo: "no se ve la mano", "muy oscuro", "acérquese".
   - Barra de progreso (p. ej. 23/45).
4. **Validación de vocabulario**
   - Para cada seña se muestra la descripción de referencia (diccionario INSOR/ICC) y se pregunta: *"¿Así la hace usted?"* → **Sí / Lo hago distinto**.
   - Si responde *distinto*, se graba su variante con una etiqueta aparte, p. ej. `7-variante`.
   - Así se detectan variantes regionales antes de entrenar.
5. **Prueba del reconocedor** (cuando exista el clasificador)
   - El señante hace un número, la página muestra lo que entendió y el señante marca ✓ o ✗.
   - Cada intento queda etiquetado y sirve como dato de evaluación real.
6. **Enviar**: ver la sección siguiente.

**Progreso guardado:** se guarda en `IndexedDB` de la propia tablet. Si se cierra la página o se acaba la batería, se retoma donde iba. Cuando el paquete ya se envió, se borra con un botón.

### Cómo llega el paquete

| Opción | Cómo | Ventajas | Inconvenientes |
|---|---|---|---|
| **A. Compartir por correo (recomendada)** | Botón **Enviar**. Con la Web Share API (`navigator.share({ files })`), iPad y Android abren su menú de compartir con el archivo ya adjunto. El señante elige Correo y escribe la dirección del proyecto | Sin servidor, sin claves, sin terceros. Funciona en GitHub Pages y en la red local | El señante hace 2 toques más |
| A'. Respaldo | Si el navegador no puede compartir archivos, se ofrece **Descargar** + un enlace `mailto:` con asunto y cuerpo prellenados (`mailto:` no puede adjuntar, así que se adjunta a mano) | Funciona en cualquier navegador | Más pasos |
| B. Subida directa (más adelante, si el volumen crece) | Cloudflare Worker (el DNS ya está en Cloudflare) que recibe el paquete y lo guarda en un bucket R2 **privado**. Tú lo descargas desde el panel de Cloudflare | No depende del correo | Agrega un backend, una clave secreta y un encargado del tratamiento de datos |
| ✗ Directo al repo | La página no puede escribir en GitHub sin una clave expuesta en el navegador | — | **Descartado:** la clave quedaría pública y el repo es público |

**Archivo enviado:** `inlsc_captura_S-7KQ2_2026-10-15.json.gz`. Contiene versión del formato, consentimiento (casillas y fecha), perfil anónimo, versión de los modelos, y por cada toma: etiqueta, fotogramas y puntos normalizados.
- Se cuantiza a 3 decimales y se comprime con `CompressionStream("gzip")`, nativo en el navegador.
- Unas 45 tomas ≈ 1 MB. Cabe en cualquier correo.

**Del correo al proyecto:**
1. Guardas los `.json.gz` en una carpeta **privada**: un repo privado aparte (p. ej. `inlsc-datos`) o una carpeta de Drive compartida solo con el equipo. **No en este repo**, porque es público.
2. `npm run dataset -- <carpeta>` valida los paquetes:
   - formato y consentimiento;
   - descarta duplicados;
   - genera `public/vision/numbers.templates.json` (solo plantillas agregadas, sin perfil ni consentimiento) y un informe de cuántas tomas hay por seña, por señante y por mano dominante.
3. Las plantillas sí se publican con la app: son necesarias para reconocer. Para reducir el riesgo, se publican **solo los puntos de las manos**, sin cara ni cuerpo, y sin código de señante.

### Implementación

- `src/capture/CaptureApp.tsx` + `main.tsx`: nueva ruta `?captura`, junto a la del panel y la de la tablet.
- Reutiliza `src/vision/*` (pasos 1–2), `LscVideo` para el consentimiento y las referencias, e `Icon`.
- Lista de tareas en datos: `src/capture/tasks.ts`, con el mismo estilo que `flows.ts`. Agregar señas nuevas no requiere tocar código.
- Sin dependencias nuevas: `IndexedDB`, `CompressionStream` y Web Share son nativos (Safari ≥ 16.4).
- **Se necesita de ustedes:**
  - el texto del consentimiento, revisado por quien maneje habeas data en la IPS;
  - el **video del consentimiento en LSC**;
  - la dirección de correo de destino.

## 6. Fases siguientes (misma infraestructura)

| Fase | Qué | Cómo |
|---|---|---|
| 2 | **Sí / No** (para confirmar "¿Eligió 7?") | Variantes manuales: plantillas y DTW. **Asentir o negar con la cabeza** con los puntos de nariz y ojos de `PoseLandmarker` (oscilación de cabeceo o giro), **sin un modelo extra** |
| 3 | **Intención del trámite** (3 clases + "otra") en el paso `detect` | Arranque con plantillas + DTW sobre secuencias de manos y cuerpo, usando las capturas del modo de captura. Con ≥ 10 señantes: 1D-CNN pequeña en PyTorch (Python 3.12 y `mediapipe` 1.0.1 con la API de *tasks*, no `mp.solutions`) → ONNX → `onnxruntime-web` |
| 4 | Robustez | Web Worker si los FPS no alcanzan (iOS ≥ 17), aumento de datos (espejo, rotación, deformación temporal) y caché sin conexión con service worker |

## 7. Requisitos no técnicos (bloquean la grabación, no el código)

- **Ley 1581/2012:** las imágenes de la cara y las manos son **datos biométricos sensibles**, y más en un contexto de salud. Hace falta:
  - **autorización explícita y opcional, presentada en LSC** (video o intérprete);
  - permisos por separado para entrenar, publicar y mostrar la cara;
  - plazo de conservación y forma de revocar el permiso.
- Guardar solo puntos de referencia reduce el riesgo, pero no lo elimina. La Circular SIC 002 de 2024 regula la IA con datos personales.
- **Este repositorio es público** (lo exige GitHub Pages en el plan gratuito). Los paquetes de captura nunca se suben aquí: van a un repo privado o a una carpeta restringida (§5b).
- **Comunidad sorda:**
  - validar con INSOR o FENASCOL las señas, sobre todo las variantes regionales de los números y, más adelante, *cita* y *cancelar*;
  - pagar a los señantes que participen;
  - incluir personas sordas nativas, zurdas y de distintas edades.
- **No presentarlo como interpretación.** Mantener el toque como alternativa y el Centro de Relevo (SIEL) como escalamiento.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Confusión entre 1↔6, 2↔7, 3↔8 y 4↔9 | Detector de flexión explícito, confirmación del funcionario y toque como alternativa. Si no se llega al objetivo, limitar el reconocimiento por seña a 1–5 y usar toque para 6–9 |
| GPU inestable en Safari | Respaldo automático a CPU y prueba temprana en el dispositivo real (paso 1) |
| Pocos señantes | El modo de captura en el mostrador + LSC70. Medir siempre con señantes que no se usaron para entrenar |
| Falsos disparos (otra persona, gestos sin intención) | Segmentador con histéresis; solo se procesa en los pasos con `recognize` y solo la persona más cercana o centrada |
| Peso de la descarga | Carga diferida solo en la tablet y caché del navegador |
