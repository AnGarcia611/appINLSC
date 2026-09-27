import { defineConfig, type Connect, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import basicSsl from "@vitejs/plugin-basic-ssl"
import os from "node:os"
import type { ServerResponse } from "node:http"

const PORT = Number(process.env.PORT ?? 5173)
// HTTPS es obligatorio para usar la cámara desde la tablet; INLSC_HTTP=1 solo para pruebas en localhost.
const useHttps = process.env.INLSC_HTTP !== "1"

export default defineConfig({
  // En GitHub Pages la app vive en /<repositorio>/; el workflow define BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), ...(useHttps ? [basicSsl()] : []), inlscSync()],
  server: { host: true, port: PORT, strictPort: true },
  preview: { host: true, port: PORT, strictPort: true },
})

/**
 * Bus de sincronización en red local (sin internet) entre el panel del funcionario y la tablet.
 * Cada sesión (código de 6 caracteres, parámetro ?session=) es una sala independiente.
 *   GET  /api/host                      → IPs locales y puerto, para mostrar la URL de la tablet
 *   GET  /api/events?role=...&session=  → stream SSE (role = admin | tablet)
 *   POST /api/state?session=            → admin publica el estado de la pantalla de la tablet
 *   POST /api/event?session=            → tablet publica eventos (p. ej. selección táctil) hacia el admin
 * Funciona tanto en `vite` (dev) como en `vite preview`.
 */
function inlscSync(): Plugin {
  interface Room { admin: Set<ServerResponse>; tablet: Set<ServerResponse>; lastState: string | null }
  const rooms = new Map<string, Room>()
  const roomOf = (req: Connect.IncomingMessage) => {
    const code = new URL(req.url ?? "", "http://x").searchParams.get("session") ?? ""
    let room = rooms.get(code)
    if (!room) rooms.set(code, (room = { admin: new Set(), tablet: new Set(), lastState: null }))
    return room
  }

  const send = (set: Set<ServerResponse>, payload: unknown) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`
    set.forEach((res) => { try { res.write(data) } catch { set.delete(res) } })
  }
  const presence = (room: Room) => send(room.admin, { type: "presence", tablets: room.tablet.size })

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
      const room = roomOf(req)
      const role = new URL(req.url ?? "", "http://x").searchParams.get("role") === "tablet" ? "tablet" : "admin"
      // Sin cabecera "Connection": está prohibida en HTTP/2 (Vite usa HTTP/2 con HTTPS).
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
      res.write(": ok\n\n")
      room[role].add(res)
      if (role === "tablet" && room.lastState) res.write(`data: ${JSON.stringify({ type: "state", state: JSON.parse(room.lastState) })}\n\n`)
      presence(room)
      const ping = setInterval(() => res.write(": ping\n\n"), 15000)
      req.on("close", () => { clearInterval(ping); room[role].delete(res); presence(room) })
    })

    app.use("/api/state", async (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
      const room = roomOf(req)
      room.lastState = await readBody(req)
      send(room.tablet, { type: "state", state: JSON.parse(room.lastState) })
      res.end("ok")
    })

    app.use("/api/event", async (req, res) => {
      if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
      send(roomOf(req).admin, { type: "tabletEvent", event: JSON.parse(await readBody(req)) })
      res.end("ok")
    })
  }

  return {
    name: "inlsc-sync",
    configureServer: (server) => setup(server.middlewares),
    configurePreviewServer: (server) => setup(server.middlewares),
  }
}
