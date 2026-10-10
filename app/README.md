# InLSC: MVP

Prototipo funcional de dos pantallas sincronizadas:

- **Panel del funcionario (PC):** `/`. Portal de la IPS simulado, con la "ventanita" InLSC que se abre como panel lateral.
- **Tablet del señante:** `/?tablet&s=<código>`. Videos LSC reales, infografías táctiles, cámara (solo al detectar la seña) y barra de progreso. Se adapta a tablet horizontal o vertical y a celular.

## Sesiones y sincronización

Cada panel del funcionario abre una **sesión** con un código de 6 caracteres (p. ej. `JP25GT`), visible con un **código QR** en el aviso *Tablet desconectada* del panel (con la tablet ya conectada, el código aparece junto a *Nueva sesión* antes de iniciar la atención). La tablet se une escaneando el QR o abriendo la app con `?tablet` y escribiendo el código. Varias parejas PC–tablet pueden funcionar a la vez sin interferir.

- El código se conserva al recargar el panel, y la tablet recuerda el último código: si algo se desconecta, ambos se reconectan solos.
- *↻ Nueva sesión* genera otro código y desconecta las tablets actuales. En la tablet, *Cambiar código* aparece mientras no hay conexión.
- **Una sola tablet por PC.** Si otra tablet intenta unirse a una sesión ocupada, ve *"Esta sesión ya tiene una tablet conectada"*. La misma tablet (misma pestaña) sí puede recargar y reconectarse.
- **Estado explícito.** PC y tablet se envían un latido cada 2 s y cada uno responde al del otro (así no se corta si la pestaña del panel queda en segundo plano). Sin noticias en 7 s se muestra *Conexión inestable* sin bloquear nada; en 20 s el otro extremo se da por perdido: el PC muestra *Sin tablet* y la tablet un aviso a pantalla completa. Al reconectarse o volver a primer plano, la tablet pide la pantalla actual y sigue donde iba.
- **Sin tablet no se avanza.** No se puede iniciar una atención ni avanzar pasos. Si la tablet se pierde a mitad de una atención, esta queda **en pausa** y continúa en el mismo paso al reconectarse (*Cancelar atención* sigue disponible).

Hay dos modos de transporte (`src/shared/sync.ts`):

| Modo | Cuándo | Cómo | Internet |
|---|---|---|---|
| `local` | `npm run dev` / `npm start` en el PC | SSE contra el servidor de Vite (salas por código) | No necesita |
| `relay` | GitHub Pages (build con `VITE_SYNC=relay`) | Mensajes cifrados por 3 servidores MQTT públicos a la vez (`src/shared/relay.ts`) | Sí |

Se puede forzar el modo con `?sync=local` o `?sync=relay` en la URL (en ambas pantallas; el QR lo incluye). `?sync=peer` se acepta como sinónimo de `relay`.

> En modo `relay` el PC y la tablet se conectan a **todos** los servidores de la lista (`RELAY_BROKERS`) y publican en todos: basta con que uno funcione. El tema es un hash del código de sesión y el contenido va cifrado (AES-GCM con clave derivada del código). Funciona entre redes distintas (WiFi del PC, datos móviles en la tablet) porque no depende de WebRTC.
>
> Antes se usaba WebRTC con el servidor público de PeerJS, pero ese servidor limita las conexiones (HTTP 429) y la tablet no podía conectarse. `npm run test:sync` comprueba de extremo a extremo que el relé funciona (también simulando un servidor caído) y se ejecuta en el workflow antes de cada despliegue.

## Despliegue en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica la app en cada push a `main`.

1. Cree un repositorio en GitHub (p. ej. `appINLSC`) y suba este proyecto (la raíz es la carpeta que contiene `app/`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Haga push a `main` (o ejecute el workflow a mano en la pestaña *Actions*).
4. La app queda en `https://inlscasiste.store/` y la tablet en `https://inlscasiste.store/?tablet` (dominio propio configurado en *Settings → Pages → Custom domain*; DNS en Cloudflare apuntando a GitHub Pages).

Los videos se publican desde `app/public/videos` (se versionan en git; los originales de `Videos_señantes/` están excluidos en `.gitignore`). Si cambia algún video, ejecute `npm run videos` y haga commit de `app/public/videos`.

Para probar en el PC exactamente lo que se publicará:

```bash
INLSC_HTTP=1 PORT=5175 VITE_SYNC=relay npm start   # abrir http://localhost:5175/
```

> ⚠️ Con GitHub gratuito, Pages exige que el repositorio sea **público**: los videos de los intérpretes y el nombre de la IPS (`src/shared/config.ts`) quedarán visibles en internet. Confirme que tiene el consentimiento de los intérpretes y autorización de la IPS antes de publicar.

> ⚠️ **El reconocimiento de señas está en prueba.** La tablet reconoce la seña del trámite con la cámara, pero está entrenada con una sola señante: el funcionario siempre confirma, y el señante también puede **tocar** su opción. En las infografías, por defecto el señante elige solo tocando (Ajustes1); la **seña del número** es real (beta), pero hay que activarla en el panel (ver *Reconocimiento de señas LSC* más abajo). El panel muestra siempre la etiqueta "Reconocimiento de señas en prueba".

## Requisitos

- Node 22.18 o superior (los scripts ejecutan `.ts` directamente; en Mac: `brew install node`; en Windows: instalador de nodejs.org)
- PC y tablet en la **misma red WiFi**, sin aislamiento de clientes

## Puesta en marcha

```bash
cd app
npm install
npm run videos   # copia ../Videos_señantes → public/videos con nombres normalizados
npm run dev      # servidor HTTPS en el puerto 5173, accesible en la red local
```

1. En el PC abra `https://localhost:5173`.
2. En la tablet escanee el QR del aviso *Tablet desconectada* o abra la dirección que aparece allí (p. ej. `https://192.168.1.20:5173/?tablet&s=JP25GT`).
3. El certificado es autofirmado:
   - En **iPad (Safari):** *Mostrar detalles → visitar este sitio web*.
   - En **Android (Chrome):** *Configuración avanzada → Continuar*.
4. Toque la pantalla de la tablet para activarla. Se pide permiso de cámara y se pasa a pantalla completa.

Para probar sin la tablet, abra la dirección de la tablet (con `&s=<código>`) en otra pestaña del mismo PC.

## Guion sugerido para la demo (≈ 4 min)

| # | Funcionario (PC) | Señante (tablet) |
|---|---|---|
| 1 | Elija el intérprete (*Mujer / Hombre*) y pulse *Iniciar atención* en la ventanita | Video de saludo |
| 2 | *Continuar* | Video "¿Cuál es su solicitud?" |
| 3 | *Activar cámara* | Cámara activa + los 3 trámites (tocables) |
| 4 | Espera el resultado (2–4 s) → *Confirmar* | Hace la seña de "pedir una cita" (o toca *Asignación de cita*); se marca ✓ |
| 5 | *Documento recibido* | Video "entregue su documento" |
| 6 | Especialidad: *Ejemplo* → *Enviar a la tablet* | Infografía de especialidades → **toca una opción** |
| 7 | *Confirmar opción* → *Orden verificada* | Video "orden médica" |
| 8 | Elija una fecha y toque las horas (o *Usar horarios de ejemplo*) → *Enviar* → *Confirmar opción* | Infografía de horarios → **toca un horario** |
| 9 | *Finalizar atención* | "¡Cita asignada!" + "Que tenga un buen día" |

**Variantes para mostrar:**
- **Por toque:** en el paso 4 el señante toca su trámite debajo de la cámara, en lugar de hacer la seña (o para corregirla).
- **Si la seña no se reconoce:** el funcionario elige el trámite con los botones del panel, o pide repetir con *Volver a captar seña*. Con confianza < 70 % el panel pide validar.
- **Sin disponibilidad:** en el paso 8 use *Sin disponibilidad*: la tablet reproduce el video de negación con el aviso «No hay disponibilidad. Intente otro día.» y el panel ofrece *Finalizar atención*.
- **Celular:** abra la dirección de la tablet en un celular, en vertical u horizontal.
- **Otros trámites:** cancelación (lista de citas simuladas) y facturación (campo de valor en $).

## Qué es real y qué es simulado

| Real | Simulado / pendiente |
|---|---|
| Sincronización PC ↔ tablet por sesiones (SSE local o relé MQTT) | Reconocimiento de señas: **en prueba**, entrenado con 1 señante (S-9BST) y datos simulados a partir de sus tomas |
| Videos LSC reales y elección hombre/mujer según el perfil (se elige en el panel antes de iniciar) | Citas del paciente (`MOCK_CITAS`) |
| Selección táctil en la tablet (también del trámite) | Integración con el sistema de agendamiento de la IPS |
| Cámara de la tablet con reconocimiento del trámite (solo en ese paso) | Registro de información por una semana |
| Catálogo real de especialidades y servicios | Videos faltantes: despedida INT09, hombre en facturación, valor con intérprete |

## Estructura

```
src/
  shared/   tipos, flujos (flows.ts), catálogo, videos, sincronización
  admin/    panel del funcionario: sesión (session.ts), controles por paso, selectores
  tablet/   pantalla del señante (también se usa como vista previa en el panel)
vite.config.ts   servidor local: HTTPS + bus de sincronización /api/* (salas por sesión)
../.github/workflows/deploy.yml   publicación en GitHub Pages
scripts/prepare-videos.mjs   copia y normaliza los videos
```

Los trámites se definen como datos en `src/shared/flows.ts`, y el nombre de la IPS en `src/shared/config.ts`.

## Reconocimiento de señas LSC (beta)

Ver `../plan_reconocimiento_LSC.md`. Todo corre en el navegador de la tablet con MediaPipe 0.10.35, sin internet. El video nunca sale de la tablet.

- **Detección del trámite (asignar, cancelar, facturar):** siempre activa en ese paso. La tablet compara la seña con prototipos (`src/vision/signs.ts`, DTW + k vecinos) y envía el trámite con su confianza; el funcionario confirma. Clases de rechazo "nada" y "otra": si la seña no se parece a ninguna, no se emite nada: el señante toca su opción o el funcionario elige el trámite.
- **Seña del número en las infografías:** en el panel, preferencia *Selección en las infografías → Toque o seña del número* (apagada por defecto). La tablet reconoce 1–9 y el funcionario confirma; con confianza < 70 % solo se sugiere.
- **`/?captura`:** página para que señantes graben y validen señas (consentimiento, perfil anónimo, grabación guiada, prueba del reconocedor). El paquete (solo puntos, sin video) se envía por correo a `CAPTURE_EMAIL` (`src/shared/config.ts`): automático con el servicio `../captura-mail` (Cloudflare Worker, `VITE_CAPTURE_URL`), o por el menú Compartir si no está disponible. El consentimiento es un **borrador** (`src/capture/consent.ts`) pendiente de revisión legal.
- **`/?lab`:** diagnóstico en la tablet real: fps, GPU/CPU, extensión de los dedos y resultados en vivo. `?lab&src=videos/seleccion_m.mp4` analiza un video publicado.

```bash
npm run vision                      # copia el wasm de MediaPipe a public/vision (también corre solo antes de dev/build/start)
npm test                            # pruebas del motor con manos sintéticas
npm run dataset -- ~/inlsc-datos    # informe + plantillas: public/vision/numbers.templates.json y signs.templates.json
npm run evaluar -- ~/inlsc-datos    # mide con tomas reales no vistas (≈ 1 min): aciertos, falsos disparos, matrices de confusión
npm run simular -- ~/inlsc-datos ~/inlsc-datos/sinteticos   # opcional: escribe los paquetes simulados para revisarlos
npm run evaluar -- ~/inlsc-datos ~/inlsc-publicos/lsc54 --publicos-solo-medir   # mide también con las 18 personas de LSC-54
```

**Datos públicos (LSC-54).** `scripts/importar_lsc54.py` convierte los videos de números de LSC-54 (18 señantes, Universidad de La Sabana, [CC BY-NC 4.0](https://doi.org/10.57760/sciencedb.25639)) al formato de captura, con los mismos modelos que la app y el encuadre de la tablet. Cada toma lleva su señante como grupo: `evaluar` prueba siempre con personas que el modelo no vio. Con `dataset`, una carpeta pública también entrena y queda citada en las plantillas (`sources`); hoy **no** se usa para entrenar porque no mejoró los números y empeoró un poco los trámites (ver abajo).

```bash
python3 -m venv ~/inlsc-publicos/.venv && ~/inlsc-publicos/.venv/bin/pip install mediapipe opencv-python-headless
# Videos Numbers.zip (190 MB) de https://doi.org/10.57760/sciencedb.25639, descomprimido en ~/inlsc-publicos/lsc54-videos
~/inlsc-publicos/.venv/bin/python scripts/importar_lsc54.py ~/inlsc-publicos/lsc54-videos ~/inlsc-publicos/lsc54
# Cualquier otro video (archivos de un canal, videos del proyecto): lista CSV con archivo, etiqueta, señante, tramo y fuente
~/inlsc-publicos/.venv/bin/python scripts/importar_videos.py lista.csv ~/inlsc-publicos/otra-fuente
```

> ⚠️ Guarde los paquetes recibidos **fuera de este repositorio** (es público). Los scripts se niegan a leer o escribir carpetas dentro del repo.

**Datos simulados** (`src/capture/synth.ts`, ver `../plan_datos_sinteticos.md`): con una sola captura real, cada toma se convierte en variantes de ~40 "personas" sintéticas (otros largos de dedos y pulgar, zurdos, alcance y ritmo propios) con otra cámara (distancia, posición, inclinación, giro), otra velocidad y fps, y ruido del detector (temblor, manos perdidas, lado invertido). También se generan negativos ("nada": llevarse la mano a la cara; "otra": señas al revés). Todo con semilla fija: `dataset` y `evaluar` simulan en memoria y siempre dan lo mismo. Las plantillas que se publican no tienen código de señante ni datos de la cara: formas de mano (ángulos) y trayectorias relativas a los hombros a 10 por segundo.

**Resultados con la captura S-9BST** (`npm run evaluar`, 5 grupos, tomas reales no vistas al entrenar):

| Reconocedor | Aciertos | Falsos disparos | Nota |
|---|---|---|---|
| Trámites | 23/24 (96 %) | 1/128 (1 %) | Resultado a los 2.1 s de levantar la mano (mediana). 5 de 23 con confianza < 70 %: el panel pide validar |
| Números 1–9 | 84/87 (97 %) | — | Antes 86/93 (≈ 91 %) sin plantillas y con el 5 leído como 4. El NO con el índice todavía puede leerse como 1 o 7: el funcionario confirma |
| Sí / no con la mano | 16/17 (94 %) | 38 % | No se usa en el flujo: se confunde con números. Queda para un paso de confirmación futuro |

Son resultados de **una sola persona**: no dicen cuánto acierta con otros señantes. Con otra persona en la demo, conviene grabar antes 15 min con `/?captura` y volver a correr `npm run dataset`.

**Con personas nuevas (LSC-54, 18 señantes que el modelo no vio):** en las 372 tomas donde la seña se ve al menos 0.3 s, los números 1–5 aciertan 80 % y 6–9 el 58 %. Cuando el reconocedor responde, la forma de la mano (1–5, o la base de 6–9) es la correcta el 98 % de las veces. El error está en separar el número quieto del que tiene movimiento (2 ↔ 7), y en las señas muy rápidas: en 113 tomas la mano se ve menos de 0.3 s y no se emite nada, a propósito, para no reaccionar a parpadeos del detector. Por eso el funcionario siempre confirma, y conviene pedir en pantalla que se sostenga la seña.

**6–9 fabricados y flexión a medias** (`flexTake` en `synth.ts`): cada persona simulada convierte la mitad de las tomas de 1–4 en 6–9, doblando y estirando las articulaciones de esos dedos 1–4 veces, a 1.4–3.6 Hz y con distinta profundidad. El detector de flexión (`flexCycles`) ya no usa umbrales fijos: cuenta bajadas y subidas desde el último pico y valle. Con flexiones a medias pasa de 8 % a 56 % de acierto; con 6–9 de personas nuevas, de 51 % a 58 %; las tomas propias quedan igual.
