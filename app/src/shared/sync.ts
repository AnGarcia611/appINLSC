import { useEffect, useRef, useState } from "react"
import Peer, { type DataConnection } from "peerjs"
import type { TabletEvent, TabletState, WireMessage } from "./types"

/**
 * Sincronización funcionario ↔ tablet dentro de una sesión identificada por un código.
 *   - "local": bus SSE del servidor de Vite (vite.config.ts). Funciona sin internet, en la misma red.
 *   - "peer":  WebRTC con PeerJS. No necesita servidor propio, por eso es el modo de GitHub Pages.
 *              Requiere internet solo para el emparejamiento (servidor público de PeerJS).
 * El modo lo fija el build (VITE_SYNC) y se puede forzar con ?sync=local | ?sync=peer.
 *
 * Reglas de la sesión:
 *   - Ambos extremos envían un latido cada HEARTBEAT_MS; si no llega nada en PEER_TIMEOUT_MS el otro se da por perdido.
 *   - Solo una tablet por sesión. Cada tablet tiene un identificador propio (DEVICE_ID): la misma tablet puede
 *     reconectarse, pero otra distinta es rechazada mientras la actual siga viva.
 */
export type SyncMode = "local" | "peer"

export const SYNC_MODE: SyncMode = (() => {
  const forced = new URLSearchParams(location.search).get("sync")
  if (forced === "local" || forced === "peer") return forced
  return import.meta.env.VITE_SYNC === "peer" ? "peer" : "local"
})()

export const HEARTBEAT_MS = 2000
export const PEER_TIMEOUT_MS = 6000

// Sin 0/O ni 1/I/L para que el código se pueda dictar y teclear sin errores.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const randomCode = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => ALPHABET[n % ALPHABET.length]).join("")
export const newSessionCode = () => randomCode(6)
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
export const isValidCode = (code: string) => code.length === 6

/**
 * Identificador de esta tablet (solo lo usa la tablet). Se guarda por pestaña: sobrevive a recargas,
 * y dos pestañas del mismo navegador cuentan como dos tablets distintas.
 */
const DEVICE_ID = (() => {
  try {
    const stored = sessionStorage.getItem("inlsc.deviceId")
    if (stored) return stored
    const id = randomCode(12)
    sessionStorage.setItem("inlsc.deviceId", id)
    return id
  } catch { return randomCode(12) }
})()

type Role = "admin" | "tablet"

/**
 * Enlace de bajo nivel con la sesión.
 *   linkUp:    el transporte está activo (admin registrado en el bus / tablet unida al canal).
 *   peerAlive: el otro extremo da señales de vida (latidos o mensajes recientes).
 *   rejected:  (tablet) la sesión ya tiene otra tablet conectada.
 */
function useLink(role: Role, code: string | null, onData: (msg: WireMessage) => void) {
  const [linkUp, setLinkUp] = useState(false)
  const [peerAlive, setPeerAlive] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const handler = useRef(onData)
  handler.current = onData
  const linkRef = useRef<Link | null>(null)

  useEffect(() => {
    setLinkUp(false)
    setPeerAlive(false)
    setRejected(false)
    if (!code) return

    let lastSeen = 0
    const lost = () => { lastSeen = 0; setPeerAlive(false) }
    const link: Link = (SYNC_MODE === "peer" ? (role === "admin" ? peerAdmin : peerTablet) : localBus)(role, code, {
      onUp: (up) => {
        setLinkUp(up)
        if (up) link.send({ type: "hb" }) // anuncia su presencia sin esperar al siguiente latido
        else lost()
      },
      onMessage: (msg) => {
        if (msg.type === "rejected") { setRejected(true); lost(); link.close(); return }
        if (msg.type === "bye") { lost(); return }
        lastSeen = Date.now()
        setPeerAlive(true)
        if (msg.type !== "hb") handler.current(msg)
      },
    })
    linkRef.current = link

    const beat = setInterval(() => {
      link.send({ type: "hb" })
      if (lastSeen && Date.now() - lastSeen > PEER_TIMEOUT_MS) lost()
    }, HEARTBEAT_MS)

    return () => { clearInterval(beat); linkRef.current = null; link.close() }
  }, [role, code, attempt])

  return {
    linkUp,
    peerAlive: linkUp && peerAlive,
    rejected,
    send: (msg: WireMessage) => linkRef.current?.send(msg),
    retry: () => setAttempt((n) => n + 1),
  }
}

/** Panel del funcionario. `online`: conectado al bus/servidor de emparejamiento. `tablet`: hay una tablet viva. */
export function useAdminSync(code: string | null, onEvent: (event: TabletEvent) => void) {
  const link = useLink("admin", code, (msg) => { if (msg.type === "event") onEvent(msg.event) })
  return {
    online: link.linkUp,
    tablet: link.peerAlive,
    send: (state: TabletState) => link.send({ type: "state", state }),
  }
}

export type TabletStatus = "connecting" | "connected" | "lost" | "rejected"

/** Tablet del señante. "lost" = estuvo conectada y perdió la conexión; "connecting" = aún no se ha conectado. */
export function useTabletSync(code: string | null, onState: (state: TabletState) => void) {
  const link = useLink("tablet", code, (msg) => { if (msg.type === "state") onState(msg.state) })
  const [everConnected, setEverConnected] = useState(false)

  useEffect(() => { setEverConnected(false) }, [code])
  useEffect(() => { if (link.peerAlive) setEverConnected(true) }, [link.peerAlive])

  const status: TabletStatus = link.rejected ? "rejected" : link.peerAlive ? "connected" : everConnected ? "lost" : "connecting"
  return {
    status,
    send: (event: TabletEvent) => link.send({ type: "event", event }),
    retry: () => { setEverConnected(false); link.retry() },
  }
}

interface Link { send: (msg: WireMessage) => void; close: () => void }
interface Callbacks { onUp: (up: boolean) => void; onMessage: (msg: WireMessage) => void }

// ── Modo local: SSE + POST contra el servidor de Vite (que aplica la regla de una sola tablet) ──

function localBus(role: Role, code: string, cb: Callbacks): Link {
  const q = `role=${role}&session=${encodeURIComponent(code)}&device=${DEVICE_ID}`
  const es = new EventSource(`api/events?${q}`)
  es.onopen = () => cb.onUp(true)
  es.onerror = () => cb.onUp(false) // EventSource reintenta solo
  es.onmessage = (e) => { try { cb.onMessage(JSON.parse(e.data)) } catch { /* mensaje inválido */ } }
  return {
    send: (msg) => {
      if (es.readyState !== EventSource.OPEN) return
      void fetch(`api/send?${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg) }).catch(() => undefined)
    },
    close: () => es.close(),
  }
}

// ── Modo peer: el funcionario registra el id "inlsc-<código>" y la tablet se conecta a él ──

const peerId = (code: string) => `inlsc-${code}`
const RETRY_MS = 2500

function peerAdmin(_role: Role, code: string, cb: Callbacks): Link {
  let tablet: { conn: DataConnection; device: string; lastSeen: number } | null = null
  let lastState: WireMessage | null = null
  let peer: Peer | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const retry = () => { clearTimeout(timer); if (!closed) timer = setTimeout(open, RETRY_MS) }

  function accept(c: DataConnection) {
    const device = String((c.metadata as { device?: string } | undefined)?.device ?? "")
    const current = tablet
    if (current && current.device !== device && current.conn.open && Date.now() - current.lastSeen < PEER_TIMEOUT_MS) {
      c.send({ type: "rejected" } satisfies WireMessage)
      setTimeout(() => c.close(), 500)
      return
    }
    current?.conn.close() // misma tablet reconectándose, o una anterior que ya no responde
    tablet = { conn: c, device, lastSeen: Date.now() }
    if (lastState) c.send(lastState)
  }

  function open() {
    peer?.destroy()
    const p = new Peer(peerId(code), { debug: 0 })
    peer = p
    p.on("open", () => cb.onUp(true))
    p.on("connection", (c) => {
      c.on("open", () => accept(c))
      c.on("data", (msg) => {
        if (tablet?.conn !== c) return
        tablet.lastSeen = Date.now()
        cb.onMessage(msg as WireMessage)
      })
      const drop = () => { if (tablet?.conn === c) { tablet = null; cb.onMessage({ type: "bye" }) } }
      c.on("close", drop)
      c.on("error", drop)
    })
    p.on("disconnected", () => { cb.onUp(false); if (!closed && !p.destroyed) p.reconnect() })
    // "unavailable-id": el id aún está ocupado (p. ej. tras recargar la página); se libera en segundos.
    p.on("error", (err) => { if (err.type !== "peer-unavailable") { cb.onUp(false); retry() } })
  }

  // Diferido para que el doble montaje de StrictMode no registre el mismo id dos veces.
  timer = setTimeout(open, 0)

  return {
    send: (msg) => {
      if (msg.type === "state") lastState = msg
      if (tablet?.conn.open) tablet.conn.send(msg)
    },
    close: () => { closed = true; clearTimeout(timer); tablet = null; peer?.destroy() },
  }
}

function peerTablet(_role: Role, code: string, cb: Callbacks): Link {
  let peer: Peer | null = null
  let conn: DataConnection | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const later = (fn: () => void) => { clearTimeout(timer); if (!closed) timer = setTimeout(fn, RETRY_MS) }

  function connect() {
    if (!peer || peer.destroyed || !peer.open) { later(open); return }
    const c = peer.connect(peerId(code), { reliable: true, metadata: { device: DEVICE_ID } })
    c.on("open", () => { conn = c; cb.onUp(true) })
    c.on("data", (msg) => cb.onMessage(msg as WireMessage))
    c.on("close", () => { if (conn === c) conn = null; cb.onUp(false); later(connect) })
  }

  function open() {
    peer?.destroy()
    const p = new Peer({ debug: 0 })
    peer = p
    p.on("open", connect)
    p.on("disconnected", () => { if (!closed && !p.destroyed) p.reconnect() })
    p.on("error", (err) => {
      cb.onUp(false)
      // "peer-unavailable": el funcionario aún no abre esa sesión; se reintenta la conexión.
      if (err.type === "peer-unavailable") later(connect)
      else later(open)
    })
  }

  timer = setTimeout(open, 0)

  return {
    send: (msg) => { if (conn?.open) conn.send(msg) },
    close: () => { closed = true; clearTimeout(timer); peer?.destroy() },
  }
}
