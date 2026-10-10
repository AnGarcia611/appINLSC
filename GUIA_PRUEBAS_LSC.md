# Guía de pruebas: reconocimiento de señas LSC

Qué se puede probar hoy en `main`, paso a paso y con lo que debería verse en cada paso.

**Orden recomendado:**

| # | Prueba | Necesita | Tiempo |
|---|---|---|---|
| 1 | [Laboratorio: ver el reconocimiento de números](#1-laboratorio-ver-el-reconocimiento-de-números) | Solo el computador con cámara | 5 min |
| 2 | [Flujo completo: panel + tablet con la seña del número](#2-flujo-completo-panel--tablet-con-la-seña-del-número) | Computador + tablet en la misma WiFi | 10 min |
| 3 | [Página de captura de señas](#3-página-de-captura-de-señas) | Tablet o computador con cámara | 10 min |
| 4 | [Procesar los paquetes recibidos](#4-procesar-los-paquetes-recibidos-por-correo) | Un paquete `.json.gz` descargado | 2 min |
| 5 | [Pruebas automáticas](#5-pruebas-automáticas) | Terminal | 1 min |

---

## 0. Antes de empezar

### Iniciar el servidor

En la terminal, desde la carpeta del proyecto:

```bash
cd /Users/andresgarcia/appINLSC/app
```

```bash
npm run dev
```

Debe mostrar algo como:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.78.164:5173/
```

> La IP de la red (`192.168.…`) puede cambiar. Use la que muestre la terminal.

### Las direcciones

| Pantalla | En el computador | En la tablet |
|---|---|---|
| Panel del funcionario | https://localhost:5173/ | — |
| Tablet del señante | — | La del QR del panel: `https://<IP>:5173/?tablet&s=<código>` |
| Laboratorio | https://localhost:5173/?lab | `https://<IP>:5173/?lab` |
| Captura de señas | https://localhost:5173/?captura | `https://<IP>:5173/?captura` |

### Dos reglas que evitan casi todos los problemas

1. **Siempre `https://`.** Con `http://<IP>` el navegador bloquea la cámara. La única excepción es `http://localhost` en el mismo computador.
2. **El aviso del certificado es normal.** La primera vez que abra cada dirección, el navegador dirá "La conexión no es privada", porque el certificado lo genera el propio servidor de desarrollo. Acéptelo una vez en cada equipo:
   - **Brave / Chrome:** *Configuración avanzada* → *Acceder a … (sitio no seguro)*.
   - **Safari / iPad:** *Mostrar detalles* → *visitar este sitio web* → confirmar.
   - **Android (Chrome):** *Configuración avanzada* → *Continuar*.

---

## 1. Laboratorio: ver el reconocimiento de números

La forma más rápida de ver si funciona. No necesita tablet ni panel.

1. Abra **https://localhost:5173/?lab** y permita la cámara.
2. Espere a que a la derecha, en **Estado**, diga `GPU · N fps` o `CPU · N fps`. Mientras diga "cargando modelos…" todavía no reconoce nada.
3. Ubíquese de modo que **se vean su cabeza y sus hombros**.
4. **Levante una mano por encima del codo**, a la altura del pecho o de la cara.

### 1.1 Números estáticos (1 al 5)

Haga cada número, **quédese quieto ~1 segundo** y **baje la mano** antes del siguiente.

| Número | Forma |
|---|---|
| 1 | Índice extendido |
| 2 | Índice + medio |
| 3 | Índice + medio + anular |
| 4 | Cuatro dedos, pulgar doblado sobre la palma |
| 5 | Mano abierta, cinco dedos |

**Debería ver:**
- Un esqueleto verde sobre la mano y líneas blancas sobre los hombros y brazos.
- En **Extensión de los dedos**, las barras de los dedos estirados cerca de 1.00 y las de los doblados cerca de 0.
- En **Forma (base 1–5)**, la barra del número que está haciendo como la más alta.
- En **Resultados**, una línea como `Número 3 · 88 % · estático`.

### 1.2 Números con movimiento (6 al 9)

Misma forma que 1–4, con la palma hacia la cámara, **doblando y estirando los dedos 2 o 3 veces**.

| Número | Forma base | Movimiento |
|---|---|---|
| 6 | 1 | El índice se dobla y se estira |
| 7 | 2 | Índice y medio se doblan y se estiran |
| 8 | 3 | Los tres dedos se doblan y se estiran |
| 9 | 4 | Los cuatro dedos se doblan y se estiran |

**Debería ver:** `Número 7 · … · movimiento`.

A veces primero sale el número estático (p. ej. 2) y, al hacer la flexión, se corrige a 7. Es lo esperado: si se queda quieto antes de mover los dedos, primero parece un 2.

### 1.3 Sí y no con la cabeza

- **Asienta** 3 veces seguidas → `Cabeza: sí · …`.
- **Niegue** de lado a lado 3 veces → `Cabeza: no · …`.

### 1.4 Que NO reconozca cosas

Con la mano levantada, pruebe esto. **No debería aparecer ningún número:**
- un puño cerrado;
- las manos apoyadas en la mesa (por debajo de los codos);
- pasar la mano rápido frente a la cámara.

⚠️ **Limitación conocida:** cualquier forma de mano **sostenida** puede leerse como número. Por ejemplo, señalar con el índice da "1". Por eso en el flujo real el funcionario siempre confirma.

### 1.5 Variantes del laboratorio

| Dirección | Para qué |
|---|---|
| `…/?lab&delegate=cpu` | Forzar CPU y comparar los fps con la GPU |
| `…/?lab&src=videos/seleccion_m.mp4` | Analizar un video de la intérprete en lugar de la cámara |
| Botón **Video** + elegir un archivo | Analizar un video propio grabado con el celular |

### 1.6 Qué anotar

| Dato | Dónde verlo | Valor esperado |
|---|---|---|
| Equipo y navegador | — | p. ej. "iPad 9.ª gen, Safari" |
| fps y GPU/CPU | **Estado** | 15 fps o más es cómodo; menos de 10 se nota lento |
| Aciertos por número | **Resultados** | Haga cada número 5 veces y anote cuántas acertó |

---

## 2. Flujo completo: panel + tablet con la seña del número

Prueba la integración real: el señante hace la seña en la tablet y el funcionario la ve en el panel.

> La seña del número está **apagada por defecto**, porque en Ajustes1 se pidió que en las elecciones el señante solo toque. Hay que activarla a mano.

### 2.1 Preparar

1. En el computador abra **https://localhost:5173/**.
2. En la ventanita "¿Necesita ayuda?" pulse **Conectar tablet**. Se abre el panel con el QR.
3. En el panel, en **Selección en las infografías**, elija **Toque o seña del número**.
   - Debajo del panel debe decir: `MODO DEMO · trámite simulado · seña del número real (beta)`.
4. En la tablet, **escanee el QR**. Acepte el aviso del certificado.
5. En la tablet, **toque la pantalla** y **permita la cámara**.
6. El panel debe decir **Tablet conectada**.

### 2.2 Llegar a la infografía

En el panel:

| Paso | Botón |
|---|---|
| Inicio | **Iniciar atención** |
| Saludo | **Continuar** |
| Solicitud | **Activar cámara** |
| Detección del trámite | El señante hace la seña de "pedir una cita" (o toca **Asignación de cita** en la tablet) → esperar el resultado → **Confirmar: Asignación de cita** |
| Documento | **Documento recibido** |
| Especialidad | **Ejemplo** → **Enviar a la tablet** |

### 2.3 Probar la seña

En la tablet aparecen las especialidades numeradas. En la columna derecha hay un recuadro pequeño con la cámara que dice **"Haga la seña del número"**.

| Prueba | Qué hacer en la tablet | Qué debería pasar |
|---|---|---|
| Seña clara | Levante la mano y haga el **3**, quieto 1 s | **Tablet:** la opción 3 queda marcada ✓ y el recuadro dice "Entendí este número". **Panel:** `Seña del número reconocida · NN %`, la barra de precisión y el botón **Confirmar opción 3** |
| Número fuera de rango | Con 8 opciones, haga el **9** | No se marca nada (no existe la opción 9) |
| Confianza baja | Una seña ambigua o a medio hacer | **Panel:** `VALIDACIÓN REQUERIDA · Posible seña del número N`, con botones **Usar opción N** y alternativas. La tablet **no** marca nada |
| Recaptar | En el panel, **Volver a captar** | Se borra la selección y la tablet vuelve a esperar una seña |
| El toque sigue funcionando | Toque una tarjeta | Se marca por toque: `Seleccionado en la pantalla táctil` |
| Confirmar | En el panel, **Confirmar opción N** | Avanza a "Orden médica" con esa especialidad |

Sigue igual en **Disponibilidad**: **Usar horarios de ejemplo** (o agregue horarios) → **Enviar horarios a la tablet** → seña del número del horario.

### 2.4 Volver a "solo toque"

Termine o cancele la atención. En el panel elija **Selección en las infografías → Solo toque**. En la siguiente infografía la tablet **no** muestra cámara.

---

## 3. Página de captura de señas

Es la página para que las personas sordas graben señas y las envíen. Se usa en la tablet o en el computador: **https://localhost:5173/?captura**.

> ⚠️ El texto de autorización es un **borrador** pendiente de revisión legal y la página lo indica. Pruébela usted mismo; no la use todavía con participantes reales.

| Paso | Qué hacer | Qué debería pasar |
|---|---|---|
| Inicio | **Empezar** | Pantalla de autorización |
| Autorización | Marque la primera casilla (y al menos un uso) → **Acepto y continúo** | Le asigna un código anónimo, p. ej. `S-7KQ2` |
| Perfil | Responda o deje en blanco → **Continuar y activar la cámara** | Permita la cámara. Aparece la lista de señas con su progreso (`0 de 86 tomas`) |
| Una seña | Toque **Número 3** | Muestra la referencia y pregunta **¿Usted hace esta seña así?** |
| Validación | **Sí, así la hago** (o **La hago distinto** + comentario) | Aparece la cámara con esqueleto y el botón **Grabar** |
| Grabar | **Grabar** → cuenta 3-2-1 → haga la seña → **baje la mano** | La grabación se corta sola al bajar la mano (máximo 10 s). Luego se **repite el esqueleto sin video** |
| Revisar | **Guardar** o **Repetir** | Con Guardar, el contador pasa a `Toma 2 de 5` |
| Avisos de calidad | Grabe sin levantar la mano | Dice "No se vio la mano levantada…" |
| Cabeza | **Sí (con la cabeza)** → Grabar → asienta | Graba 3 s fijos |
| Retomar | Recargue la página | Ofrece **Continuar con S-…** con las tomas guardadas |
| Probar el reconocimiento | En la lista, **Probar el reconocimiento** | Haga un número o asienta. Aparece lo que entendió y pide **Acertó** o **No acertó** (y cuál hizo) |
| Enviar | **Enviar datos** | Resume tomas, validaciones y pruebas, y el tamaño del archivo (≈ 33 KB por toma) |

### 3.1 Cómo llega el archivo

| Caso | Qué pasa al pulsar enviar |
|---|---|
| **Sitio publicado** (`inlscasiste.store`), con el servicio `captura-mail` desplegado | **Enviar** lo manda solo: un toque y aparece "¡Enviado!". Llega un correo a afgarciaos@gmail.com con el asunto `InLSC captura de señas · S-XXXX` y el archivo adjunto |
| El envío automático falla (sin internet, servicio caído) | Aparece el motivo y, debajo, el envío manual |
| Envío manual en iPad / Android | **Enviar por correo (menú Compartir)** abre el menú con el archivo adjunto. Elija Correo y escriba afgarciaos@gmail.com |
| Envío manual en computador | **Preparar el correo** muestra dos pasos: **1. Descargar el archivo** y **2. Abrir el correo**. Adjunte el archivo a mano |
| Servidor de desarrollo (`npm run dev`) | Usa el envío manual, salvo que arranque con `VITE_CAPTURE_URL` (ver `captura-mail/README.md`) |

Después del envío automático: **Terminar y borrar de la tablet**. Después del manual, cuando confirme que el correo llegó: **Ya se envió: borrar de la tablet**.

---|---|
| iPad / Android | **Enviar por correo** abre el menú de compartir con el archivo adjunto. Elija Correo y envíelo a afgarciaos@gmail.com |
| Computador (Brave, Chrome, Safari) | **Preparar el correo** muestra dos pasos: **1. Descargar el archivo** y **2. Abrir el correo** (con asunto y texto listos). Adjunte el archivo a mano |

Después de confirmar que el correo llegó: **Ya se envió: borrar de la tablet**.

---

## 4. Procesar los paquetes recibidos por correo

1. Guarde los archivos `inlsc_captura_….json.gz` en una carpeta **fuera del repositorio**, por ejemplo `~/inlsc-datos`. El repositorio es público y estos archivos son datos biométricos.
2. Ejecute:

```bash
cd /Users/andresgarcia/appINLSC/app && npm run dataset -- ~/inlsc-datos
```

**Debería ver:**
- un informe con tomas por seña y por señante, perfiles, respuestas "la hago distinto" con sus comentarios, y aciertos y errores de las pruebas (`hizo→entendió`);
- al final: `✓ N formas de número → public/vision/numbers.templates.json` y `✓ N prototipos … → public/vision/signs.templates.json`.

Con ese archivo, el reconocedor usa también las formas de mano reales de los señantes (k vecinos), además de las reglas. Recargue `?lab` para probarlo.

Si la carpeta está dentro del repositorio, el script se niega a leerla. Es intencional.

---

## 5. Pruebas automáticas

```bash
cd /Users/andresgarcia/appINLSC/app && npm test
```

Debe terminar con `pass 15`, `fail 0`. Prueban el motor con manos sintéticas: formas 1–5, movimiento 6–9, rechazo de puño o reposo, cabeza sí/no, formato de captura y plantillas.

---

## Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| "El navegador bloquea la cámara porque esta dirección no usa HTTPS" | Se abrió con `http://<IP>` | Use `https://<IP>:5173/…`, o `http://localhost` en el mismo computador |
| "La conexión no es privada" | Certificado de desarrollo | Aceptarlo una vez por equipo (ver §0) |
| El panel no ve la tablet | Panel y tablet en servidores o puertos distintos, o en redes WiFi distintas | Ambos en `…:5173`, misma WiFi |
| "Preparando reconocimiento…" no termina | Los modelos no cargaron | Recargue. Revise que existan `app/public/vision/models/*.task` y `app/public/vision/wasm/` (`npm run vision`) |
| No aparece el esqueleto | Mala luz o mano fuera del cuadro | Más luz de frente, sin contraluz, mano dentro del recuadro |
| Hay esqueleto pero no salen números | La mano no está por encima del codo, o no se queda quieta ~1 s | Levante más la mano y sostenga la forma |
| En la tablet no aparece el recuadro de la seña | Preferencia en "Solo toque", o se negó el permiso de cámara | Active **Toque o seña del número** y recargue la tablet aceptando la cámara |
| Brave no muestra la cámara | Permiso bloqueado | Ícono del candado junto a la dirección → Cámara → Permitir |
| fps muy bajos (< 10) | Equipo lento o sin GPU | Compare con `?lab&delegate=cpu`. Anote el modelo del equipo |

## Qué es real y qué sigue simulado

| Real | Simulado o pendiente |
|---|---|
| Reconocimiento de números 1–9 y del trámite (asignar, cancelar, facturar), en prueba | Probarlo con más señantes: hoy está entrenado con una sola persona |
| Sí/no con la cabeza (en `?lab` y `?captura`) | Sí/no dentro del flujo de atención: ningún paso lo pide todavía |
| Página de captura y envío por correo | Consentimiento definitivo y su video en LSC |
| Informe y plantillas con `npm run dataset` | Precisión medida con señantes reales |
