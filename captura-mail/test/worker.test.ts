// Pruebas del Worker con un envío de correo falso.   node --test test/
import { test } from "node:test"
import assert from "node:assert/strict"
import zlib from "node:zlib"
import worker from "../src/index.ts"

function env(limitOk = true) {
  const sent: any[] = []
  return {
    sent,
    env: {
      EMAIL: { send: async (m: any) => { sent.push(m) } },
      LIMITER: { limit: async () => ({ success: limitOk }) },
      DESTINATION: "afgarciaos@gmail.com",
      SENDER: "captura@inlscasiste.store",
      ALLOWED_ORIGINS: "https://inlscasiste.store",
    },
  }
}
const gz = zlib.gzipSync(JSON.stringify({ format: "inlsc-captura" }))
const post = (body: BodyInit, headers: Record<string, string>) =>
  new Request("https://inlsc-captura.example.workers.dev/captura", { method: "POST", body, headers })
const ok = { Origin: "https://inlscasiste.store", "X-InLSC-File": "inlsc_captura_S-7KQ2_2026-10-04.json.gz", "X-InLSC-Summary": encodeURIComponent("45 tomas\n· 9 señas ✓") }

test("envía el paquete como adjunto al correo verificado", async () => {
  const e = env()
  const res = await worker.fetch(post(gz, ok), e.env as any)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://inlscasiste.store")
  assert.equal(e.sent.length, 1)
  const m = e.sent[0]
  assert.equal(m.to, "afgarciaos@gmail.com")
  assert.match(m.subject, /S-7KQ2/)
  assert.match(m.text, /Resumen: 45 tomas · 9 señas ✓/) // decodificado y sin saltos de línea inyectados
  assert.equal(m.attachments[0].filename, ok["X-InLSC-File"])
  assert.deepEqual(Buffer.from(m.attachments[0].content), gz)
})

test("rechaza origen ajeno, nombre raro, archivo que no es gzip y exceso de envíos", async () => {
  const cases: [Record<string, string>, BodyInit, number, boolean?][] = [
    [{ ...ok, Origin: "https://malo.example" }, gz, 403],
    [{ ...ok, Origin: "" }, gz, 403],
    [{ ...ok, "X-InLSC-File": "../../etc/passwd" }, gz, 400],
    [ok, "hola", 400],
    [ok, gz, 429, false],
  ]
  for (const [headers, body, status, limitOk = true] of cases) {
    const e = env(limitOk)
    const res = await worker.fetch(post(body, headers), e.env as any)
    assert.equal(res.status, status, JSON.stringify(headers))
    assert.equal(e.sent.length, 0)
  }
})

test("permite desarrollo en https://localhost, https://IP de red local y http://localhost; no http con IP", async () => {
  for (const [origin, status] of [["https://localhost:5176", 200], ["https://192.168.78.164:5176", 200], ["http://localhost:5177", 200], ["http://192.168.78.164:5177", 403], ["https://localhost.malo.example", 403]] as const) {
    const res = await worker.fetch(post(gz, { ...ok, Origin: origin }), env().env as any)
    assert.equal(res.status, status, origin)
  }
})

test("preflight CORS", async () => {
  const res = await worker.fetch(new Request("https://x/captura", { method: "OPTIONS", headers: { Origin: "https://inlscasiste.store" } }), env().env as any)
  assert.equal(res.status, 204)
  assert.match(res.headers.get("Access-Control-Allow-Headers") ?? "", /X-InLSC-File/)
})

test("si el correo falla responde 502 para que la página ofrezca el envío manual", async () => {
  const e = env()
  e.env.EMAIL.send = async () => { throw new Error("E_SENDER_NOT_VERIFIED") }
  const res = await worker.fetch(post(gz, ok), e.env as any)
  assert.equal(res.status, 502)
})
