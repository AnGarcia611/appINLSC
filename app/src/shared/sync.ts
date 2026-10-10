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
 *   - Ambos extremos envían un latido cada HEARTBEAT_MS y responden al latido del otro: así la sesión sigue viva aunque
 *     una pestaña quede en segundo plano (el navegador frena sus temporizadores, no la llegada de mensajes).
 *   - Sin noticias del otro extremo durante WEAK_MS la conexión se marca "inestable" (aviso, no bloquea);
 *     durante PEER_TIMEOUT_MS se da por perdido (bloquea). Un corte breve del canal no cuenta hasta ese plazo.
 *   - La tablet saluda ("hello") al conectarse y al volver a primer plano, y el panel le reenvía el estado actual.
 *   - Solo una tablet por sesión. Cada tablet tiene un identificador propio (DEVICE_ID): la misma tablet puede
 *     reconectarse, pero otra distinta es rechazada mientras la actual siga viva.
 */
export type SyncMode = "local" | "relay"

const asMode = (raw: string | null | undefined): SyncMode | null =>
  raw === "local" ? "local" : raw === "relay" || raw === "peer" ? "relay" : null

export const SYNC_MODE: SyncMode =
  asMode(new URLSearchParams(location.search).get("sync")) ?? asMode(import.meta.env.VITE_SYNC) ?? "local"

export const HEARTBEAT_MS = 2000
/** Sin noticias del otro extremo: aviso de conexión inestable. */
export const WEAK_MS = 7000
/** Sin noticias del otro extremo: se da por perdido. Antes 6 s: con redes móviles o brokers públicos cortaba de más. */
export const PEER_TIMEOUT_MS = 20000

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
 *   peerAlive: el otro extremo dio señales de vida hace menos de PEER_TIMEOUT_MS.
 *   weak:      vivo, pero sin noticias desde hace más de WEAK_MS (conexión inestable).
 *   rejected:  (tablet) la sesión ya tiene otra tablet conectada.
 */
function useLink(role: Role, code: string | null, onData: (msg: WireMessage) => void) {
  const [linkUp, setLinkUp] = useState(false)
  const [peerAlive, setPeerAlive] = useState(false)
  const [weak, setWeak] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const handler = useRef(onData)
  handler.current = onData
  const linkRef = useRef<Link | null>(null)

  useEffect(() => {
    setLinkUp(false)
    setPeerAlive(false)
    setWeak(false)
    setRejected(false)
    if (!code) return

    let lastSeen = 0
    let lastSent = 0
    const send = (msg: WireMessage) => { lastSent = Date.now(); link.send(msg) }
    // La tablet se presenta con "hello" para que el panel le reenvíe la pantalla actual.
    const announce = () => send(role === "tablet" ? { type: "hello" } : { type: "hb" })
    const lost = () => { lastSeen = 0; setPeerAlive(false); setWeak(false) }
    const callbacks: Callbacks = {
      // Un corte del canal no da por perdido al otro extremo: decide el plazo PEER_TIMEOUT_MS.
      onUp: (up) => { setLinkUp(up); if (up) announce() },
      onMessage: (msg) => {
        if (msg.type === "rejected") { setRejected(true); lost(); link.close(); return }
        if (msg.type === "bye") { lost(); return }
        lastSeen = Date.now()
        setPeerAlive(true)
        setWeak(false)
        // Responde al latido aunque esta pestaña esté en segundo plano y sus temporizadores vayan lentos.
        if ((msg.type === "hb" || msg.type === "hello") && Date.now() - lastSent > HEARTBEAT_MS) send({ type: "hb" })
        if (msg.type !== "hb") handler.current(msg)
      },
    }
    const link: Link = SYNC_MODE === "relay"
      ? relayLink(role, code, DEVICE_ID, PEER_TIMEOUT_MS, callbacks)
      : localBus(role, code, callbacks)
    linkRef.current = link

    const check = () => {
      if (!lastSeen) return
      const quiet = Date.now() - lastSeen
      if (quiet > PEER_TIMEOUT_MS) lost()
      else setWeak(quiet > WEAK_MS)
    }
    const beat = setInterval(() => { send({ type: "hb" }); check() }, HEARTBEAT_MS)
    const onVisible = () => { if (document.visibilityState === "visible") { announce(); check() } }
    document.addEventListener("visibilitychange", onVisible)

    return () => { clearInterval(beat); document.removeEventListener("visibilitychange", onVisible); linkRef.current = null; link.close() }
  }, [role, code, attempt])

  return {
    linkUp,
    peerAlive,
    weak: peerAlive && weak,
    rejected,
    send: (msg: WireMessage) => linkRef.current?.send(msg),
    retry: () => setAttempt((n) => n + 1),
  }
}

/** Panel del funcionario. `online`: conectado al bus/servidor de emparejamiento. `tablet`: hay una tablet viva. */
export function useAdminSync(code: string | null, onEvent: (event: TabletEvent) => void) {
  const last = useRef<WireMessage | null>(null)
  // Empieza en la hora actual: tras recargar el panel, sus estados siguen siendo "más nuevos" para la tablet.
  const counter = useRef(Date.now())
  const link = useLink("admin", code, (msg) => {
    if (msg.type === "event") onEvent(msg.event)
    else if (msg.type === "hello" && last.current) link.send(last.current) // tablet recargada o que vuelve: estado actual
  })
  return {
    online: link.linkUp,
    tablet: link.peerAlive,
    /** Tablet viva pero sin noticias hace unos segundos. */
    weak: link.weak,
    send: (state: TabletState) => {
      const msg: WireMessage = { type: "state", state, n: ++counter.current }
      last.current = msg
      link.send(msg)
    },
  }
}

export type TabletStatus = "connecting" | "connected" | "lost" | "rejected"

/** Tablet del señante. "lost" = estuvo conectada y perdió la conexión; "connecting" = aún no se ha conectado. */
export function useTabletSync(code: string | null, onState: (state: TabletState) => void) {
  const lastN = useRef(0)
  const link = useLink("tablet", code, (msg) => {
    if (msg.type !== "state") return
    if (msg.n !== undefined && msg.n < lastN.current) return // llegó tarde: ya se aplicó uno más nuevo
    lastN.current = msg.n ?? lastN.current
    onState(msg.state)
  })
  const [everConnected, setEverConnected] = useState(false)

  useEffect(() => { setEverConnected(false); lastN.current = 0 }, [code])
  useEffect(() => { if (link.peerAlive) setEverConnected(true) }, [link.peerAlive])

  const status: TabletStatus = link.rejected ? "rejected" : link.peerAlive ? "connected" : everConnected ? "lost" : "connecting"
  return {
    status,
    /** Conectada pero sin noticias hace unos segundos. */
    weak: link.weak,
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
