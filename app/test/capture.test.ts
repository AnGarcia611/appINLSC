// Pruebas del formato de captura y del procesamiento del dataset.   npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { PACKAGE_FORMAT, PACKAGE_VERSION, decodeFrame, encodeFrame, validatePackage, type CapturePackage, type Take } from "../src/capture/format.ts"
import { buildTemplates, report, selectPackages } from "../src/capture/dataset.ts"
import { NumberRecognizer } from "../src/vision/numbers.ts"
import { SHAPES, frame, hand, sequence, type Curl } from "./hands.ts"

function take(label: string, curl: Curl, seed: number): Take {
  const frames = sequence(20, () => hand(curl, { jitter: 0.002, seed })).map((f) => encodeFrame(f, 0))
  return { id: `${label}-${seed}`, task: `num-${label}`, label, variant: false, at: "2026-10-03T00:00:00Z", durationMs: 950, fps: 20, handRatio: 1, frames }
}

function pkg(code: string, takes: Take[], over: Partial<CapturePackage> = {}): CapturePackage {
  return {
    format: PACKAGE_FORMAT, version: PACKAGE_VERSION, id: `id-${code}`, createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T01:00:00Z",
    app: { mediapipe: "0.10.35", models: {} }, camera: { width: 1280, height: 720 },
    consent: { version: "v1", acceptedAt: "2026-10-03T00:00:00Z", training: true, evaluation: true },
    signer: { code, profile: { mano: "derecha" } }, validations: [], takes, trials: [], ...over,
  }
}

test("codificar y decodificar un fotograma conserva los puntos (4 decimales)", () => {
  const f = frame(1234.5, hand(SHAPES[3]))
  const back = decodeFrame(encodeFrame(f, 1000))
  assert.equal(back.t, 235)
  assert.equal(back.hands[0].points.length, 21)
  back.hands[0].points.forEach((p, i) => assert.ok(Math.abs(p.x - f.hands[0].points[i].x) < 1e-4))
  assert.equal(back.pose!.length, 25)
})

test("validatePackage rechaza paquetes ajenos o incompletos", () => {
  assert.deepEqual(validatePackage(pkg("S-AAAA", [take("1", SHAPES[1], 1)])), [])
  assert.ok(validatePackage({ hola: 1 }).length > 0)
  assert.ok(validatePackage({ ...pkg("S-AAAA", []), consent: undefined }).length > 0)
})

test("selectPackages se queda con la versión más reciente de un paquete reenviado", () => {
  const a = pkg("S-AAAA", [take("1", SHAPES[1], 1)])
  const b = { ...a, updatedAt: "2026-10-04T00:00:00Z", takes: [...a.takes, take("2", SHAPES[2], 2)] }
  const { ok, rejected } = selectPackages([{ file: "a", data: a }, { file: "b", data: b }, { file: "x", data: {} }])
  assert.equal(ok.length, 1)
  assert.equal(ok[0].pkg.takes.length, 2)
  assert.equal(rejected.length, 1)
})

test("plantillas: solo de quien autoriza entrenar, sin datos personales, y el reconocedor sigue acertando con ellas", () => {
  const takes = [1, 2, 3, 4, 5].flatMap((n) => [take(String(n), SHAPES[n], n), take(String(n + 5 > 9 ? n : n + 5), SHAPES[n], n + 10)])
  const file = buildTemplates([pkg("S-AAAA", takes), pkg("S-BBBB", takes, { id: "otro", consent: { version: "v1", acceptedAt: "x", training: false, evaluation: true } })])
  assert.equal(file.signers, 1)
  assert.ok(file.templates.length >= 20)
  assert.ok(file.templates.every((t) => t.label >= 1 && t.label <= 5 && t.v.length === 20))
  assert.ok(!JSON.stringify(file).includes("S-AAAA"))

  for (const n of [1, 2, 3, 4, 5]) {
    const r = new NumberRecognizer({ templates: file.templates })
    const out = sequence(30, () => hand(SHAPES[n], { rotation: 0.2 })).map((f) => r.push(f)).filter(Boolean)
    assert.equal(out[0]?.value, n)
  }
})

test("el informe resume tomas, señantes y pruebas", () => {
  const p = pkg("S-AAAA", [take("7", SHAPES[2], 1)], {
    trials: [{ task: "número", expected: "7", predicted: "2", confidence: 80, correct: false, at: "x" }],
    validations: [{ task: "num-7", matches: false, comment: "con la palma adentro", at: "x" }],
  })
  const text = report([p])
  assert.match(text, /Tomas: 1/)
  assert.match(text, /7→2/)
  assert.match(text, /con la palma adentro/)
})
