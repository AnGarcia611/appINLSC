import { useEffect, useRef, useState } from "react"
import { relayLink, type Callbacks, type Link, type Role } from "./relay"
import type { TabletEvent, TabletState, WireMessage } from "./types"

/**
 * Sincronización funcionario ↔ tablet dentro de una sesión identificada por un código.
 *   - "local": bus SSE del servidor de Vite (vite.config.ts). Funciona sin internet, en la misma red.
 *   - "relay": mensajes cifrados a través de varios servidores MQTT públicos a la vez (ver relay.ts).
 *              No necesita servidor propio, por eso es el modo de GitHub Pages. Requiere internet.
 * El modo lo fija el build (VITE_SYNC) y se puede forzar con ?sync=local | ?sync=relay.
 * ("peer" se acepta como sinónimo de "relay": era el modo WebRTC/PeerJS, retirado porque el servidor público
 *  de PeerJS limita las conexiones (HTTP 429) y dejaba la tablet sin poder conectarse.)
 *
 * Reglas de la sesión:
 *   - Ambos extremos envían un latido cada HEARTBEAT_MS; si no llega nada en PEER_TIMEOUT_MS el otro se da por perdido.
 *   - Solo una tablet por sesión. Cada tablet tiene un identificador propio (DEVICE_ID): la misma tablet puede
 *     reconectarse, pero otra distinta es rechazada mientras la actual siga viva.
 */
export type SyncMode = "local" | "relay"

const asMode = (raw: string | null | undefined): SyncMode | null =>
  raw === "local" ? "local" : raw === "relay" || raw === "peer" ? "relay" : null

export const SYNC_MODE: SyncMode =
  asMode(new URLSearchParams(location.search).get("sync")) ?? asMode(import.meta.env.VITE_SYNC) ?? "local"

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
    const callbacks: Callbacks = {
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
    }
    const link: Link = SYNC_MODE === "relay"
      ? relayLink(role, code, DEVICE_ID, PEER_TIMEOUT_MS, callbacks)
      : localBus(role, code, callbacks)
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
