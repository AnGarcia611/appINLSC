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
| **Capturas propias** con el modo de captura (§5, paso 4): ≥ 10 señantes × 5 tomas × 9 números, más ejemplos de "nada/otro" | Plantillas y evaluación | Consentimiento propio (§7) |
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
   - `src/vision/landmarks.ts`: inicializa con `FilesetResolver.forVisionTasks(import.meta.env.BASE_URL + "vision/wasm")`, aplica el respaldo de GPU a CPU y recorre los fotogramas con `requestVideoFrameCallback`.
   - Vista `?tablet&debug` que dibuja el esqueleto sobre la cámara y muestra FPS y delegado. **Probarla en el iPad y la tablet Android reales antes de seguir.**
2. **Características y segmentación** (≈ 2 días)
   - `features.ts`: centra en la muñeca, escala por el tamaño de la palma, calcula los 15 ángulos de articulación y la normal de la palma, y corrige el espejo de la cámara frontal. Se identifica la mano dominante, la más alta o la que más se mueve.
   - `segmenter.ts`: máquina de estados `reposo → señando → fin`.
   - Pruebas unitarias con secuencias grabadas en JSON. Hoy no hay ejecutor de pruebas; la propuesta es agregar `vitest`, que es coherente con Vite.
3. **Clasificador de números** (≈ 2 días)
   - `numbers.ts`: k vecinos sobre la forma (base 1–5) + detector de flexión (+5).
   - Devuelve el número, la confianza y las alternativas.
   - Se restringe a `1..max`.
4. **Modo de captura de datos** (≈ 2 días)
   - En el panel, ⚙ → *Captura de datos*: el funcionario elige la etiqueta (p. ej. "7"), la tablet graba la ventana segmentada y envía los puntos.
   - El panel acumula las muestras y exporta un `.json`.
   - Así se graba en el mostrador real, con la misma cámara, luz y ángulo, sin manipular video.
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
