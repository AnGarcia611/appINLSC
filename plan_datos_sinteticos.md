# Plan: datos simulados a partir de la captura de S-9BST para la demo con manos

> Plan del 9-oct-2026. Parte de la única captura disponible y la usa para completar el reconocimiento por manos en **una sola entrega**. Complementa [plan_reconocimiento_LSC.md](plan_reconocimiento_LSC.md).

## 0. Resumen

- **Llegó bien:** 1 señante (código S-9BST), 152 tomas, 263 pruebas del reconocedor y 13 validaciones de vocabulario. En las 13 dijo "así la hago". Consentimiento: entrenar ✅, evaluar ✅.
- **Qué falta para la demo con manos:** el paso *¿Cuál es su solicitud?* sigue con *Simular reconocimiento*. No hay reconocedor de trámites (asignar, cancelar, facturar) ni rechazo de "no es un número".
- **Cómo "simular" más datos:** cada toma real se transforma en muchas variantes creíbles. Se cambian la cámara, la distancia, la velocidad, las proporciones de la mano, la mano dominante y el ruido del detector. Así se pasa de unas 150 tomas reales a unas **7 000 secuencias sintéticas**.
- **Límite honesto:** se simula *cómo varía la toma*, no *cómo señan otras personas*. La demo va a funcionar bien con S-9BST o con alguien que señe parecido. No sirve para afirmar que reconoce LSC en general.

## 1. Qué llegó

Los dos archivos son **el mismo paquete** (mismo `id`):

| Archivo | Exportado | Contenido |
|---|---|---|
| `…-10-09.json` | 16:10 | Solo las 263 pruebas; todavía sin tomas |
| `…-10-09-2.json` | 16:53 | Todo: pruebas + 152 tomas + validaciones. **Este es el que vale.** `npm run dataset` ya se queda con el más reciente |

**Tomas por seña:**

| Seña | Tomas | Mano visible | Observación |
|---|---|---|---|
| Números 1–9 | 7–13 c/u (93) | 64–86 % | Suficiente para plantillas |
| Asignar / cancelar / facturar | 10 / **6** / 8 | 83–93 % | Usa las 2 manos (47–75 % de los fotogramas). **Las 24 tomas se cortaron en el tope de 6 s** |
| Sí y no con la cabeza | 10 / 10 | — | Solo cuerpo y cara |
| Sí con la mano / No con el índice | 8 / 9 | 86–98 % | La mayoría también llegan al tope de 6 s |
| Nada | **3** | 32 % | Muy pocas |
| Otra | **1** | 75 % | Muy pocas |

**Avisos:**
- **Tope de 6 s** (`MAX_MS` en `Recorder.tsx`): los trámites probablemente quedaron incompletos. El reconocedor debe decidir con los primeros segundos y no esperar a que la persona baje la mano.
- El consentimiento es la versión `borrador-2026-10-03`. Antes de usar estos datos fuera de la demo hay que tener la versión revisada.
- Los paquetes son datos biométricos: se guardan **fuera del repo**, por ejemplo en `~/inlsc-datos/`. Nada de este plan los sube a GitHub.

## 2. Línea base: cómo le va hoy al reconocedor con estas tomas

Pasé las tomas reales por el código actual (`NumberRecognizer` y `HeadGestureDetector`, sin plantillas):

| Qué | Resultado | Lectura |
|---|---|---|
| Números (tomas) | ≈ 91 % (86/93) | Bien. El punto débil es **5 → 4** (5/8 en las tomas; 22/54 en las pruebas en vivo): el pulgar no se detecta extendido |
| 7 → 2 | Solo al inicio de las pruebas en vivo | El ajuste de flexión ya lo corrigió (7/7 en las últimas pruebas) |
| "No" con el índice | Se lee como 1, 6 o 7 | **No hay clase de rechazo.** Cualquier índice levantado se toma como número |
| Trámites | El reconocedor de números dispara 4, 5, 6 o 9 | No hay reconocedor de trámites |
| Cabeza | Dispara "sí" en ~80 % de las tomas con manos y en las 9 pruebas de "ninguna" | Al señar, el cuerpo se mueve. **No se puede tener encendido mientras se usan las manos** |
| **Prueba rápida de trámites** (DTW 1-vecino, dejando una toma fuera) | **26/28** (asignar, cancelar, facturar, nada, otra) | Las 3 señas se separan bien. Es una buena señal de que un clasificador sin dependencias alcanza |

## 3. El generador de datos simulados

`app/scripts/simular.ts` (Node, sin dependencias, con semilla fija para que siempre dé lo mismo):

```
npm run simular -- ~/inlsc-datos ~/inlsc-datos/sinteticos
```

Lee los paquetes reales y escribe paquetes sintéticos con el **mismo formato** `inlsc-captura`. Así, `dataset`, la evaluación y la página de prueba los leen sin cambios. Cada variante se marca con `synthetic: true` y con el `id` de la toma de origen.

### 3.1 "Personas" sintéticas

Se crean unas 50 personas. Cada una tiene parámetros fijos que se aplican a todas sus tomas:

| Parámetro | Rango | Qué simula |
|---|---|---|
| Largo de dedos y palma | ±12 % por hueso | Manos distintas. Se reconstruye la mano con los mismos ángulos de las articulaciones, así la seña no cambia |
| Ancho de hombros y altura | ±15 % | Cuerpos distintos |
| Mano dominante | 25 % zurdos (espejo) | Señantes zurdos (no hay ninguno en los datos) |
| Abertura del pulgar | En 5: de pegado a muy abierto | **El error 5 → 4.** Se generan "5" con pulgar poco visible y "4" con pulgar bien doblado |
| Amplitud y velocidad propias | 0.8–1.2 × | Estilo: señar grande o chico, rápido o lento |

### 3.2 Variaciones por toma

| Tipo | Transformación | Rango |
|---|---|---|
| Cámara | Distancia (escala), posición en el cuadro, inclinación, giro 3D | 0.7–1.3 ×, ±15 % del cuadro, ±12°, ±20° |
| Tiempo | Velocidad no lineal, recorte de inicio y fin, fps | 0.7–1.4 ×, ±300 ms, 10–30 fps |
| 6–9 | Número de flexiones | 1–4 ciclos (hoy casi siempre 2–3) |
| Detector | Temblor de puntos, fotogramas sin mano, mano marcada del lado contrario, segunda mano que desaparece, visibilidad baja del cuerpo | σ 0.3–1 % del cuadro, 0–35 % sin mano |

### 3.3 Negativos sintéticos (lo que más falta)

Son indispensables para que el sistema **no dispare** cuando no hay seña:

- **Nada:** tramos de reposo de todas las tomas, más movimientos sin seña armados con la mano cerrada: acomodarse, llevar la mano a la cara, señalar la pantalla.
- **Otra:** trozos de trámites al revés, mezclas de mitades de señas distintas y la seña de "no" con el índice (para los números).
- **Transiciones:** el paso de bajar la mano de una seña y subirla para otra.

### 3.4 Volumen y separación

- 120 tomas reales de manos × 50 personas ≈ **6 000 secuencias**, más unos 1 000 negativos.
- **Regla de oro:** las tomas reales se dividen en 5 grupos *antes* de simular. Las variantes de una toma nunca quedan en entrenamiento y evaluación a la vez. **La evaluación final siempre se hace con tomas reales que el modelo no vio.**

## 4. Qué se construye con esos datos

### 4.1 Trámites (lo nuevo) → `src/vision/intents.ts`

- **Por fotograma:** posición de cada muñeca relativa a los hombros, forma de las 2 manos (`shapeVector`), distancia entre manos y velocidad.
- **Clasificador:** DTW contra prototipos en TypeScript puro, sin dependencias, igual que `knn.ts`.
  - Los prototipos son **promedios** de muchas variantes sintéticas (unos 10 por clase), no tomas reales. Así el archivo pesa poco y no contiene ninguna toma de la persona.
  - Archivo: `public/vision/intents.templates.json`.
- **Rechazo:** si la mejor distancia supera un umbral (calibrado con *nada* y *otra*), responde "no entendí". Así el panel muestra *Validación requerida* o *Repetir seña*.
- **Decide a los ~3 s** de empezar la seña, o al bajar la mano, lo que llegue primero (por el tope de 6 s de la captura).
- **Plan B**, si DTW no llega al 90 %: una red pequeña (1D-CNN) en PyTorch → ONNX → `onnxruntime-web`. Agrega ~10 MB solo en la tablet. Solo si hace falta.

### 4.2 Números (mejora)

- `npm run dataset` genera `numbers.templates.json` con las variantes sintéticas. El código ya las usa: k vecinos + reglas.
- Clase de **rechazo** "otra": evita que el "no" con el índice o un trámite se lean como número.
- Ajuste del pulgar para 5 → 4 con los "5" sintéticos de pulgar poco visible.

### 4.3 Sí / no

- **Con la mano** (sí-puño, no-índice): mismos prototipos DTW que los trámites, para confirmar "¿Eligió el 7?".
- **Con la cabeza:** solo se escucha cuando **no hay mano levantada**. Así se eliminan los falsos "sí".

### 4.4 Conexión con el flujo de la demo

- `Recognize` gana `{ task: "tramite" }`. `buildTabletState` lo activa en el paso *¿Cuál es su solicitud?*.
- `session.ts`: `detectBySign` reemplaza a `simulateDetection` cuando llega una seña real. El funcionario sigue confirmando, corrigiendo o pidiendo repetir, como hoy.
- Los botones *Simular…* quedan detrás de un interruptor, para demos sin cámara. La franja *MODO DEMO* cambia a "reconocimiento en prueba".

## 5. Evaluación (antes de la demo)

`npm run evaluar -- ~/inlsc-datos` reproduce las tomas reales separadas por grupo y muestra la matriz de confusión.

| Criterio | Meta |
|---|---|
| Trámites con tomas reales no vistas | ≥ 90 % |
| Números 1–9 | ≥ 92 %; el 5 ≥ 80 % |
| Falsos disparos en *nada* y en señas de otra tarea | 0 en las tomas reales; < 5 % en las sintéticas |
| Latencia | Resultado < 1 s después de terminar la seña, o a los 3 s de empezar |

**Prueba en vivo:** una sesión de 20 minutos con S-9BST en la tablet real, con la pestaña *Probar* de `/?captura`, que se amplía para que también pruebe trámites. Las pruebas quedan en un paquete nuevo y sirven como evaluación independiente.

## 6. La entrega (una sola PR)

| Paso | Archivos | Tiempo |
|---|---|---|
| 1. Generador de datos simulados | `scripts/simular.ts`, `src/capture/synth.ts` + pruebas | 1.5 días |
| 2. Evaluador y matriz de confusión | `scripts/evaluar.ts`, `src/capture/eval.ts` | 0.5 días |
| 3. Reconocedor de trámites y sí/no con la mano + rechazo | `src/vision/intents.ts`, `dtw.ts`; `dataset.ts` genera `intents.templates.json` | 2 días |
| 4. Números: plantillas, pulgar y rechazo; cabeza solo sin manos | `numbers.ts`, `head.ts` | 1 día |
| 5. Conexión con el flujo | `types.ts`, `session.ts`, `StepControls.tsx`, `SignPanel.tsx`, `TabletApp.tsx` | 1 día |
| 6. Ajuste de umbrales con el evaluador + documentación | `README.md`, este plan | 0.5 días |

**Total: ~6–7 días** de trabajo, más la sesión de prueba en vivo.

**Tu parte (unos minutos):**
1. Crear la carpeta privada y copiar ahí el paquete bueno:
   ```bash
   mkdir -p ~/inlsc-datos && cp ~/Downloads/inlsc_captura_S-9BST_2026-10-09-2.json ~/inlsc-datos/
   ```
2. Revisar la PR y fusionarla.
3. Coordinar con S-9BST la sesión de prueba en vivo.

## 7. Riesgos

| Riesgo | Qué hacer |
|---|---|
| En la demo seña otra persona y no la reconoce | Que en la demo señe S-9BST, o hacer 15 minutos de captura con la persona nueva (el generador la multiplica igual) |
| Trámites incompletos por el tope de 6 s | Decidir a los 3 s. Subir `MAX_MS` a 10 s para capturas futuras |
| Solo 6 tomas de *cancelar* | El generador equilibra las clases. Si la evaluación falla en *cancelar*, pedir 5 tomas más |
| Los prototipos derivan de una persona y el repo es público | Son promedios de ángulos y posiciones, sin cara ni video. Igual conviene confirmarlo con el dueño (ver §8) |
| Alguien cree que la IA ya "entiende LSC" | Decirlo en la demo: reconoce 3 trámites + números + sí/no de un vocabulario cerrado, entrenado con 1 señante. El funcionario siempre confirma |

## 8. Para decidir antes de empezar

1. **¿Quién seña en la demo?** Si es S-9BST, el plan alcanza tal cual. Si es otra persona, hace falta una captura corta con ella.
2. **¿Se incluye sí/no con la mano** como confirmación en el flujo, o solo trámites + números?
3. **¿Se pueden publicar los prototipos** (promedios, sin datos crudos) en el repo público, que es de donde sirve GitHub Pages?

## 9. Resultado de la ejecución (9-oct-2026, rama `datos-sinteticos`)

**Qué quedó hecho:**

| Pieza | Archivos |
|---|---|
| Generador de datos simulados (personas, cámara, tiempo, ruido, negativos) | `app/src/capture/synth.ts`, `app/scripts/simular.ts` |
| Reconocedor de trámites y sí/no con la mano (DTW + k vecinos + rechazo) | `app/src/vision/signs.ts`, `motion.ts`, `dtw.ts` |
| Prototipos y umbrales desde reales + simulados | `app/src/capture/dataset.ts`, `app/scripts/dataset.ts` → `public/vision/signs.templates.json` y `numbers.templates.json` |
| Evaluador con tomas reales no vistas | `app/src/capture/evaluate.ts`, `app/scripts/evaluar.ts` |
| Números: pulgar del 5, plantillas y rechazo (dos manos, índice que va y viene) | `app/src/vision/features.ts`, `numbers.ts` |
| Flujo de la demo: la tablet reconoce el trámite y el panel lo muestra para confirmar | `types.ts`, `session.ts`, `StepControls.tsx`, `AdminApp.tsx`, `tablet/IntentPanel.tsx`, `TabletApp.tsx`, `TabletScreen.tsx` |
| Página de prueba `/?captura`: también prueba trámites. Tope de grabación: 6 s → 10 s | `capture/TestPanel.tsx`, `capture/Recorder.tsx` |
| Pruebas | `app/test/signs.test.ts` (22 pruebas en total, todas pasan) |

**Resultados** (`npm run evaluar -- ~/inlsc-datos`: 5 grupos, 30 personas simuladas por grupo, prueba con tomas reales no vistas):

| Criterio (§5) | Meta | Resultado |
|---|---|---|
| Trámites con tomas reales no vistas | ≥ 90 % | ✅ **96 %** (23/24; falló 1 *facturar*: no emitió) |
| Números 1–9 | ≥ 92 %; el 5 ≥ 80 % | ✅ **97 %** (84/87); el 5: 8/8 |
| Falsos disparos de trámites con otras señas o sin seña | 0 reales; < 5 % simuladas | ⚠️ 1/128 reales (*otra* → cancelar); ✅ 2 % simuladas |
| Latencia de trámites | < 1 s tras terminar o a los 3 s | ✅ mediana 2.1 s desde que se levanta la mano; la más lenta, 4.8 s |
| Variantes simuladas de las tomas de prueba | — | Trámites 78 %, números 91 %: el sistema aguanta otra cámara y otras proporciones, con menos margen |

**En qué se apartó del plan, y por qué:**
- **Prototipos:** no son promedios, son *medoides* (las ventanas más representativas de cada clase), casi todos de variantes simuladas. Los promedios desdibujaban el movimiento. Siguen sin código de señante, sin cara y sin video: solo posición de las muñecas respecto a los hombros, extensión de los dedos y orientación de la mano, a 10 por segundo. **Antes de publicar en el repo público, confirmarlo con el dueño (§8.3).**
- **Cabeza solo con las manos abajo: no se aplicó.** S-9BST acompaña el sí y el no con la mano, así que la regla dejaba 2/20 aciertos. Se mantiene el detector original: no se usa en el flujo de la demo, solo en `/?captura`.
- **Sí / no con la mano:** el reconocedor existe y acierta 16/17. Pero dispara con muchos números (38 %) y el flujo no tiene un paso de confirmación, así que **no se conectó al flujo**.
- **NO con el índice en el paso de números:** el índice quieto evita parte de los casos, pero todavía puede leerse como 1 o 7. El funcionario confirma siempre.
- **Plan B (red neuronal + onnxruntime-web): no hizo falta.**

**Para la demo:**
- *Detección del trámite → Con la cámara* viene encendida.
- Si la seña no se reconoce, el funcionario elige el trámite con un toque, y *Simular sin cámara* sigue disponible.
- Si en la demo seña otra persona, grabar antes 15 minutos con ella en `/?captura` y correr `npm run dataset`.
