# Cómo mejorar el reconocimiento: números 6–9, señas con movimiento y datos sintéticos

Investigación del 10-oct-2026. Complementa `investigacion_reconocimiento_LSC.md` y `plan_datos_sinteticos.md`. Lo que ya está en esos documentos no se repite aquí: los datasets LSC-54, LSC50 y LSC70, el plan B con 1D-CNN en ONNX, y el aumento clásico (que ya hace `synth.ts`).

## Situación actual

- Todo está entrenado con **un solo señante**.
- **6–9 no tiene ninguna toma real.** Se reconoce solo con reglas: `flexCycles` cuenta cuántas veces la extensión de los dedos cruza dos umbrales fijos (0.68 y 0.42).
- Para medir cada seña en la tablet real: `/?lab` → **Probar una seña**.

## 1. Números 6–9

| Opción | Esfuerzo | Comentario |
|---|---|---|
| **Mejores features de flexión.** Ángulos de las articulaciones PIP y MCP de los dedos de la base, normalizados por la amplitud de cada toma. Conteo de picos con prominencia en vez de umbrales fijos. Energía en la banda de 1,5–4 Hz (autocorrelación sobre 1–2 s). | Bajo | TS puro. Aguanta mejor una flexión a medias y un fps bajo. |
| **Decisor binario "quieta vs. flexión" para cada base,** con DTW + k vecinos (reutiliza `dtw.ts` y `knn.ts`). | Bajo-medio | Requiere tomas de 6–9, reales o sintéticas. |
| **1D-CNN pequeña sobre puntos de la mano,** tipo [1er lugar de Kaggle ASL Signs](https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution) (licencia MIT), exportada a ONNX. | Medio | Solo vale la pena con al menos 5 señantes reales. |
| MediaPipe Gesture Recognizer / Model Maker | — | Clasifica imágenes sueltas, no movimiento. **No sirve para 6–9.** |

**Datos reales:**
- **LSC-54** (22 señantes, números 1–10, licencia no comercial): sirve para **evaluar**.
- **LSC70** (CC BY 4.0, 6 fotogramas por seña): sirve para la forma; con tan pocos fotogramas no se ve bien la oscilación.

## 2. Señas con movimiento con pocos datos

- **Aumentos que le faltan a `synth.ts`:** tapar tramos de tiempo y dedos completos (cutout), y una deformación afín por dedo. Son estándar en las soluciones ganadoras de Kaggle. Esfuerzo bajo.
- **Transfer learning:** preentrenar con Kaggle ASL Signs (usa los mismos puntos de MediaPipe que la app) y afinar con LSC. Los embeddings de pose se transfieren entre lenguas de señas ([arXiv 2306.17558](https://arxiv.org/abs/2306.17558v1)). Esfuerzo alto. Solo compensa cuando haya varios señantes para evaluar.
- **Few-shot con métricas** ([arXiv 2204.02803](https://ar5iv.labs.arxiv.org/html/2204.02803)): con 3–5 clases, el DTW + k vecinos actual ya cumple ese papel.

## 3. Datos sintéticos con video generado y otros trucos

| Método | Veredicto |
|---|---|
| **Video generado (Sora, Veo, Runway, Kling)** | **No recomendado.** Generan dedos fusionados o de más y parpadeo ([SignLLM](https://arxiv.org/pdf/2405.10718), [arXiv 2506.15980](https://arxiv.org/pdf/2506.15980)). Además no conocen la LSC: inventarían señas y las etiquetas quedarían mal sin que se note. |
| **Avatares SiGML/JASigning (HamNoSys)** | Poco valor. Movimiento robótico, hay que transcribir cada seña a mano y no hay evidencia de que mejoren el reconocimiento. |
| **Blender o Unity + modelo de mano MANO/SMPL-X, renderizado y pasado por MediaPipe** | Funciona para dactilología ([CNLSE](https://cnlse.es/es/recursos/biblioteca/sign-language-fingerspelling-recognition-using-synthetic-data)). Esfuerzo alto: queda como experimento para después. |
| **Síntesis directa de puntos** ([HandCraft, arXiv 2508.14345](https://arxiv.org/abs/2508.14345)) | **La mejor relación costo/beneficio.** Es lo que ya hace `synth.ts`. Lo nuevo sería generar tomas de 6–9 a partir de las tomas reales de 1–4, agregándoles ciclos de flexión (1–4 ciclos, con distinta frecuencia y amplitud). |

## 4. Otros recursos de LSC

- **LeSiCo** (Universidad Nacional): 1 980 señas de 1 señante. Hay que pedir acceso.
- **Diccionario INSOR:** se necesita permiso escrito para usarlo.
- **No existe ningún dataset público de trámites:** esos datos solo pueden salir de `/?captura`.

## Prioridades

1. **Línea base honesta de 6–9:** convertir LSC-54 al formato de captura y ejecutar `npm run evaluar`.
2. **Rehacer `flexCycles`** con ángulos articulares, picos con prominencia y energía en la banda de frecuencia.
3. **Sintetizar 6–9 desde las tomas de 1–4** en `synth.ts`, y agregar los aumentos de tapar tiempo y dedos.
4. **Grabar al menos 5 señantes sordos con `/?captura`,** sobre todo 6–9 y trámites. Ningún dato sintético reemplaza esto.
5. **Con al menos 5 señantes:** probar una 1D-CNN pequeña exportada a ONNX. Descartar el video generado y los avatares para entrenar.
