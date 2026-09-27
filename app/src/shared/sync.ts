import { useEffect, useRef, useState } from "react"
import Peer, { type DataConnection } from "peerjs"
import type { ServerMessage, TabletEvent, TabletState } from "./types"

/**
 * Sincronización funcionario ↔ tablet dentro de una sesión identificada por un código.
 *   - "local": bus SSE del servidor de Vite (vite.config.ts). Funciona sin internet, en la misma red.
 *   - "peer":  WebRTC con PeerJS. No necesita servidor propio, por eso es el modo de GitHub Pages.
 *              Requiere internet solo para el emparejamiento (servidor público de PeerJS).
 * El modo lo fija el build (VITE_SYNC) y se puede forzar con ?sync=local | ?sync=peer.
 */
export type SyncMode = "local" | "peer"

export const SYNC_MODE: SyncMode = (() => {
  const forced = new URLSearchParams(location.search).get("sync")
  if (forced === "local" || forced === "peer") return forced
  return import.meta.env.VITE_SYNC === "peer" ? "peer" : "local"
})()

// Sin 0/O ni 1/I/L para que el código se pueda dictar y teclear sin errores.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const newSessionCode = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => ALPHABET[n % ALPHABET.length]).join("")
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
export const isValidCode = (code: string) => code.length === 6

type Role = "admin" | "tablet"
type Outgoing<R extends Role> = R extends "admin" ? TabletState : TabletEvent

/**
 * Se conecta a la sesión `code` con el rol indicado.
 * `connected`: el funcionario está registrado en el bus / la tablet está unida a la sesión del funcionario.
 */
export function useSync<R extends Role>(role: R, code: string | null, onMessage: (msg: ServerMessage) => void) {
  const [connected, setConnected] = useState(false)
  const handler = useRef(onMessage)
  handler.current = onMessage
  const sender = useRef<(payload: Outgoing<R>) => void>(() => undefined)

  useEffect(() => {
    setConnected(false)
    if (!code) return
    const emit = (msg: ServerMessage) => handler.current(msg)
    const link = SYNC_MODE === "peer"
      ? (role === "admin" ? peerAdmin : peerTablet)(code, emit, setConnected)
      : localBus(role, code, emit, setConnected)
    sender.current = link.send as (payload: Outgoing<R>) => void
    return () => { sender.current = () => undefined; link.close() }
  }, [role, code])

  return { connected, send: (payload: Outgoing<R>) => sender.current(payload) }
}

interface Link { send: (payload: unknown) => void; close: () => void }
type Emit = (msg: ServerMessage) => void

// ── Modo local: SSE + POST contra el servidor de Vite ──

function localBus(role: Role, code: string, emit: Emit, setConnected: (v: boolean) => void): Link {
  const q = `session=${encodeURIComponent(code)}`
  const es = new EventSource(`api/events?role=${role}&${q}`)
  es.onopen = () => setConnected(true)
  es.onerror = () => setConnected(false) // EventSource reintenta solo
  es.onmessage = (e) => { try { emit(JSON.parse(e.data)) } catch { /* mensaje inválido */ } }
  const url = role === "admin" ? `api/state?${q}` : `api/event?${q}`
  return {
    send: (body) => void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined),
    close: () => es.close(),
  }
}

// ── Modo peer: el funcionario registra el id "inlsc-<código>" y las tablets se conectan a él ──

const peerId = (code: string) => `inlsc-${code}`
const RETRY_MS = 2500

function peerAdmin(code: string, emit: Emit, setConnected: (v: boolean) => void): Link {
  const conns = new Set<DataConnection>()
  let lastState: TabletState | null = null
  let peer: Peer | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const presence = () => emit({ type: "presence", tablets: conns.size })
  const retry = () => { clearTimeout(timer); if (!closed) timer = setTimeout(open, RETRY_MS) }

  function open() {
    peer?.destroy()
    const p = new Peer(peerId(code), { debug: 0 })
    peer = p
    p.on("open", () => setConnected(true))
    p.on("connection", (c) => {
      c.on("open", () => {
        conns.add(c)
        if (lastState) c.send({ type: "state", state: lastState } satisfies ServerMessage)
        presence()
      })
      c.on("data", (event) => emit({ type: "tabletEvent", event: event as TabletEvent }))
      const drop = () => { if (conns.delete(c)) presence() }
      c.on("close", drop)
      c.on("error", drop)
    })
    p.on("disconnected", () => { setConnected(false); if (!closed && !p.destroyed) p.reconnect() })
    // "unavailable-id": el id aún está ocupado (p. ej. tras recargar la página); se libera en segundos.
    p.on("error", (err) => { if (err.type !== "peer-unavailable") { setConnected(false); retry() } })
  }

  // Diferido para que el doble montaje de StrictMode no registre el mismo id dos veces.
  timer = setTimeout(open, 0)

  return {
    send: (state) => {
      const msg: ServerMessage = { type: "state", state: state as TabletState }
      lastState = msg.state
      conns.forEach((c) => { if (c.open) c.send(msg) })
    },
    close: () => { closed = true; clearTimeout(timer); conns.clear(); peer?.destroy() },
  }
}

function peerTablet(code: string, emit: Emit, setConnected: (v: boolean) => void): Link {
  let peer: Peer | null = null
  let conn: DataConnection | null = null
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const later = (fn: () => void) => { clearTimeout(timer); if (!closed) timer = setTimeout(fn, RETRY_MS) }

  function connect() {
    if (!peer || peer.destroyed || !peer.open) { later(open); return }
    const c = peer.connect(peerId(code), { reliable: true })
    c.on("open", () => { conn = c; setConnected(true) })
    c.on("data", (msg) => emit(msg as ServerMessage))
    c.on("close", () => { if (conn === c) conn = null; setConnected(false); later(connect) })
  }

  function open() {
    peer?.destroy()
    const p = new Peer({ debug: 0 })
    peer = p
    p.on("open", connect)
    p.on("disconnected", () => { if (!closed && !p.destroyed) p.reconnect() })
    p.on("error", (err) => {
      setConnected(false)
      // "peer-unavailable": el funcionario aún no abre esa sesión; se reintenta la conexión.
      if (err.type === "peer-unavailable") later(connect)
      else later(open)
    })
  }

  timer = setTimeout(open, 0)

  return {
    send: (event) => { if (conn?.open) conn.send(event) },
    close: () => { closed = true; clearTimeout(timer); peer?.destroy() },
  }
}
