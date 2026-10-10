// Prueba de extremo a extremo del relé (modo de GitHub Pages) contra los servidores MQTT reales.
//   npm run test:sync
// Comprueba: panel ↔ tablet en ambos sentidos, el saludo de reconexión, rechazo de una segunda tablet, y que todo sigue
// funcionando si un servidor de la lista está caído. Sale con código 1 si algo falla.
import { RELAY_BROKERS, relayLink, type Link, type Role } from "../src/shared/relay.ts"
import type { WireMessage } from "../src/shared/types.ts"

/** Mismo plazo que src/shared/sync.ts (no se importa: sync.ts usa React y `location`). */
const PEER_TIMEOUT_MS = 20000

const TIMEOUT_MS = 20_000
const code = Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("")

function endpoint(role: Role, device: string, brokers: string[]) {
  const inbox: WireMessage[] = []
  let up = false
  const link: Link = relayLink(role, code, device, PEER_TIMEOUT_MS, {
    onUp: (u) => { up = u },
    onMessage: (m) => { inbox.push(m) },
  }, brokers)
  return { link, inbox, isUp: () => up }
}

async function until(what: string, ok: () => boolean) {
  const t = Date.now()
  while (!ok()) {
    if (Date.now() - t > TIMEOUT_MS) throw new Error(`Tiempo agotado esperando: ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  console.log(`  ✓ ${what} (${Date.now() - t} ms)`)
}

async function run(label: string, brokers: string[]) {
  console.log(`\n${label}`)
  const admin = endpoint("admin", "PC", brokers)
  const tabletA = endpoint("tablet", "TABLET_A", brokers)
  const tabletB = endpoint("tablet", "TABLET_B", brokers)
  try {
    await until("panel conectado al relé", admin.isUp)
    await until("tablet conectada al relé", tabletA.isUp)

    const state = { type: "state", state: { seq: 7, camera: false, view: { kind: "idle" } } } as WireMessage
    admin.link.send(state)
    tabletA.link.send({ type: "hb" })
    await until("el panel ve a la tablet", () => admin.inbox.some((m) => m.type === "hb"))
    await until("la tablet recibe el estado", () => tabletA.inbox.some((m) => m.type === "state" && m.state.seq === 7))

    tabletA.link.send({ type: "event", event: { type: "select", index: 2, seq: 7 } })
    await until("el panel recibe el toque", () => admin.inbox.some((m) => m.type === "event" && m.event.type === "select" && m.event.index === 2))

    // Tablet recargada: saluda y el panel (useAdminSync) le reenvía el estado; aquí se comprueba que el saludo llega.
    tabletA.link.send({ type: "hello" })
    await until("el panel recibe el saludo de la tablet", () => admin.inbox.some((m) => m.type === "hello"))

    await until("tablet B conectada al relé", tabletB.isUp)
    tabletB.link.send({ type: "hb" })
    await until("una segunda tablet es rechazada", () => tabletB.inbox.some((m) => m.type === "rejected"))
    if (tabletB.inbox.some((m) => m.type === "state")) throw new Error("La tablet rechazada recibió el estado")
  } finally {
    for (const e of [admin, tabletA, tabletB]) e.link.close()
  }
}

try {
  await run(`Relé con todos los servidores (sesión ${code})`, RELAY_BROKERS)
  await run("Relé con un servidor caído", ["wss://servidor-caido.invalid/mqtt", ...RELAY_BROKERS.slice(1)])
  console.log("\nOK: la sincronización por relé funciona.")
  setTimeout(() => process.exit(0), 1500)
} catch (err) {
  console.error(`\nFALLO: ${(err as Error).message}`)
  process.exit(1)
}
