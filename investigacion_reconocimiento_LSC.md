# Reconocimiento de LSC: librerías y datasets open source

> Investigación hecha el 26-sep-2026 para el motor "IA Visor" de InLSC (ver `context.md` §8.2).

## Conclusión corta

**No existe una librería open source madura para reconocer Lengua de Señas Colombiana.** Lo que hay son:

1. **Datasets académicos de LSC**, pequeños y con vocabulario general. Ninguno trae vocabulario de trámites de salud (*cita*, *cancelar*, *factura*).
2. **Repos universitarios o de portafolio**, sin mantenimiento ni modelos reutilizables.
3. **Herramientas genéricas** (independientes del idioma) para extraer puntos del cuerpo y las manos y entrenar un clasificador propio.

El camino realista es **MediaPipe para los puntos de referencia + un clasificador propio pequeño**, entrenado con nuestros videos y complementado con los datasets de LSC que sirvan (sobre todo para los **números**).

## 1. Datasets de LSC

| Dataset | Contenido | Tamaño | Licencia | Enlace |
|---|---|---|---|---|
| **LSC-54** (2025) | **Números 1–10**, 11 colores y 33 frases de cortesía (hola, buenos días, adiós, ayuda, de nada, perdón…) | 22 señantes, 3–5 repeticiones, 2 850 videos (128 k con aumento de datos) | **CC BY-NC** (solo uso no comercial) | [Artículo](https://pmc.ncbi.nlm.nih.gov/articles/PMC12557509/) · [Datos](https://www.scidb.cn/en/detail?dataSetId=0fa5acc6293543bba9a39a822988843e) · [Código de captura](https://github.com/juanesmz/SignCapture) |
| **LSC50** (2024, Uniandes) | 50 señas: saludos (buenos días/tardes/noches, hola, adiós), **gracias, por favor, con gusto, bienvenido, perdón, permiso**, preguntas (¿qué?, ¿cuándo?, ¿dónde?…), familia, emociones | 5 señantes (2 sordos), 4 000 videos RGB y RGB-D, más de 500 puntos de referencia, sensores de movimiento (IMU) | Dataset: **CC BY 4.0**. Código: **MIT** | [Artículo](https://www.nature.com/articles/s41597-024-04172-5) · [Figshare (~10 GB)](https://figshare.com/articles/dataset/LSC50_Colombian_Sign_Language_Video_and_Inertial_Measurement_Dataset/27383016) · [GitHub](https://github.com/BiomecanicaUniandes/LSC50) |
| **LSC70** (2025, Unicauca) | Alfabeto de 27 letras, **números 0–10, mil y millón**, algunas palabras (hola, bueno, días, tarde, noche, nombre, año…) | 70 señantes no expertos, 47 señas, 35 208 imágenes JPG (secuencias de 6 fotogramas) | Artículo CC BY 4.0. La licencia del dataset hay que verificarla en Mendeley | [Artículo](https://pmc.ncbi.nlm.nih.gov/articles/PMC11720433/) · [Mendeley Data](https://data.mendeley.com/datasets/9ssyn8tff5/2) |

**Qué sirve para InLSC:**
- **Números** (para elegir opciones en las infografías): LSC-54, LSC70.
- **Saludo, despedida y "con gusto"**: LSC50, LSC-54. Sirven para validar, aunque esos videos los produce el sistema; no hace falta reconocerlos.
- **Intenciones de trámite** (asignar, cancelar, facturar), **aceptación y negación en contexto**: **no existen en ningún dataset**. Hay que grabarlas nosotros.
- ⚠️ LSC-54 es **no comercial**. Si InLSC es un producto pagado por la IPS, hay que pedir permiso o usarlo solo para investigación y validación.

## 2. Repos de GitHub específicos de LSC

Todos son académicos o de portafolio, con 0 estrellas y poca actividad. Sirven como **referencia de arquitectura, no como dependencia**.

| Repo | Qué hace | Stack | Nota |
|---|---|---|---|
| [AndresAfar/mati](https://github.com/AndresAfar/mati) | Traductor de LSC para **ventanilla bancaria**: seña del cliente → intención, e instrucciones de vuelta en pantalla | Next.js + MediaPipe Tasks Vision (JS) + FastAPI + PyTorch | **El caso de uso más parecido al nuestro**. Sin licencia y con 2 commits |
| [DiegoGalloM/enlaza](https://github.com/DiegoGalloM/enlaza) | Microaprendizaje de LSC. Puntos de la mano en el navegador: comparación con plantillas (similitud coseno) para señas estáticas y DTW para dinámicas | React + Vite + MediaPipe HandLandmarker + Fastify/SQLite | **MIT**. Todo corre en el navegador. Buen patrón para aprender con pocos ejemplos |
| [samuelcastr/LexiSing](https://github.com/samuelcastr/LexiSing) | 33 palabras + alfabeto → frase en español con un LLM (Groq) | Angular + MediaPipe + Django | Depende de servicios en la nube |
| [Tonigraphic/Manos-Abiertas](https://github.com/Tonigraphic/Manos-Abiertas) | Reconocimiento 100 % en el navegador con MediaPipe Web (U. de Nariño) | Web | — |
| [JuanPlazas/deteccion_letras_senas](https://github.com/JuanPlazas/deteccion_letras_senas) | Alfabeto dactilológico de LSC en tiempo real | Python + MediaPipe | Solo letras |
| [calebYBV/sena-track](https://github.com/calebYBV/sena-track), [migzam10/uniCall](https://github.com/migzam10/uniCall) | Prototipos: alfabeto y palabras básicas / videollamada | — | Muy tempranos |

## 3. Herramientas genéricas (independientes del idioma)

| Herramienta | Para qué | Licencia | Estado |
|---|---|---|---|
| **[MediaPipe](https://ai.google.dev/edge/mediapipe) Holistic / Hand Landmarker / Pose** | Extraer en tiempo real los puntos de manos (21 por mano), cuerpo y cara. Corre **en el navegador de la tablet y sin conexión** (WASM/WebGL) | Apache 2.0 | Activo. Es el estándar de hecho en todos los proyectos anteriores |
| **MediaPipe Model Maker – Gesture Recognizer** | Afinar un clasificador de **gestos estáticos** de la mano con pocas imágenes | Apache 2.0 | Activo. Útil para los **números** (casi todos son configuraciones de mano) |
| **[OpenHands](https://github.com/AI4Bharat/OpenHands)** (AI4Bharat) | Librería de reconocimiento de señas aisladas basada en poses: modelos preentrenados (LSA64, AUTSL, WLASL, etc.) para afinar con un idioma nuevo | Apache 2.0 | ⚠️ **Sin mantenimiento**. Sirve como referencia o punto de partida |
| **[sign-language-processing](https://github.com/sign-language-processing)** (`pose`, `segmentation`, `recognition`, `datasets`) | Formato `.pose`, aumento de datos, segmentación de señas y cargadores de datasets | MIT (la mayoría) | Activo |
| **SPOTER / modelos Transformer sobre poses** | Clasificador liviano de señas aisladas a partir de puntos de referencia | Revisar en cada repo | Referencia académica |

## 4. Recomendación para InLSC

Nuestro problema es **acotado**, no es traducción abierta:
- intención del trámite: **3 clases** (+ "otra/no entendida");
- **números 1–9** para escoger opciones;
- **sí / no** (aceptación y negación).

**Arquitectura propuesta:**

1. **Tablet (navegador):** MediaPipe Holistic en JS extrae los puntos → se normalizan (centrados en el cuerpo y escalados por el ancho de hombros) → se envían por la red local a la PC, o se clasifican ahí mismo. **Sin internet**, como exige la especificación.
2. **Clasificadores:**
   - **Números:** clasificador de configuración de mano (MLP o Gesture Recognizer de Model Maker). Se entrena con nuestras tomas + LSC70/LSC-54.
   - **Intención y sí/no:** secuencias de puntos → GRU/LSTM o Transformer pequeño exportado a ONNX o TF.js. Para arrancar con pocos datos: **plantillas + DTW / k vecinos más cercanos** (como hace Enlaza), que funcionan con 5–10 ejemplos por clase.
3. **Umbral de confianza:** por debajo del umbral, el funcionario confirma o pide **"repetir seña"**, que ya está previsto en el flujo. Como el funcionario siempre valida, el sistema tolera errores del modelo.
4. **Datos:** hoy hay **1 toma por intención**. Hay que grabar lo que piden los propios LEEME (al menos 3 señantes × 2–3 tomas) y, en lo posible, **10 o más señantes × 5 o más tomas** por clase, en el mostrador real (misma cámara, luz y ángulo).

**Sobre "Detección señas (claude)"** en el PDF: los LLM multimodales (Claude, GPT, Gemini) **no reconocen LSC de forma confiable** y requieren internet, lo que choca con la regla de "red local sin internet". Un LLM puede servir para otras cosas (p. ej. redactar texto para el funcionario), no como reconocedor principal. Hay que aclararlo con el cliente.

## 5. Próximos pasos

- [ ] Descargar LSC70 (números) y LSC50, y revisar las licencias exactas (LSC70 en Mendeley).
- [ ] Hacer una prueba rápida: MediaPipe Holistic en el navegador + DTW/k vecinos con nuestros videos actuales para las 3 intenciones.
- [ ] Definir con el cliente el protocolo de grabación (señantes, tomas, cámara del mostrador).
- [ ] Preguntar por la licencia de LSC-54 si se va a usar en producción.
