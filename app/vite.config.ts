import { defineConfig, type Connect, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import basicSsl from "@vitejs/plugin-basic-ssl"
import os from "node:os"
import type { ServerResponse } from "node:http"

const PORT = Number(process.env.PORT ?? 5173)
// HTTPS es obligatorio para usar la cámara desde la tablet; INLSC_HTTP=1 solo para pruebas en localhost.
const useHttps = process.env.INLSC_HTTP !== "1"

export default defineConfig({
  // Con el dominio propio la app vive en la raíz; BASE_PATH permite servirla bajo un subdirectorio.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), ...(useHttps ? [basicSsl()] : []), inlscSync()],
  server: { host: true, port: PORT, strictPort: true },
  preview: { host: true, port: PORT, strictPort: true },
})

/**
 * Bus de sincronización en red local (sin internet) entre el panel del funcionario y la tablet.
 * Cada sesión (código de 6 caracteres) es una sala independiente con como máximo una tablet.
 *   GET  /api/host                                   → IPs locales y puerto, para mostrar la URL de la tablet
 *   GET  /api/events?role=&session=&device=          → stream SSE de mensajes (role = admin | tablet)
 *   POST /api/send?role=&session=&device=            → reenvía un mensaje al otro extremo de la sala
 * Los mensajes son los de `WireMessage` (src/shared/types.ts). Funciona en `vite` (dev) y en `vite preview`.
 */
function inlscSync(): Plugin {
  // Mismo valor que PEER_TIMEOUT_MS en src/shared/sync.ts.
  const PEER_TIMEOUT_MS = 6000
  interface Tablet { res: ServerResponse; device: string; lastSeen: number }
  interface Room { admin: Set<ServerResponse>; tablet: Tablet | null; lastState: string | null }
  const rooms = new Map<string, Room>()

  const params = (req: Connect.IncomingMessage) => {
    const q = new URL(req.url ?? "", "http://x").searchParams
    const code = q.get("session") ?? ""
    let room = rooms.get(code)
    if (!room) rooms.set(code, (room = { admin: new Set(), tablet: null, lastState: null }))
    return { room, role: q.get("role") === "tablet" ? "tablet" as const : "admin" as const, device: q.get("device") ?? "" }
  }

  const write = (res: ServerResponse, data: string) => { try { res.write(`data: ${data}\n\n`) } catch { /* conexión cerrada */ } }
  const toAdmins = (room: Room, data: string) => room.admin.forEach((res) => write(res, data))

  const readBody = (req: Connect.IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = ""
      req.on("data", (c: Buffer) => { body += c.toString() })
      req.on("end", () => resolve(body))
    })

  function localIPs() {
    return Object.values(os.networkInterfaces())
      .flatMap((list) => list ?? [])
      .filter((a) => a.family === "IPv4" && !a.internal)
      .map((a) => a.address)
  }

  function setup(app: Connect.Server) {
    app.use("/api/host", (_req, res) => {
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ ips: localIPs(), port: PORT }))
    })

    app.use("/api/events", (req, res) => {
      const { room, role, device } = params(req)
      // Sin cabecera "Connection": está prohibida en HTTP/2 (Vite usa HTTP/2 con HTTPS).
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
      res.write(": ok\n\n")
      const ping = setInterval(() => res.write(": ping\n\n"), 15000)

      if (role === "tablet") {
        const current = room.tablet
        if (current && current.device !== device && Date.now() - current.lastSeen < PEER_TIMEOUT_MS) {
          // Ya hay otra tablet viva en esta sesión.
          clearInterval(ping)
          write(res, JSON.stringify({ type: "rejected" }))
          res.end()
          return
        }
        current?.res.end() // misma tablet reconectándose, o una anterior que ya no responde
        const me: Tablet = { res, device, lastSeen: Date.now() }
        room.tablet = me
        if (room.lastState) write(res, room.lastState)
        req.on("close", () => {
          clearInterval(ping)
          if (room.tablet === me) { room.tablet = null; toAdmins(room, JSON.stringify({ type: "bye" })) }
        })
      } else {
        room.admin.add(res)
        req.on("close", () => {
          clearInterval(ping)
          room.admin.delete(res)
          if (!room.admin.size && room.tablet) write(room.tablet.res, JSON.stringify({ type: "bye" }))
        })
      }
    })

    app.use("/api/send", async (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
      const { room, role, device } = params(req)
      const body = await readBody(req)
      if (role === "tablet") {
        // Solo la tablet aceptada en la sala puede hablar con el panel.
        if (room.tablet?.device !== device) { res.statusCode = 409; res.end(); return }
        room.tablet.lastSeen = Date.now()
        toAdmins(room, body)
      } else {
        if ((JSON.parse(body) as { type?: string }).type === "state") room.lastState = body
        if (room.tablet) write(room.tablet.res, body)
      }
      res.end("ok")
    })
  }

  return {
    name: "inlsc-sync",
    configureServer: (server) => setup(server.middlewares),
    configurePreviewServer: (server) => setup(server.middlewares),
  }
}
