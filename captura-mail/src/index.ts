// Recibe un paquete de la página de captura (POST /captura) y lo reenvía como adjunto al correo del proyecto.
//
// El paquete no se abre aquí: el plan gratis de Workers da 10 ms de CPU por solicitud, y descomprimir y revisar
// varios MB no cabe. Se revisan solo el origen, el nombre, el tamaño y la cabecera gzip. La validación completa
// la hace `npm run dataset` en el computador de quien recibe los paquetes.
// No se guarda nada: el archivo pasa directo al correo.

interface Attachment { content: ArrayBuffer; filename: string; type: string; disposition: "attachment" }
interface SendEmail { send(message: { to: string; from: string; subject: string; text: string; attachments: Attachment[] }): Promise<unknown> }
interface RateLimit { limit(options: { key: string }): Promise<{ success: boolean }> }

interface Env {
  EMAIL: SendEmail
  LIMITER?: RateLimit
  DESTINATION: string
  SENDER: string
  ALLOWED_ORIGINS: string
}

/** 25 MiB es el máximo para direcciones verificadas; se deja margen para el resto del mensaje. */
const MAX_BYTES = 20 * 1024 * 1024
const FILE_NAME = /^inlsc_captura_(S-[A-Z2-9]{4})_\d{4}-\d{2}-\d{2}\.json(\.gz)?$/
/**
 * Desarrollo: https://localhost:PUERTO, https://IP-de-red-local:PUERTO (192.168.x.x, 10.x.x.x, 172.16–31.x.x)
 * y http://localhost:PUERTO (el único http donde el navegador permite la cámara).
 */
const DEV_ORIGIN = /^(https:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)|http:\/\/localhost)(:\d+)?$/

function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null
  const list = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  return list.includes(origin) || DEV_ORIGIN.test(origin) ? origin : null
}

const reply = (status: number, body: object, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    },
  })

/**
 * Resumen que manda la página (tomas, validaciones…). Viaja codificado con encodeURIComponent porque las cabeceras
 * HTTP no admiten cualquier carácter. Se deja en texto corto y sin caracteres de control.
 */
function clean(raw: string | null, max: number): string {
  let s = raw ?? ""
  try { s = decodeURIComponent(s) } catch { /* sin codificar */ }
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request.headers.get("Origin"), env)
    const url = new URL(request.url)

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 })
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, X-InLSC-File, X-InLSC-Summary",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      })
    }
    if (url.pathname !== "/captura" || request.method !== "POST") return reply(404, { error: "no encontrado" }, origin)
    if (!origin) return reply(403, { error: "origen no permitido" }, null)

    const ip = request.headers.get("CF-Connecting-IP") ?? "?"
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return reply(429, { error: "demasiados envíos, espere un minuto" }, origin)

    const file = request.headers.get("X-InLSC-File") ?? ""
    const name = FILE_NAME.exec(file)
    if (!name) return reply(400, { error: "nombre de archivo no válido" }, origin)
    const declared = Number(request.headers.get("Content-Length") ?? "0")
    if (declared > MAX_BYTES) return reply(413, { error: "archivo demasiado grande" }, origin)

    const body = await request.arrayBuffer()
    if (!body.byteLength || body.byteLength > MAX_BYTES) return reply(413, { error: "archivo vacío o demasiado grande" }, origin)
    const head = new Uint8Array(body, 0, Math.min(2, body.byteLength))
    const gz = file.endsWith(".gz")
    // gzip empieza con 1f 8b; el JSON sin comprimir (navegadores sin CompressionStream) con "{".
    if (gz ? head[0] !== 0x1f || head[1] !== 0x8b : head[0] !== 0x7b) return reply(400, { error: "el archivo no es un paquete de captura" }, origin)

    const code = name[1]
    const summary = clean(request.headers.get("X-InLSC-Summary"), 400)
    try {
      await env.EMAIL.send({
        from: env.SENDER,
        to: env.DESTINATION,
        subject: `InLSC captura de señas · ${code}`,
        text: [
          "Paquete recibido desde la página de captura de InLSC.",
          `Señante: ${code}`,
          ...(summary ? [`Resumen: ${summary}`] : []),
          `Tamaño: ${(body.byteLength / 1024).toFixed(1)} KB`,
          "",
          "Contiene solo puntos de referencia (sin video). Guárdelo fuera del repositorio público y procéselo con:",
          "  npm run dataset -- <carpeta>",
        ].join("\n"),
        attachments: [{ content: body, filename: file, type: gz ? "application/gzip" : "application/json", disposition: "attachment" }],
      })
    } catch (e) {
      console.error("envío fallido", e)
      return reply(502, { error: "no se pudo enviar el correo" }, origin)
    }
    return reply(200, { ok: true }, origin)
  },
}
