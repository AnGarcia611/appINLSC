import mqtt, { type MqttClient } from "mqtt"
import type { WireMessage } from "./types"

/**
 * Transporte "relay" (GitHub Pages): los mensajes viajan por servidores MQTT públicos sobre WSS (puerto 443/8084…),
 * que funcionan en casi cualquier red, sin servidor propio y sin depender de WebRTC/NAT.
 *   - Redundancia: se conecta a TODOS los servidores a la vez y publica en todos; basta con que uno funcione.
 *     Los mensajes repetidos (llegan por varios servidores) se descartan por su id.
 *   - Privacidad: el tema es un hash del código y el contenido va cifrado con AES-GCM (clave derivada del código).
 *   - Una sola tablet por sesión: el panel acepta la primera tablet y rechaza otras mientras la actual siga viva.
 * No usa `window`/`location` para poder probarse en Node (scripts/test-relay.ts).
 */
export const RELAY_BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
]

export type Role = "admin" | "tablet"
export interface Link { send: (msg: WireMessage) => void; close: () => void }
export interface Callbacks { onUp: (up: boolean) => void; onMessage: (msg: WireMessage) => void }

interface Envelope { id: string; from: Role; device: string; to?: string; msg: WireMessage }

const enc = new TextEncoder()
const dec = new TextDecoder()
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(8)).buffer)

async function sessionKeys(code: string) {
  const topic = `inlsc/v1/${hex(await crypto.subtle.digest("SHA-256", enc.encode(`inlsc-topic:${code}`))).slice(0, 32)}`
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"])
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("inlsc-relay-v1"), iterations: 50_000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  )
  return { topic, key }
}

export function relayLink(
  role: Role, code: string, device: string, peerTimeoutMs: number, cb: Callbacks, brokers: string[] = RELAY_BROKERS,
): Link {
  let closed = false // ya no se publica
  let stopped = false // ya no se avisa a la app (el hook pudo haber abierto otro enlace)
  let keys: Awaited<ReturnType<typeof sessionKeys>> | null = null
  const clients: MqttClient[] = []
  const seen = new Set<string>()
  let up = false
  // Solo panel: tablet aceptada y último estado (para enviarlo a una tablet que se une o se reconecta).
  let tablet: { device: string; lastSeen: number } | null = null
  let lastState: WireMessage | null = null

  const setUp = () => {
    if (stopped) return
    const now = clients.some((c) => c.connected)
    if (now !== up) { up = now; cb.onUp(now) }
  }

  async function publish(msg: WireMessage, to?: string) {
    if (!keys || closed) return
    const env: Envelope = { id: randomId(), from: role, device, to, msg }
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keys.key, enc.encode(JSON.stringify(env))))
    const payload = new Uint8Array(iv.length + data.length)
    payload.set(iv)
    payload.set(data, iv.length)
    for (const c of clients) if (c.connected) c.publish(keys.topic, payload as Buffer, { qos: 0 })
  }

  async function receive(payload: Uint8Array) {
    if (!keys || stopped || payload.length < 13) return
    let env: Envelope
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: payload.slice(0, 12) }, keys.key, payload.slice(12))
      env = JSON.parse(dec.decode(plain)) as Envelope
    } catch { return } // de otra sesión o corrupto
    if (stopped || seen.has(env.id)) return
    seen.add(env.id)
    if (seen.size > 500) seen.delete(seen.values().next().value!)
    if (env.from === role) return
    if (env.to && env.to !== device) return
    if (role === "admin") fromTablet(env)
    else cb.onMessage(env.msg)
  }

  function fromTablet(env: Envelope) {
    const now = Date.now()
    if (env.msg.type === "bye") {
      if (tablet?.device === env.device) { tablet = null; cb.onMessage(env.msg) }
      return
    }
    if (tablet && tablet.device !== env.device && now - tablet.lastSeen < peerTimeoutMs) {
      void publish({ type: "rejected" }, env.device) // ya hay otra tablet viva en esta sesión
      return
    }
    if (tablet?.device !== env.device) {
      tablet = { device: env.device, lastSeen: now }
      if (lastState) void publish(lastState, env.device)
    }
    tablet.lastSeen = now
    cb.onMessage(env.msg)
  }

  void sessionKeys(code).then((k) => {
    if (stopped) return
    keys = k
    for (const url of brokers) {
      const c = mqtt.connect(url, {
        clientId: `inlsc_${randomId()}`,
        clean: true,
        connectTimeout: 8000,
        // Reintento espaciado y con variación para no saturar a los servidores públicos.
        reconnectPeriod: 4000 + Math.floor(Math.random() * 3000),
        keepalive: 30,
      })
      c.on("connect", () => { c.subscribe(k.topic, { qos: 0 }); setUp() })
      c.on("message", (_t, payload) => { void receive(new Uint8Array(payload)) })
      c.on("close", setUp)
      c.on("offline", setUp)
      c.on("error", () => undefined) // mqtt.js reintenta solo; un servidor caído no afecta a los demás
      clients.push(c)
    }
  })

  return {
    send: (msg) => {
      if (role === "admin") {
        if (msg.type === "state") lastState = msg
        // Sin tablet aceptada solo se anuncia el latido; el estado se le envía al aceptarla.
        if (tablet || msg.type === "hb") void publish(msg, tablet?.device)
      } else void publish(msg)
    },
    close: () => {
      if (stopped) return
      stopped = true
      // Avisa al otro extremo antes de cerrar (sin esperar: la página puede estar descargándose).
      void publish({ type: "bye" }, role === "admin" ? tablet?.device : undefined)
        .finally(() => { closed = true; clients.forEach((c) => c.end(false)) })
      setTimeout(() => { closed = true; clients.forEach((c) => c.end(true)) }, 1000)
    },
  }
}
