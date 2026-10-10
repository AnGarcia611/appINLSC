# Manos sintéticas por edad, tamaño y velocidad

Investigación del 10-oct-2026. Pregunta: si ya conocemos las reglas de cada seña, ¿podemos simular manos de personas distintas (tamaño, edad, velocidad) y generar con eso los datos sintéticos que faltan? Complementa `investigacion_mejoras_senas.md` y `plan_datos_sinteticos.md`.

## Veredicto

- **Sí, pero generando los 21 puntos directamente** con un esqueleto cinemático en TypeScript, sobre `app/src/capture/synth.ts`, en vez de renderizar manos 3D y pasarlas por MediaPipe.
  - Es rápido: miles de tomas en segundos en Node.
  - Las etiquetas son exactas.
  - No tiene problemas de licencia.
  - Lo que le falta es el ruido del detector, y ese se mide en las tomas reales y se imita.
- **Render 3D + MediaPipe** queda solo como banco de pruebas pequeño, para ver cómo falla el detector con los dedos doblados.
- **Nada de esto reemplaza grabar señantes reales.** El generador usa las mismas reglas que el reconocedor, así que acertar con datos sintéticos no prueba nada (es circular). La medida que vale es la de personas reales.
- **Ya hay una pieza hecha:** `curlFingers` y `flexTake` (en `synth.ts`) doblan las articulaciones de una mano real para fabricar 6–9 a partir de 1–4.

## 1. Tamaño y forma de la mano

Antropometría colombiana (ACOPLA95, trabajadores de 20 a 59 años, n = 2100; desviación estimada desde P5–P95). [Fuente](https://dialnet.unirioja.es/descarga/articulo/5079552.pdf).

| Medida (mm) | Hombres | Mujeres |
|---|---|---|
| Largo de mano | 183 ± 10 | 166 ± 8 |
| Largo de palma | 103 ± 6 | 92 ± 5 |
| Ancho de mano | 84 ± 4 | 75 ± 4 |

Largo de cada hueso en mm, en radiografías de 66 adultos de 19 a 78 años ([Buryanov & Kotiuk 2010](https://www.scielo.cl/pdf/ijmorphol/v28n3/art15.pdf)):

| Dedo | Metacarpo | Falange proximal | Falange media | Falange distal + pulpejo |
|---|---|---|---|---|
| Pulgar | 46.2 ± 3.9 | 31.6 ± 3.1 | — | 21.7 ± 1.6 + 5.7 |
| Índice | 68.1 ± 6.3 | 39.8 ± 4.9 | 22.4 ± 2.5 | 15.8 ± 2.3 + 3.8 |
| Medio | 64.6 ± 5.4 | 44.6 ± 3.8 | 26.3 ± 3.0 | 17.4 ± 1.9 + 4.0 |
| Anular | 58.0 ± 5.1 | 41.4 ± 3.9 | 25.7 ± 3.3 | 17.3 ± 2.2 + 4.0 |
| Meñique | 53.7 ± 4.4 | 32.7 ± 2.8 | 18.1 ± 2.5 | 16.0 ± 2.5 + 3.7 |

**Cómo usar estas cifras:**
- **El tamaño casi no importa para el reconocedor.** `features.ts` divide todo por el tamaño de la palma; el tamaño solo cambia cuánto ocupa la mano en el cuadro.
- **Lo que importa son las proporciones entre huesos.** Variación del 5–8 % por hueso, sobre un factor de tamaño común a toda la mano. `synth.ts` ya usa ±5 % por hueso, sobre ±10 % para palma y dedos.
- **Las proporciones no cambian después de los 18 años.** En las personas mayores cambia el movimiento, no el largo de los huesos.

## 2. Movimiento por edad

| Parámetro | Jóvenes | Mayores | Fuente |
|---|---|---|---|
| Golpeteo máximo de un dedo | 4.4–5.3 Hz | ≈ 4.0–4.4 Hz (41–64 años) | [Fromm-Auch & Yeudall 1983](https://doi.org/10.1080/01688638308401171) |
| Flexión a ritmo propio | ≈ 2 Hz (rango 0.7–3.3 Hz) | — | [Häger-Ross & Schieber 2000](https://pmc.ncbi.nlm.nih.gov/articles/PMC6773164/) |
| Cuánto se mueve el dedo medio al doblar el índice | 26 ± 12 % | 47 ± 25 % (68–84 años) | [van Beek 2019](https://research.tudelft.nl/en/publications/single-finger-movements-in-the-aging-hand-changes-in-finger-indep) |
| Flexión activa máxima | Nudillo (MCP) 87 ± 10°, articulación media (PIP) 97 ± 17°, punta (DIP) 82–85° | Artrosis de mano: unos 25° menos | [Indian J Plast Surg 2024](https://www.thieme-connect.com/products/ejournals/html/10.1055/s-0044-1788593) |
| Artrosis de mano con síntomas | — | 26 % de las mujeres y 13 % de los hombres de 70 años o más | [Framingham](https://ghdx.healthdata.org/record/prevalence-symptomatic-hand-osteoarthritis-and-its-impact-functional-status-among-elderly) |
| Temblor | Fisiológico, despreciable | Esencial (4–12 Hz) en el 5.8 % de los mayores de 65 | [Louis 2021](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8269764/) |

**Cómo pasa a parámetros del generador:**
- **Velocidad de flexión de 6–9:** entre 0.3 y 0.7 veces el golpeteo máximo, es decir 1.3–3.6 Hz. Es el rango que ya usa `makeFlexStyle`. En personas mayores, multiplicar por 0.85 y doblar menos.
- **Arrastre de los dedos vecinos:** 0.1–0.4 en jóvenes y 0.2–0.7 en mayores.
- **Articulación de la punta:** dobla unas 2/3 partes de lo que dobla la articulación media.
- **Temblor de 4–12 Hz:** en una parte de las personas mayores simuladas.

## 3. Modelos 3D

| Opción | Licencia | Uso |
|---|---|---|
| MANO, SMPL-X, DART | Solo investigación no comercial ([MANO](https://mano.is.tue.mpg.de/license.html)) | Evitar |
| NIMBLE | Los archivos del modelo no declaran licencia | Evitar |
| Mano `generic-hand` de [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (glTF) con three.js | Permisiva | Visor en `/?lab` y banco de pruebas |
| MakeHuman / MPFB | CC0 | Alternativa en Blender |

**Qué dice la literatura:**
- MediaPipe Hands se entrenó con mezcla de imágenes reales y sintéticas. Solo con sintéticas el error fue mayor: 25.7 % contra 13.4 % mezclando ([arXiv 2006.10214](https://arxiv.org/abs/2006.10214)).
- Un reconocedor de deletreo entrenado con datos sintéticos llegó al 71 % con señantes reales ([Fowley & Ventresque](https://cnlse.es/es/recursos/biblioteca/sign-language-fingerspelling-recognition-using-synthetic-data)).
- Generar secuencias de puntos y preentrenar con ellas mejora el resultado ([HandCraft 2025](https://arxiv.org/abs/2508.14345)).

## 4. Plan propuesto

| Paso | Qué | Esfuerzo |
|---|---|---|
| 1 | Personas por edad y sexo en `synth.ts`, con proporciones, rango articular, velocidad, arrastre de dedos y temblor (tablas 1 y 2). Mezcla: 18–39 años 45 %, 40–64 años 40 %, 65 o más 15 % | 1 día |
| 2 | Imitar el ruido del detector medido en los tramos quietos de las tomas reales: ruido por punto y eje, más ruido en la profundidad, fotogramas sin mano, mano marcada del lado contrario | 1–2 días |
| 3 | Esqueleto cinemático: de la regla de cada seña (`BASES` en `numbers.ts`) a ángulos articulares y de ahí a los 21 puntos, respetando el rango articular de cada persona | 3–4 días |
| 4 | Visor three.js en `/?lab` con la mano `generic-hand`, para que un señante sordo revise unas 50 animaciones | 1–2 días |
| 5 | Validación en `evaluate.ts` (ver abajo) | 2 días |
| 6 (opcional) | Banco render + MediaPipe para medir cómo se equivoca el detector con los dedos doblados | 4–6 días |

**Cómo saber si el generador sirve:**
- **Comparar distribuciones** de real y sintético en cada característica (extensión de cada dedo, ángulos, frecuencia de flexión).
- **Clasificador real/sintético:** si los distingue fácilmente (AUC mayor que 0.7), al sintético le falta realismo.
- **Entrenar solo con sintético y probar con personas reales:** las tomas propias y LSC-54 (`npm run evaluar`).
- **Quitar un factor a la vez** (edad, rango articular, ruido) para ver cuál aporta.
