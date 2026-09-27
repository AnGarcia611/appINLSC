# InLSC: MVP simulado

Prototipo funcional de dos pantallas sincronizadas:

- **Panel del funcionario (PC):** `/`. Portal de la IPS simulado, con la "ventanita" InLSC que se abre como panel lateral.
- **Tablet del señante:** `/?tablet&s=<código>`. Videos LSC reales, infografías táctiles, cámara y barra de progreso.

## Sesiones y sincronización

Cada panel del funcionario abre una **sesión** con un código de 6 caracteres (p. ej. `JP25GT`), visible en ⚙ → *Conectar la tablet* junto con un **código QR**. La tablet se une escaneando el QR o abriendo la app con `?tablet` y escribiendo el código. Varias parejas PC–tablet pueden funcionar a la vez sin interferir.

- El código se conserva al recargar el panel, y la tablet recuerda el último código: si algo se desconecta, ambos se reconectan solos.
- *↻ Nueva sesión* genera otro código y desconecta las tablets actuales. En la tablet, *Cambiar código* aparece mientras no hay conexión.

Hay dos modos de transporte (`src/shared/sync.ts`):

| Modo | Cuándo | Cómo | Internet |
|---|---|---|---|
| `local` | `npm run dev` / `npm start` en el PC | SSE contra el servidor de Vite (salas por código) | No necesita |
| `peer` | GitHub Pages (build con `VITE_SYNC=peer`) | WebRTC directo PC ↔ tablet con [PeerJS](https://peerjs.com) | Solo para el emparejamiento |

Se puede forzar el modo con `?sync=local` o `?sync=peer` en la URL (en ambas pantallas; el QR lo incluye).

> En modo `peer` la conexión es directa entre los dispositivos. En la misma WiFi funciona siempre; entre redes distintas (p. ej. PC en la red de la universidad y tablet con datos móviles) puede fallar en redes muy restrictivas, porque no se usa servidor TURN.

## Despliegue en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica la app en cada push a `main`.

1. Cree un repositorio en GitHub (p. ej. `appINLSC`) y suba este proyecto (la raíz es la carpeta que contiene `app/`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Haga push a `main` (o ejecute el workflow a mano en la pestaña *Actions*).
4. La app queda en `https://<usuario>.github.io/<repositorio>/` y la tablet en `https://<usuario>.github.io/<repositorio>/?tablet`.

Los videos se publican desde `app/public/videos` (se versionan en git; los originales de `Videos_señantes/` están excluidos en `.gitignore`). Si cambia algún video, ejecute `npm run videos` y haga commit de `app/public/videos`.

Para probar en el PC exactamente lo que se publicará:

```bash
INLSC_HTTP=1 PORT=5175 BASE_PATH=/appINLSC/ VITE_SYNC=peer npm start   # abrir http://localhost:5175/appINLSC/
```

> ⚠️ Con GitHub gratuito, Pages exige que el repositorio sea **público**: los videos de los intérpretes y el nombre de la IPS (`src/shared/config.ts`) quedarán visibles en internet. Confirme que tiene el consentimiento de los intérpretes y autorización de la IPS antes de publicar.

> ⚠️ **El reconocimiento de señas es simulado.** El funcionario dispara la detección desde el panel (sección 🎬 *Guion de la demo*). La selección **táctil** en la tablet sí es real. El panel muestra siempre la etiqueta "MODO DEMO".

## Requisitos

- Node 20 o superior (en Mac: `brew install node`; en Windows: instalador de nodejs.org)
- PC y tablet en la **misma red WiFi**, sin aislamiento de clientes

## Puesta en marcha

```bash
cd app
npm install
npm run videos   # copia ../Videos_señantes → public/videos con nombres normalizados
npm run dev      # servidor HTTPS en el puerto 5173, accesible en la red local
```

1. En el PC abra `https://localhost:5173`.
2. En la tablet escanee el QR de ⚙ → *Conectar la tablet* o abra la dirección que aparece allí (p. ej. `https://192.168.1.20:5173/?tablet&s=JP25GT`).
3. El certificado es autofirmado:
   - En **iPad (Safari):** *Mostrar detalles → visitar este sitio web*.
   - En **Android (Chrome):** *Configuración avanzada → Continuar*.
4. Toque la pantalla de la tablet para activarla. Se pide permiso de cámara y se pasa a pantalla completa.

Para probar sin la tablet, abra la dirección de la tablet (con `&s=<código>`) en otra pestaña del mismo PC.

## Guion sugerido para la demo (≈ 4 min)

| # | Funcionario (PC) | Señante (tablet) |
|---|---|---|
| 1 | *Iniciar atención* en la ventanita | Video de saludo |
| 2 | *Continuar* | Video "¿Cuál es su solicitud?" |
| 3 | *Activar cámara* | Cámara activa + los 3 trámites |
| 4 | 🎬 *Simular reconocimiento* (Asignación) → *Confirmar* | Hace la seña de "agendar cita"; se marca ✓ |
| 5 | *Documento recibido* | Video "entregue su documento" |
| 6 | Especialidad: *Ejemplo* → *Enviar a la tablet* | Infografía de especialidades → **toca una opción** |
| 7 | *Confirmar opción* → *Orden verificada* | Video "orden médica" |
| 8 | *Usar horarios de ejemplo* → *Enviar* → 🎬 número 3 → *Confirmar* | Infografía de horarios; hace la seña del número |
| 9 | *Finalizar atención* | "¡Cita asignada!" + "Que tenga un buen día" |

**Variantes para mostrar:**
- **Confianza baja:** en el paso 4 use *Simular confianza baja* para mostrar la validación del funcionario y *Volver a captar seña*.
- **Sin disponibilidad:** en el paso 8 use *Sin disponibilidad* para reproducir el video de negación.
- **Otros trámites:** cancelación (lista de citas simuladas) y facturación (campo de valor en $).

## Qué es real y qué es simulado

| Real | Simulado / pendiente |
|---|---|
| Sincronización PC ↔ tablet por sesiones (SSE local o WebRTC) | Reconocimiento de señas (lo dispara el funcionario) |
| Videos LSC reales y elección hombre/mujer según el perfil (⚙) | Citas del paciente (`MOCK_CITAS`) |
| Selección táctil en la tablet | Integración con el sistema de agendamiento de la IPS |
| Cámara de la tablet (vista previa) | Registro de información por una semana |
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
